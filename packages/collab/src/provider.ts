import * as Y from 'yjs';

import type { SchemaRegistry } from '@inkbrick/document';

import { fromBase64, toBase64 } from './base64';
import { Collab, REMOTE_ORIGIN, createCollab } from './bridge';

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
  /** Called for refusals that lose data or stop the connection. The connection stays usable unless it says so. */
  onError?: (error: Error) => void;
}

type Listener = () => void;

interface Pending {
  refs: string[];
  update: Uint8Array;
  touched: string[];
}

interface ServerFrame {
  type: string;
  [key: string]: unknown;
}

const MAX_TOUCHED = 200;
const MAX_MERGED_BYTES = 400 * 1024;

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

  private lastRemoteSeq: number;

  private pending: Pending[] = [];

  private refCounter = 0;

  private awareness: unknown = null;

  private awarenessTimer: ReturnType<typeof setTimeout> | undefined;

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly listeners = new Set<Listener>();

  private readonly stopLocal: () => void;

  private readonly peerMap = new Map<number, RemotePeer>();

  constructor(private readonly options: ConnectionOptions) {
    this.lastRemoteSeq = options.lastSeq;
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
    if (this.status === 'closed') this.status = 'idle';

    void this.open();
  }

  close(): void {
    this.attempt++;
    this.setStatus('closed');
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.awarenessTimer);
    this.awarenessTimer = undefined;
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

  private queue(update: Uint8Array, touched: string[]): void {
    // Edits made while the connection is closed or down are kept and sent after the next `ready`.
    if (!this.canWrite) return;

    this.refCounter++;

    const item: Pending = {
      refs: [String(this.refCounter)],
      update,
      touched: touched.slice(0, MAX_TOUCHED),
    };

    this.pending.push(item);
    this.flush(item);
  }

  private flush(item: Pending): void {
    this.send({
      type: 'update',
      update: toBase64(item.update),
      touched: item.touched,
      ref: item.refs[0],
    });
  }

  /** After a reconnect everything not yet acknowledged is sent again, merged into one update when it is small. */
  private resend(): void {
    if (this.pending.length > 1) {
      const merged = Y.mergeUpdates(this.pending.map((item) => item.update));

      if (merged.length <= MAX_MERGED_BYTES) {
        this.pending = [
          {
            refs: this.pending.flatMap((item) => item.refs),
            update: merged,
            touched: [...new Set(this.pending.flatMap((item) => item.touched))].slice(
              0,
              MAX_TOUCHED,
            ),
          },
        ];
      }
    }

    for (const item of this.pending) this.flush(item);
  }

  private async open(): Promise<void> {
    const attempt = ++this.attempt;

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

      if (error instanceof DocumentApiError && [400, 401, 403, 404].includes(error.status)) {
        this.fail(error);
        this.setStatus('closed');
        return;
      }

      this.scheduleReconnect();

      return;
    }

    if (attempt !== this.attempt) return;

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

        if (this.canWrite) this.resend();
        else this.pending = [];

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
        this.attempt++;

        void loadDocument(this.options, this.options.documentId, this.options.collab.ydoc)
          .then(({ lastSeq }) => {
            if (attempt + 1 !== this.attempt) return;

            this.lastRemoteSeq = Math.max(this.lastRemoteSeq, lastSeq);
            void this.open();
          })
          .catch((error: unknown) => {
            this.fail(error instanceof Error ? error : new Error(String(error)));
            this.scheduleReconnect();
          });

        return;
      }

      case 'ack': {
        const ref = frame.ref as string;

        this.pending = this.pending.filter((item) => !item.refs.includes(ref));

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

        // A refused update will be refused again: drop it instead of sending it on every reconnect.
        if (
          ref &&
          (code === 'UPDATE_TOO_LARGE' || code === 'INVALID_UPDATE' || code === 'FORBIDDEN')
        ) {
          this.pending = this.pending.filter((item) => !item.refs.includes(ref));
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
  onError?: (error: Error) => void;
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
  const collab = createCollab({
    ydoc,
    schema: options.schema,
    undoCaptureMs: options.undoCaptureMs,
  });
  const connection = new DocumentConnection({ ...options, collab, lastSeq });

  return { collab, connection };
}
