import * as Y from 'yjs';

import type { SchemaRegistry } from '@inkbrick/document';

import { fromBase64, toBase64 } from './base64';
import { Collab, REMOTE_ORIGIN, createCollab } from './bridge';
import { newEditId, type PendingStore, type StoredEdit } from './pending';

/** Where the Rabbit Hole API is and who the user is. */
export interface DocumentApi {
  /** For example `https://api.example.com` (no trailing slash needed). */
  baseUrl: string;
  /** Called for every request and every reconnect, so a refreshed token is picked up. */
  getToken: () => string | Promise<string>;
  fetch?: typeof fetch;
}

export interface PublicUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
}

/** One other connection to the document, as the server reports it. */
export interface RemotePeer {
  conn: number;
  user: PublicUser;
  canWrite: boolean;
  /** The state the peer set with `setAwareness` (cursor, color, ...); `null` when none. */
  state: unknown;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'closed';

export class DocumentApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentApiError';
  }
}

const api = (options: DocumentApi): string => options.baseUrl.replace(/\/+$/, '') + '/api/v1';

async function request<T>(options: DocumentApi, method: string, path: string): Promise<T> {
  const call = options.fetch ?? fetch;
  const response = await call(api(options) + path, {
    method,
    headers: { Authorization: `Bearer ${await options.getToken()}` },
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string };
  };

  if (!response.ok || body.data === undefined) {
    const code = body.error?.code ?? 'REQUEST_FAILED';

    throw new DocumentApiError(
      response.status,
      code,
      `${method} ${path}: ${response.status} ${code}`,
    );
  }

  return body.data;
}

interface StateResponse {
  format: number;
  snapshot_seq: number;
  snapshot: string;
  updates: Array<{ seq: number; update: string }>;
  last_seq: number;
}

/**
 * Loads the state of a document (`GET /documents/{id}/state`) into a Y.Doc: the compacted snapshot, then the
 * updates after it. Returns the number of the last update, which the connection uses as `since`.
 */
export async function loadDocument(
  options: DocumentApi,
  documentId: number,
  ydoc: Y.Doc = new Y.Doc(),
): Promise<{ ydoc: Y.Doc; lastSeq: number }> {
  const state = await request<StateResponse>(options, 'GET', `/documents/${documentId}/state`);

  ydoc.transact(() => {
    Y.applyUpdate(ydoc, fromBase64(state.snapshot), REMOTE_ORIGIN);

    for (const item of state.updates) Y.applyUpdate(ydoc, fromBase64(item.update), REMOTE_ORIGIN);
  }, REMOTE_ORIGIN);

  return { ydoc, lastSeq: state.last_seq };
}

export interface ConnectionOptions extends DocumentApi {
  documentId: number;
  collab: Collab;
  /** Number of the last update already in the Y.Doc (from `loadDocument`). */
  lastSeq: number;
  /** Constructor of WebSocket; the global one by default. */
  WebSocket?: typeof WebSocket;
  /** Reconnect delays in ms (doubled after every failure, with jitter). */
  backoff?: { min: number; max: number };
  /** Shortest interval between two awareness frames, ms. */
  awarenessEvery?: number;
  /**
   * Shortest interval between two `update` frames, ms (150 by default). Edits made in between are merged into one
   * frame, so fast typing stays far below the server's budget of updates per minute.
   */
  sendEvery?: number;
  /** Called for refusals that lose data or stop the connection. The connection stays usable unless it says so. */
  onError?: (error: Error) => void;
  /**
   * Keeps the edits the server has not acknowledged yet, so they survive a reload of the page. Edits found in it at
   * start (`restored`) are sent after the first connect.
   */
  pendingStore?: PendingStore;
  /** Edits read from `pendingStore` and already applied to the Y.Doc (see `openDocument`). */
  restored?: StoredEdit[];
}

type Listener = () => void;

type Pending = StoredEdit;

interface ServerFrame {
  type: string;
  [key: string]: unknown;
}

const MAX_TOUCHED = 200;
const MAX_MERGED_BYTES = 400 * 1024;
const COMPACT_AT = 50;
/** The largest update the server stores (`MaxDocumentUpdateBytes`). A larger one is never sent. */
const MAX_UPDATE_BYTES = 512 * 1024;
const SEND_EVERY = 150;
const MAX_HOLD_SECONDS = 60;

/**
 * The connection of one Collab to the document room of the server.
 *
 * - local updates are sent as `update` frames and kept until the server acknowledges them, so edits made offline
 *   (or lost in a dropped connection) are sent again after the reconnect; Yjs updates are idempotent;
 * - updates of others go through `collab.receive` (held while an IME composition is in progress);
 * - after a reconnect the server sends what happened after the last update this client received (`since`);
 * - presence (who is here, their awareness state) is kept in `peers`.
 */
export class DocumentConnection {
  status: ConnectionStatus = 'idle';

  /** False for a viewer (only `doc.read`): their edits are not sent. Known after the first `ready`. */
  canWrite = true;

  peers: RemotePeer[] = [];

  /** This connection's own identity as the server sees it. */
  self: { conn: number; user: PublicUser } | undefined;

  private socket: WebSocket | undefined;

  private attempt = 0;

  private failures = 0;

  /** The ticket request of the current attempt is in flight (the socket does not exist yet). */
  private ticketing = false;

  /** A 401 was already reported; the next report waits for a successful ticket. */
  private unauthorized = false;

  private lastRemoteSeq: number;

  private pending: Pending[] = [];

  private writes: Promise<void> = Promise.resolve();

  private awareness: unknown = null;

  private awarenessTimer: ReturnType<typeof setTimeout> | undefined;

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  /** Edits already sent over the current socket and waiting for their acknowledgement. */
  private readonly sent = new Set<string>();

  private sendTimer: ReturnType<typeof setTimeout> | undefined;

  private lastSendAt = 0;

  /** Until this moment (ms) the server refuses updates of this user: nothing is sent, edits wait in the queue. */
  private holdUntil = 0;

  private readonly listeners = new Set<Listener>();

  private readonly stopLocal: () => void;

  private readonly peerMap = new Map<number, RemotePeer>();

  constructor(private readonly options: ConnectionOptions) {
    this.lastRemoteSeq = options.lastSeq;
    this.pending = [...(options.restored ?? [])];
    this.stopLocal = options.collab.onLocalUpdate((update, meta) =>
      this.queue(update, meta.touched),
    );
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Opens the connection (and keeps it open, reconnecting after failures) until `close`. */
  connect(): void {
    // An attempt or a socket exists already: a second one would leak the first.
    if (this.socket || this.ticketing) return;

    if (this.status === 'closed') this.status = 'idle';

    clearTimeout(this.reconnectTimer);
    void this.open();
  }

  close(): void {
    this.attempt++;
    this.ticketing = false;
    this.setStatus('closed');
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.awarenessTimer);
    this.awarenessTimer = undefined;
    this.stopSending();
    this.socket?.close(1000, 'client closed');
    this.socket = undefined;
  }

  destroy(): void {
    this.close();
    this.stopLocal();
    this.listeners.clear();
  }

  /** Sets what other people see of this connection (cursor, selection, color); `null` clears it. */
  setAwareness(state: unknown): void {
    this.awareness = state;

    if (this.awarenessTimer) return;

    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = undefined;
      this.send({ type: 'awareness', state: this.awareness });
    }, this.options.awarenessEvery ?? 50);
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;

    this.status = status;
    this.emit();
  }

  private fail(error: Error): void {
    this.options.onError?.(error);
  }

  private send(frame: object): boolean {
    if (this.socket?.readyState !== 1) return false;

    this.socket.send(JSON.stringify(frame));

    return true;
  }

  /** Runs a write to the pending store after the previous one, so that a record is stored before it is removed. */
  private persist(write: (store: PendingStore) => Promise<void>): void {
    const store = this.options.pendingStore;

    if (!store) return;

    this.writes = this.writes
      .then(() => write(store))
      .catch((error: unknown) => {
        this.fail(
          new DocumentApiError(
            0,
            'PENDING_STORE_FAILED',
            `cannot save unsent edits: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      });
  }

  /** True while the server's rate limit holds the edits back; they are sent by themselves when it ends. */
  get throttled(): boolean {
    return this.holdUntil > Date.now();
  }

  /** How many edits the server has not acknowledged yet (kept in the pending store, when there is one). */
  get unsent(): number {
    return this.pending.length;
  }

  /** Resolves when every change of the unsent edits has been written to the pending store. */
  saved(): Promise<void> {
    return this.writes;
  }

  /** Forgets the unsent edits, here and in the store (for example when the user signs out). */
  async discardPending(): Promise<void> {
    this.pending = [];
    this.persist((store) => store.clear());
    this.emit();
    await this.writes;
  }

  private drop(id: string): void {
    this.pending = this.pending.filter((item) => item.id !== id);
    this.sent.delete(id);
    this.persist((store) => store.remove([id]));
    this.emit();
  }

  private queue(update: Uint8Array, touched: string[]): void {
    // Edits made while the connection is closed or down are kept and sent after the next `ready`.
    if (!this.canWrite) return;

    const item: Pending = { id: newEditId(), update, touched: touched.slice(0, MAX_TOUCHED) };

    this.pending.push(item);
    this.persist((store) => store.put(item));
    this.emit();

    // A long offline stretch must not grow the stored list without bound: small edits are merged into one.
    if (this.socket?.readyState !== 1 && this.pending.length >= COMPACT_AT)
      this.merge(this.pending);

    this.pump();
  }

  private stopSending(): void {
    clearTimeout(this.sendTimer);
    this.sendTimer = undefined;
    this.sent.clear();
  }

  /**
   * Sends the edits that were not sent over this socket yet. At most one batch goes out per `sendEvery`, and none
   * while the server's rate limit holds; what gathers meanwhile is merged into one update. Order is kept: an edit
   * builds on the ones before it, so they never overtake each other.
   */
  private pump(): void {
    if (this.status !== 'online' || !this.canWrite || this.socket?.readyState !== 1) return;

    const now = Date.now();
    const every = this.options.sendEvery ?? SEND_EVERY;
    const wait = Math.max(this.holdUntil - now, this.lastSendAt + every - now);

    if (wait > 0) {
      if (!this.sendTimer) {
        this.sendTimer = setTimeout(() => {
          this.sendTimer = undefined;
          this.pump();
          this.emit();
        }, wait);
      }

      return;
    }

    const unsent = this.merge(this.pending.filter((item) => !this.sent.has(item.id)));

    if (unsent.length === 0) return;

    this.lastSendAt = now;

    for (const item of unsent) {
      if (item.update.length > MAX_UPDATE_BYTES) {
        // The server would refuse it, or close the socket when the frame is over its limit, again after every
        // reconnect. It is dropped here instead and reported.
        this.drop(item.id);
        this.fail(
          new DocumentApiError(
            413,
            'UPDATE_TOO_LARGE',
            `an edit of ${item.update.length} bytes is larger than the server accepts (${MAX_UPDATE_BYTES}) and was not sent`,
          ),
        );
        continue;
      }

      this.sent.add(item.id);
      this.send({
        type: 'update',
        update: toBase64(item.update),
        touched: item.touched,
        ref: item.id,
      });
    }
  }

  /**
   * Merges the given edits (a run of `pending`) into one when the result is small enough for the server to accept.
   * Returns what is left of them: the merged edit, or the same edits when they cannot be merged.
   */
  private merge(items: Pending[]): Pending[] {
    if (items.length < 2) return items;

    const merged = Y.mergeUpdates(items.map((item) => item.update));

    if (merged.length > MAX_MERGED_BYTES) return items;

    const replaced = new Set(items.map((item) => item.id));
    const item: Pending = {
      id: newEditId(),
      update: merged,
      touched: [...new Set(items.flatMap((edit) => edit.touched))].slice(0, MAX_TOUCHED),
    };
    const at = this.pending.findIndex((edit) => replaced.has(edit.id));

    this.pending = this.pending.filter((edit) => !replaced.has(edit.id));
    this.pending.splice(at, 0, item);

    for (const id of replaced) this.sent.delete(id);

    // The merged record is stored before the old ones are removed: a crash in between loses nothing.
    this.persist(async (store) => {
      await store.put(item);
      await store.remove([...replaced]);
    });

    return [item];
  }

  /** After a reconnect everything not yet acknowledged is sent again, merged into one update when it is small. */
  private resend(): void {
    this.sent.clear();
    this.lastSendAt = 0;
    this.pump();
  }

  private async open(): Promise<void> {
    const attempt = ++this.attempt;

    this.releaseSocket();
    this.ticketing = true;
    this.setStatus(this.failures > 0 ? 'reconnecting' : 'connecting');

    let ticket: string;

    try {
      const issued = await request<{ ticket: string }>(
        this.options,
        'POST',
        `/documents/${this.options.documentId}/events/ticket`,
      );

      ticket = issued.ticket;
    } catch (error) {
      if (attempt !== this.attempt) return;

      this.ticketing = false;

      // 401 is most likely an expired token: `getToken` may return a fresh one on the next attempt.
      if (error instanceof DocumentApiError && error.status === 401) {
        if (!this.unauthorized) this.fail(error);

        this.unauthorized = true;
        this.scheduleReconnect();
        return;
      }

      if (error instanceof DocumentApiError && [400, 403, 404].includes(error.status)) {
        this.fail(error);
        this.setStatus('closed');
        return;
      }

      this.scheduleReconnect();

      return;
    }

    if (attempt !== this.attempt) return;

    this.ticketing = false;
    this.unauthorized = false;

    const base = api(this.options).replace(/^http/, 'ws');
    const url = `${base}/documents/${this.options.documentId}/events?ticket=${encodeURIComponent(ticket)}&since=${this.lastRemoteSeq}`;
    const Socket = this.options.WebSocket ?? WebSocket;
    const socket = new Socket(url);

    this.socket = socket;

    socket.onmessage = (event: MessageEvent) => {
      if (attempt !== this.attempt) return;

      try {
        this.handle(JSON.parse(String(event.data)) as ServerFrame);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    };

    socket.onclose = (event: CloseEvent) => {
      if (attempt !== this.attempt) return;

      this.socket = undefined;
      this.stopSending();
      this.peerMap.clear();
      this.peers = [];
      this.self = undefined;

      if (event.code === 1008 && event.reason === 'access revoked') {
        this.fail(
          new DocumentApiError(403, 'ACCESS_REVOKED', 'access to the document was revoked'),
        );
        this.setStatus('closed');
        return;
      }

      if (event.reason === 'document deleted') {
        this.fail(new DocumentApiError(404, 'DOCUMENT_NOT_FOUND', 'the document was deleted'));
        this.setStatus('closed');
        return;
      }

      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // The close event follows and drives the reconnect.
    };
  }

  /** Closes the previous socket (if any) and detaches its handlers, so it can neither deliver nor reconnect. */
  private releaseSocket(): void {
    const socket = this.socket;

    if (!socket) return;

    this.socket = undefined;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close(1000, 'reconnect');
  }

  private scheduleReconnect(): void {
    this.failures++;
    this.setStatus('reconnecting');

    const { min, max } = this.options.backoff ?? { min: 500, max: 15000 };
    const delay = Math.min(max, min * 2 ** (this.failures - 1)) * (0.5 + Math.random() / 2);

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => void this.open(), delay);
  }

  private publishPeers(): void {
    this.peers = [...this.peerMap.values()].sort((a, b) => a.conn - b.conn);
    this.emit();
  }

  private handle(frame: ServerFrame): void {
    switch (frame.type) {
      case 'ready': {
        this.failures = 0;
        this.canWrite = frame.can_write === true;
        this.self = { conn: frame.conn as number, user: frame.user as PublicUser };
        this.peerMap.clear();

        for (const peer of frame.peers as Array<{
          conn: number;
          user: PublicUser;
          can_write: boolean;
          state: unknown;
        }>) {
          this.peerMap.set(peer.conn, {
            conn: peer.conn,
            user: peer.user,
            canWrite: peer.can_write,
            state: peer.state,
          });
        }

        this.setStatus('online');
        this.publishPeers();

        if (this.canWrite) {
          this.resend();
        } else {
          // A viewer's edits are never sent, so they are not kept either.
          const dropped = this.pending.map((item) => item.id);

          this.pending = [];
          this.persist((store) => store.remove(dropped));
          this.emit();
        }

        if (this.awareness !== null) this.send({ type: 'awareness', state: this.awareness });

        return;
      }

      case 'update': {
        this.lastRemoteSeq = Math.max(this.lastRemoteSeq, frame.seq as number);
        this.options.collab.receive(fromBase64(frame.update as string));

        return;
      }

      case 'synced': {
        this.lastRemoteSeq = Math.max(this.lastRemoteSeq, frame.last_seq as number);

        return;
      }

      case 'resync': {
        // The history this client needs was compacted: reload the state, then connect again from its number.
        const attempt = this.attempt;

        this.socket?.close(1000, 'resync');
        this.socket = undefined;
        this.stopSending();
        this.attempt++;

        void loadDocument(this.options, this.options.documentId, this.options.collab.ydoc)
          .then(({ lastSeq }) => {
            if (attempt + 1 !== this.attempt) return;

            this.lastRemoteSeq = Math.max(this.lastRemoteSeq, lastSeq);
            void this.open();
          })
          .catch((error: unknown) => {
            // Closed or reconnected meanwhile: nothing to retry.
            if (attempt + 1 !== this.attempt) return;

            this.fail(error instanceof Error ? error : new Error(String(error)));
            this.scheduleReconnect();
          });

        return;
      }

      case 'ack': {
        this.drop(frame.ref as string);

        return;
      }

      case 'peer_joined': {
        this.peerMap.set(frame.conn as number, {
          conn: frame.conn as number,
          user: frame.user as PublicUser,
          canWrite: frame.can_write === true,
          state: null,
        });
        this.publishPeers();

        return;
      }

      case 'awareness': {
        const peer = this.peerMap.get(frame.conn as number);

        if (peer) {
          peer.state = frame.state;
        } else {
          this.peerMap.set(frame.conn as number, {
            conn: frame.conn as number,
            user: frame.user as PublicUser,
            canWrite: true,
            state: frame.state,
          });
        }

        this.publishPeers();

        return;
      }

      case 'peer_left': {
        this.peerMap.delete(frame.conn as number);
        this.publishPeers();

        return;
      }

      case 'error': {
        const code = frame.code as string;
        const ref = frame.ref as string | undefined;

        if (code === 'RATE_LIMITED') {
          // Nothing is lost: the edits stay in the queue and go out again, merged, when the server allows.
          // Everything unacknowledged is sent again then, because later edits build on the refused one.
          const seconds =
            typeof frame.retry_after === 'number' && frame.retry_after > 0 ? frame.retry_after : 1;
          const already = this.throttled;

          this.holdUntil = Date.now() + Math.min(seconds, MAX_HOLD_SECONDS) * 1000;
          this.sent.clear();
          clearTimeout(this.sendTimer);
          this.sendTimer = undefined;
          this.pump();

          // One report per pause, not one per refused frame.
          if (!already) {
            this.fail(
              new DocumentApiError(
                429,
                code,
                `the server limits how often edits are sent; they will be sent in ${seconds} s`,
              ),
            );
          }

          this.emit();

          return;
        }

        // A refused update will be refused again: drop it instead of sending it on every reconnect.
        if (
          ref &&
          (code === 'UPDATE_TOO_LARGE' || code === 'INVALID_UPDATE' || code === 'FORBIDDEN')
        ) {
          this.drop(ref);
        }

        if (code === 'FORBIDDEN') this.canWrite = false;

        this.fail(new DocumentApiError(400, code, `the server refused a message: ${code}`));
        this.emit();

        return;
      }

      default:
    }
  }
}

export interface OpenDocumentOptions extends DocumentApi {
  documentId: number;
  schema: SchemaRegistry;
  undoCaptureMs?: number;
  WebSocket?: typeof WebSocket;
  backoff?: { min: number; max: number };
  awarenessEvery?: number;
  sendEvery?: number;
  onError?: (error: Error) => void;
  /**
   * Keeps unsent edits across reloads. Edits left in it by an earlier page are applied to the document before the
   * editor is created, so the person sees their own work again, and are sent after the first connect.
   */
  pendingStore?: PendingStore;
}

/**
 * Applies the edits an earlier page left in the store to the Y.Doc and returns them as the new unsent queue.
 * An edit the server already has (its acknowledgement was lost) is dropped instead of being sent again.
 */
async function restorePending(
  ydoc: Y.Doc,
  store: PendingStore,
  onError?: (error: Error) => void,
): Promise<StoredEdit[]> {
  let stored: StoredEdit[];

  try {
    stored = await store.list();
  } catch (error) {
    onError?.(
      new DocumentApiError(
        0,
        'PENDING_STORE_FAILED',
        `cannot read unsent edits: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );

    return [];
  }

  const kept: StoredEdit[] = [];
  const contained: string[] = [];

  for (const edit of stored) {
    const valid =
      typeof edit?.id === 'string' &&
      edit.update instanceof Uint8Array &&
      Array.isArray(edit.touched);

    if (!valid) {
      if (typeof edit?.id === 'string') contained.push(edit.id);

      continue;
    }

    try {
      // `diffUpdate` leaves nothing but an empty update (two bytes) when the document already has all of it.
      if (Y.diffUpdate(edit.update, Y.encodeStateVector(ydoc)).length <= 2) {
        contained.push(edit.id);
        continue;
      }

      Y.applyUpdate(ydoc, edit.update, REMOTE_ORIGIN);
      kept.push(edit);
    } catch {
      // Not a Yjs update (damaged storage): forget it instead of sending it to everyone.
      contained.push(edit.id);
    }
  }

  if (contained.length > 0) await store.remove(contained).catch(() => undefined);

  return kept;
}

/**
 * Loads a document from the server and returns its `Collab` and the (not yet connected) connection.
 * The editor is created after this: `new Editor({ document: collab.createDocument(), history: { limit: 0 } })`,
 * `collab.attach(editor.store)`, then `connection.connect()`.
 */
export async function openDocument(
  options: OpenDocumentOptions,
): Promise<{ collab: Collab; connection: DocumentConnection }> {
  const { ydoc, lastSeq } = await loadDocument(options, options.documentId);
  const restored = options.pendingStore
    ? await restorePending(ydoc, options.pendingStore, options.onError)
    : [];
  const collab = createCollab({
    ydoc,
    schema: options.schema,
    undoCaptureMs: options.undoCaptureMs,
  });
  const connection = new DocumentConnection({ ...options, collab, lastSeq, restored });

  return { collab, connection };
}
