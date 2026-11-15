import * as Y from 'yjs';

import { fromBase64, toBase64 } from '../src';

/**
 * A small stand-in for the Rabbit Hole server: the REST state, tickets and the WebSocket room with the same frames
 * as the real one. It stores update bytes and never decodes them, like the real server.
 */
export interface FakeUser {
  id: number;
  username: string;
  canWrite: boolean;
}

interface Stored {
  seq: number;
  update: Uint8Array;
  userId: number;
}

export class FakeServer {
  snapshot: Uint8Array;

  snapshotSeq = 0;

  updates: Stored[] = [];

  lastSeq = 0;

  readonly users = new Map<string, FakeUser>();

  readonly sockets = new Set<FakeWebSocket>();

  /** Ticket requests answered with this status (for example 403) instead of a ticket. */
  ticketStatus = 200;

  maxUpdateBytes = 512 * 1024;

  /** How many more updates are accepted before RATE_LIMITED is answered (like the per-user budget). */
  budget = Infinity;

  /** `retry_after` of the RATE_LIMITED answer, seconds. */
  retryAfter = 1;

  /** Store updates but never acknowledge them (the acknowledgement is lost on the way). */
  dropAcks = false;

  private tickets = new Map<string, string>();

  private nextConn = 0;

  private nextTicket = 0;

  constructor(initial: Uint8Array) {
    this.snapshot = initial;
  }

  addUser(token: string, user: FakeUser): void {
    this.users.set(token, user);
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const token = String((init?.headers as Record<string, string>).Authorization).replace(
      'Bearer ',
      '',
    );
    const user = this.users.get(token);
    const json = (status: number, body: unknown): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    if (!user) return json(401, { error: { code: 'UNAUTHORIZED' } });

    if (url.pathname.endsWith('/events/ticket')) {
      if (this.ticketStatus !== 200)
        return json(this.ticketStatus, { error: { code: 'FORBIDDEN' } });

      const ticket = `ticket-${++this.nextTicket}`;

      this.tickets.set(ticket, token);

      return json(200, { data: { ticket } });
    }

    if (url.pathname.endsWith('/state')) {
      return json(200, {
        data: {
          format: 1,
          snapshot_seq: this.snapshotSeq,
          snapshot: toBase64(this.snapshot),
          updates: this.updates
            .filter((item) => item.seq > this.snapshotSeq)
            .map((item) => ({ seq: item.seq, update: toBase64(item.update) })),
          last_seq: this.lastSeq,
          needs_compaction: false,
        },
      });
    }

    return json(404, { error: { code: 'NOT_FOUND' } });
  };

  /** The WebSocket constructor to pass to the provider. */
  get WebSocket(): typeof WebSocket {
    const create = (url: string): FakeWebSocket => new FakeWebSocket(this, url);

    // `new Socket(url)` returns the object a constructor function returns.
    return function Socket(url: string) {
      return create(url);
    } as unknown as typeof WebSocket;
  }

  /** Merges the history into a new snapshot, like a client compacting it. */
  compact(): void {
    this.snapshot = Y.mergeUpdates([this.snapshot, ...this.updates.map((item) => item.update)]);
    this.snapshotSeq = this.lastSeq;
    this.updates = [];
  }

  /** An update stored by someone not connected (the REST API). */
  store(userId: number, update: Uint8Array): number {
    this.lastSeq++;
    this.updates.push({ seq: this.lastSeq, update, userId });

    return this.lastSeq;
  }

  redeem(ticket: string): FakeUser | undefined {
    const token = this.tickets.get(ticket);

    this.tickets.delete(ticket);

    return token ? this.users.get(token) : undefined;
  }

  allocate(): number {
    return ++this.nextConn;
  }

  broadcast(frame: object, except?: FakeWebSocket): void {
    for (const socket of this.sockets) if (socket !== except && socket.open) socket.deliver(frame);
  }

  handle(from: FakeWebSocket, frame: Record<string, unknown>): void {
    switch (frame.type) {
      case 'update': {
        if (!from.user.canWrite)
          return from.deliver({ type: 'error', code: 'FORBIDDEN', ref: frame.ref });

        const update = fromBase64(frame.update as string);

        if (update.length > this.maxUpdateBytes) {
          return from.deliver({ type: 'error', code: 'UPDATE_TOO_LARGE', ref: frame.ref });
        }

        if (this.budget <= 0) {
          return from.deliver({
            type: 'error',
            code: 'RATE_LIMITED',
            ref: frame.ref,
            retry_after: this.retryAfter,
          });
        }

        this.budget--;

        const seq = this.store(from.user.id, update);

        if (!this.dropAcks) from.deliver({ type: 'ack', ref: frame.ref, seq });
        this.broadcast({ type: 'update', seq, user_id: from.user.id, update: frame.update }, from);

        return undefined;
      }

      case 'awareness':
        from.awareness = frame.state ?? null;
        this.broadcast(
          { type: 'awareness', conn: from.conn, user: from.publicUser(), state: from.awareness },
          from,
        );

        return undefined;

      default:
        return undefined;
    }
  }
}

export class FakeWebSocket {
  readyState = 0;

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: string }) => void) | null = null;

  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  onerror: (() => void) | null = null;

  conn = 0;

  user!: FakeUser;

  awareness: unknown = null;

  readonly received: Array<Record<string, unknown>> = [];

  constructor(
    private readonly server: FakeServer,
    url: string,
  ) {
    queueMicrotask(() => this.accept(new URL(url)));
  }

  get open(): boolean {
    return this.readyState === 1;
  }

  publicUser() {
    return {
      id: this.user.id,
      username: this.user.username,
      first_name: '',
      last_name: '',
      avatar_url: '',
    };
  }

  private accept(url: URL): void {
    const user = this.server.redeem(url.searchParams.get('ticket') ?? '');

    if (!user) {
      this.readyState = 3;
      this.onclose?.({ code: 1006, reason: '' });

      return;
    }

    this.user = user;
    this.conn = this.server.allocate();
    this.readyState = 1;

    const peers = [...this.server.sockets].map((other) => ({
      conn: other.conn,
      user: other.publicUser(),
      can_write: other.user.canWrite,
      state: other.awareness,
    }));

    this.server.sockets.add(this);
    this.deliver({
      type: 'ready',
      conn: this.conn,
      user: this.publicUser(),
      can_write: user.canWrite,
      peers,
    });
    this.server.broadcast(
      { type: 'peer_joined', conn: this.conn, user: this.publicUser(), can_write: user.canWrite },
      this,
    );

    const since = Number(url.searchParams.get('since') ?? 'NaN');

    if (!Number.isNaN(since)) {
      if (since < this.server.snapshotSeq) {
        this.deliver({ type: 'resync', reason: 'snapshot' });
      } else {
        for (const item of this.server.updates) {
          if (item.seq > since) {
            this.deliver({
              type: 'update',
              seq: item.seq,
              user_id: item.userId,
              update: toBase64(item.update),
            });
          }
        }

        this.deliver({ type: 'synced', last_seq: this.server.lastSeq });
      }
    }
  }

  deliver(frame: object): void {
    queueMicrotask(() => {
      if (this.open) this.onmessage?.({ data: JSON.stringify(frame) });
    });
  }

  send(raw: string): void {
    const frame = JSON.parse(raw) as Record<string, unknown>;

    this.received.push(frame);
    queueMicrotask(() => {
      if (this.open) this.server.handle(this, frame);
    });
  }

  /** The client closes. */
  close(code = 1000, reason = ''): void {
    this.end(code, reason);
  }

  /** The server or the network ends the connection. */
  drop(code = 1006, reason = ''): void {
    this.end(code, reason);
  }

  private end(code: number, reason: string): void {
    if (this.readyState === 3) return;

    this.readyState = 3;
    this.server.sockets.delete(this);
    this.server.broadcast({ type: 'peer_left', conn: this.conn });
    queueMicrotask(() => this.onclose?.({ code, reason }));
  }
}
