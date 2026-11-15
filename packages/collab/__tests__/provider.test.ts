import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { Editor } from '@inkbrick/engine';

import {
  DocumentConnection,
  createCollab,
  loadDocument,
  openDocument,
  type Collab,
  type DocumentApi,
} from '../src';
import { FakeServer } from './fakeServer';
import { createServerState, firstParagraph, schema } from './harness';

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, label: string, timeout = 2000): Promise<void> {
  const deadline = Date.now() + timeout;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);

    await tick(5);
  }
}

interface Client {
  collab: Collab;
  editor: Editor;
  connection: DocumentConnection;
  errors: Error[];
  text: () => string;
  type: (text: string, at?: number) => void;
}

const opened: DocumentConnection[] = [];

afterEach(() => {
  for (const connection of opened.splice(0)) connection.destroy();
});

function newServer(): FakeServer {
  const server = new FakeServer(createServerState());

  server.addUser('ann', { id: 1, username: 'ann', canWrite: true });
  server.addUser('bob', { id: 2, username: 'bob', canWrite: true });
  server.addUser('guest', { id: 3, username: 'guest', canWrite: false });

  return server;
}

async function client(
  server: FakeServer,
  token: string,
  connect = true,
  sendEvery?: number,
): Promise<Client> {
  const errors: Error[] = [];
  const { collab, connection } = await openDocument({
    baseUrl: 'http://server.test',
    getToken: () => token,
    fetch: server.fetch as typeof fetch,
    WebSocket: server.WebSocket,
    documentId: 1,
    schema,
    backoff: { min: 5, max: 20 },
    awarenessEvery: 5,
    sendEvery,
    onError: (error) => errors.push(error),
  });
  const editor = new Editor({ schema, document: collab.createDocument(), history: { limit: 0 } });

  collab.attach(editor.store);
  opened.push(connection);

  if (connect) {
    connection.connect();
    await until(() => connection.status === 'online', `${token} to be online`);
  }

  const id = firstParagraph({ editor } as never);

  return {
    collab,
    editor,
    connection,
    errors,
    text: () =>
      editor.store
        .getBlock(id)!
        .content.map((node) => node.insert)
        .join(''),
    type: (text, at = 0) =>
      void editor.dispatch({
        type: 'insertText',
        payload: { text, selection: { anchor: { blockId: id, offset: at } } },
      }),
  };
}

describe('loadDocument', () => {
  it('builds the document from the snapshot and the updates after it', async () => {
    const server = newServer();
    const api: DocumentApi = {
      baseUrl: 'http://server.test/',
      getToken: () => 'ann',
      fetch: server.fetch as typeof fetch,
    };
    const author = await client(server, 'ann', false);

    author.type('stored');
    server.store(1, Y.encodeStateAsUpdate(author.collab.ydoc, Y.encodeStateVector(new Y.Doc())));

    const { ydoc, lastSeq } = await loadDocument(api, 1);

    expect(lastSeq).toBe(1);
    expect(createCollab({ ydoc, schema }).snapshot().rootId).toBe(author.collab.snapshot().rootId);
  });

  it('reports a refused request with its status and code', async () => {
    const server = newServer();

    await expect(
      loadDocument(
        {
          baseUrl: 'http://server.test',
          getToken: () => 'nobody',
          fetch: server.fetch as typeof fetch,
        },
        1,
      ),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });
});

describe('DocumentConnection', () => {
  it('carries edits between two editors through the server', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');
    const bob = await client(server, 'bob');

    ann.type('Hello');
    await until(() => bob.text() === 'Hello', 'bob to receive the edit');

    bob.type('!', 5);
    await until(() => ann.text() === 'Hello!', 'ann to receive the reply');

    expect(ann.collab.inSync() && bob.collab.inSync()).toBe(true);
    expect(server.updates.length).toBeGreaterThan(0);
  });

  it('does not send the same update again once it is acknowledged', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');

    ann.type('x');
    await until(() => server.lastSeq > 0, 'the update to be stored');
    await tick(20);

    const stored = server.lastSeq;

    // Reconnecting must not re-send what the server acknowledged.
    [...server.sockets][0].drop();
    await until(
      () => ann.connection.status === 'online' && server.sockets.size === 1,
      'the reconnect',
    );
    await tick(20);

    expect(server.lastSeq).toBe(stored);
  });

  it('sends the touched blocks with every update', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');
    const frames = (): Array<Record<string, unknown>> => [...server.sockets][0].received;

    ann.type('x');
    await until(() => frames().some((frame) => frame.type === 'update'), 'an update frame');

    const frame = frames().find((item) => item.type === 'update')!;

    expect(frame.touched).toContain(firstParagraph({ editor: ann.editor } as never));
    expect(typeof frame.ref).toBe('string');
  });

  it('keeps edits made while offline and merges the missed ones after the reconnect', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');
    const bob = await client(server, 'bob');

    ann.type('base');
    await until(() => bob.text() === 'base', 'the first edit');

    // Ann loses the connection and keeps typing; Bob edits meanwhile.
    server.ticketStatus = 500;
    [...server.sockets].find((socket) => socket.user.username === 'ann')!.drop();
    await until(() => ann.connection.status === 'reconnecting', 'ann to notice');

    ann.type('A', 0);
    ann.type('B', 5);
    bob.type('Z', 4);
    await until(() => server.updates.some((item) => item.userId === 2), "bob's edit to be stored");

    server.ticketStatus = 200;
    await until(() => ann.connection.status === 'online', 'ann to come back', 3000);
    await until(
      () => ann.text() === bob.text() && ann.text().length === 7,
      'both to converge',
      3000,
    );

    expect(ann.text()).toContain('A');
    expect(ann.text()).toContain('Z');
    expect(ann.text()).toContain('B');
    expect(ann.collab.inSync() && bob.collab.inSync()).toBe(true);
  });

  it('keeps edits made after close() and sends them when connect() is called again', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');
    const bob = await client(server, 'bob');

    ann.connection.close();
    await until(() => ann.connection.status === 'closed', 'ann to be closed');
    ann.type('offline');
    await tick(30);
    expect(bob.text()).toBe('');

    ann.connection.connect();
    await until(() => bob.text() === 'offline', 'the offline edit to reach bob');
  });

  it('reloads the state when the history it needs was compacted', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');
    const bob = await client(server, 'bob');

    ann.type('one');
    await until(() => bob.text() === 'one', 'bob to receive one');

    server.ticketStatus = 500;
    [...server.sockets].find((socket) => socket.user.username === 'bob')!.drop();
    await until(() => bob.connection.status === 'reconnecting', 'bob to notice');

    ann.type('two', 3);
    await until(() => server.lastSeq >= 2, 'the second update to be stored');
    server.compact();
    server.ticketStatus = 200;

    await until(() => bob.text() === 'onetwo', 'bob to reload the compacted state', 3000);
    await until(() => bob.connection.status === 'online', 'bob to be online again', 3000);
    expect(bob.collab.inSync()).toBe(true);
  });

  it('shows who is in the document and what they set as their state', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');

    expect(ann.connection.self?.user.username).toBe('ann');
    expect(ann.connection.peers).toEqual([]);

    const bob = await client(server, 'bob');

    expect(bob.connection.peers.map((peer) => peer.user.username)).toEqual(['ann']);
    await until(() => ann.connection.peers.length === 1, 'ann to see bob');

    bob.connection.setAwareness({ block: 'b1', color: '#f00' });
    bob.connection.setAwareness({ block: 'b2', color: '#f00' });
    await until(
      () => (ann.connection.peers[0].state as { block?: string } | null)?.block === 'b2',
      'ann to see the awareness of bob',
    );

    // A state set before connecting is announced once connected.
    ann.connection.setAwareness({ block: 'a1' });
    await until(
      () => (bob.connection.peers[0].state as { block?: string } | null)?.block === 'a1',
      'bob to see ann',
    );

    bob.connection.close();
    await until(() => ann.connection.peers.length === 0, 'bob to leave the list');
  });

  it('does not send the edits of a viewer', async () => {
    const server = newServer();
    const guest = await client(server, 'guest');

    expect(guest.connection.canWrite).toBe(false);

    guest.type('nope');
    await tick(30);

    expect(server.lastSeq).toBe(0);
    expect([...server.sockets][0].received.filter((frame) => frame.type === 'update')).toEqual([]);

    const ann = await client(server, 'ann');

    ann.type('hi');
    await until(() => guest.text().includes('hi'), 'the viewer to see the edit');
  });

  it('drops an update the server refuses instead of sending it forever', async () => {
    const server = newServer();

    server.maxUpdateBytes = 1;

    const ann = await client(server, 'ann');

    ann.type('too big');
    await until(() => ann.errors.length > 0, 'the refusal');

    expect(ann.errors[0]).toMatchObject({ code: 'UPDATE_TOO_LARGE' });

    [...server.sockets][0].drop();
    await until(() => ann.connection.status === 'online', 'the reconnect');
    await tick(20);

    expect([...server.sockets][0].received.filter((frame) => frame.type === 'update')).toEqual([]);
  });

  it('never sends an update larger than the server accepts', async () => {
    const server = newServer();
    const ann = await client(server, 'ann', true, 0);
    const bob = await client(server, 'bob', true, 0);

    // 300 000 Cyrillic characters are about 600 KiB as an update: over the limit of 512 KiB.
    ann.type('ж'.repeat(300_000));
    await until(() => ann.errors.length > 0, 'the report');

    expect(ann.errors[0]).toMatchObject({ code: 'UPDATE_TOO_LARGE', status: 413 });
    expect(ann.connection.unsent).toBe(0);
    expect(ann.connection.status).toBe('online');
    expect([...server.sockets][0].received.filter((frame) => frame.type === 'update')).toEqual([]);
    expect(bob.text()).toBe('');
  });

  it('waits out the rate limit and then sends everything, nothing is lost', async () => {
    const server = newServer();

    server.budget = 2;
    server.retryAfter = 0.2;

    const ann = await client(server, 'ann', true, 0);
    const bob = await client(server, 'bob', true, 0);

    for (const letter of 'abcdef') ann.type(letter, ann.text().length);

    await until(() => ann.errors.length > 0, 'the refusal');

    expect(ann.errors).toHaveLength(1);
    expect(ann.errors[0]).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    expect(ann.connection.throttled).toBe(true);
    expect(ann.connection.unsent).toBeGreaterThan(0);
    expect(ann.connection.status).toBe('online');

    // Edits made during the pause wait too.
    ann.type('g', ann.text().length);
    await tick(50);
    expect(bob.text()).not.toBe('abcdefg');

    server.budget = Infinity;
    await until(() => bob.text() === 'abcdefg', 'the edits to arrive after the pause', 3000);
    await until(() => ann.connection.unsent === 0, 'the acknowledgement');

    expect(ann.connection.throttled).toBe(false);
    // The pause ended with one merged update, not one per keystroke, and without a reconnect.
    expect(server.sockets.size).toBe(2);
    expect(ann.errors).toHaveLength(1);
  });

  it('keeps waiting while the server still refuses', async () => {
    const server = newServer();

    server.budget = 0;
    server.retryAfter = 0.05;

    const ann = await client(server, 'ann', true, 0);
    const bob = await client(server, 'bob', true, 0);

    ann.type('later');
    await tick(250);

    const socket = [...server.sockets].find((item) => item.user.id === 1)!;
    const attempts = socket.received.filter((frame) => frame.type === 'update').length;

    // It tries again after every pause, one frame per try.
    expect(attempts).toBeGreaterThan(1);
    expect(attempts).toBeLessThan(8);
    expect(bob.text()).toBe('');

    server.budget = Infinity;
    await until(() => bob.text() === 'later', 'the edit after the limit is lifted');
  });

  it('merges fast typing into few frames', async () => {
    const server = newServer();
    const ann = await client(server, 'ann', true, 40);
    const bob = await client(server, 'bob', true, 0);

    for (const letter of 'hello world, this is fast') {
      ann.type(letter, ann.text().length);
      await tick(2);
    }

    await until(() => bob.text() === 'hello world, this is fast', 'the text');
    await until(() => ann.connection.unsent === 0, 'the acknowledgements');

    const socket = [...server.sockets].find((item) => item.user.id === 1)!;
    const frames = socket.received.filter((frame) => frame.type === 'update').length;

    expect(frames).toBeGreaterThan(1);
    expect(frames).toBeLessThan(12);
  });

  it('stops when the server refuses the ticket or revokes access', async () => {
    const server = newServer();
    const denied = await client(server, 'ann', false);

    server.ticketStatus = 403;
    denied.connection.connect();
    await until(() => denied.connection.status === 'closed', 'a closed connection');
    expect(denied.errors[0]).toMatchObject({ status: 403 });

    server.ticketStatus = 200;
    const ann = await client(server, 'ann');

    [...server.sockets][0].drop(1008, 'access revoked');
    await until(() => ann.connection.status === 'closed', 'a revoked connection');
    expect(ann.errors.at(-1)).toMatchObject({ code: 'ACCESS_REVOKED' });
    await tick(60);
    expect(ann.connection.status).toBe('closed');
  });

  it('stops for good when the document was deleted on the server', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');

    [...server.sockets][0].drop(1001, 'document deleted');
    await until(() => ann.connection.status === 'closed', 'a closed connection');
    expect(ann.errors.at(-1)).toMatchObject({ status: 404, code: 'DOCUMENT_NOT_FOUND' });

    await tick(60);
    expect(ann.connection.status).toBe('closed');
    expect(server.sockets.size).toBe(0);
  });

  it('reconnects after "access changed" and takes the new rights, or stops when access is gone', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');

    expect(ann.connection.canWrite).toBe(true);

    // The role was downgraded: the server closes the connection, the client comes back as a viewer.
    server.users.get('ann')!.canWrite = false;
    [...server.sockets][0].drop(1001, 'access changed');
    await until(
      () => !ann.connection.canWrite && ann.connection.status === 'online',
      'the client to be back as a viewer',
    );

    // The member was removed: the new ticket is refused, so the client stops instead of retrying forever.
    server.ticketStatus = 403;
    [...server.sockets][0].drop(1001, 'access changed');
    await until(() => ann.connection.status === 'closed', 'a closed connection');
    expect(ann.errors.at(-1)).toMatchObject({ status: 403 });
  });

  it('applies updates of others through collab.receive, so IME holds them', async () => {
    const server = newServer();
    const ann = await client(server, 'ann');
    const bob = await client(server, 'bob');

    bob.collab.setComposing(true);
    ann.type('held');
    await tick(40);
    expect(bob.text()).toBe('');

    bob.collab.setComposing(false);
    expect(bob.text()).toBe('held');
  });
});
