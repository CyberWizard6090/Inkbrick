import { IDBFactory } from 'fake-indexeddb';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { Editor } from '@inkbrick/engine';

import {
  indexedDbPendingStore,
  memoryPendingStore,
  newEditId,
  openDocument,
  type DocumentConnection,
  type PendingStore,
  type StoredEdit,
} from '../src';
import { FakeServer } from './fakeServer';
import { createServerState, firstParagraph, schema } from './harness';

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, label: string, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);

    await tick(5);
  }
}

const edit = (text: string, id = newEditId()): StoredEdit => ({
  id,
  update: new TextEncoder().encode(text),
  touched: [text],
});

describe.each([
  ['memory', () => ({ make: memoryPendingStore, other: memoryPendingStore })],
  [
    'IndexedDB',
    () => {
      const factory = new IDBFactory();

      return {
        make: () => indexedDbPendingStore({ scope: 'one', indexedDB: factory }),
        other: () => indexedDbPendingStore({ scope: 'two', indexedDB: factory }),
      };
    },
  ],
])('%s pending store', (_name, setup) => {
  it('returns the edits oldest first and forgets removed ones', async () => {
    const { make } = setup();
    const store = make();
    const [a, b, c] = [edit('a', '001'), edit('b', '002'), edit('c', '003')];

    await store.put(c);
    await store.put(a);
    await store.put(b);

    expect((await store.list()).map((item) => item.id)).toEqual(['001', '002', '003']);
    expect(new TextDecoder().decode((await store.list())[0].update)).toBe('a');
    expect((await store.list())[0].touched).toEqual(['a']);

    await store.remove(['002', 'missing']);
    await store.remove([]);
    expect((await store.list()).map((item) => item.id)).toEqual(['001', '003']);

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('keeps stores of different scopes apart', async () => {
    const setupPair = setup();
    // Two memory stores are separate by construction; two IndexedDB stores share a database and differ in scope.
    const one = setupPair.make();
    const two = setupPair.other();

    await one.put(edit('mine', '1'));
    await two.put(edit('yours', '2'));

    expect((await one.list()).map((item) => item.id)).toEqual(['1']);
    expect((await two.list()).map((item) => item.id)).toEqual(['2']);

    await one.clear();
    expect((await two.list()).map((item) => item.id)).toEqual(['2']);
  });

  it('survives being opened again, like a reloaded page', async () => {
    const { make } = setup();

    await make().put(edit('kept', '1'));

    // For memory this is a different store, so only IndexedDB must remember.
    if (_name === 'IndexedDB') expect((await make().list()).map((item) => item.id)).toEqual(['1']);
  });
});

interface Page {
  connection: DocumentConnection;
  editor: Editor;
  errors: Error[];
  text: () => string;
  type: (text: string, at?: number) => void;
}

const open: DocumentConnection[] = [];

afterEach(() => {
  for (const connection of open.splice(0)) connection.destroy();
});

function newServer(): FakeServer {
  const server = new FakeServer(createServerState());

  server.addUser('ann', { id: 1, username: 'ann', canWrite: true });
  server.addUser('bob', { id: 2, username: 'bob', canWrite: true });
  server.addUser('guest', { id: 3, username: 'guest', canWrite: false });

  return server;
}

/** One page load: opens the document with the given store and, unless told otherwise, connects. */
async function loadPage(
  server: FakeServer,
  token: string,
  store: PendingStore | undefined,
  connect = true,
): Promise<Page> {
  const errors: Error[] = [];
  const { collab, connection } = await openDocument({
    baseUrl: 'http://server.test',
    getToken: () => token,
    fetch: server.fetch as typeof fetch,
    WebSocket: server.WebSocket,
    documentId: 1,
    schema,
    backoff: { min: 5, max: 20 },
    pendingStore: store,
    onError: (error) => errors.push(error),
  });
  const editor = new Editor({ schema, document: collab.createDocument(), history: { limit: 0 } });

  collab.attach(editor.store);
  open.push(connection);

  if (connect) {
    connection.connect();
    await until(() => connection.status === 'online', `${token} to be online`);
  }

  const id = firstParagraph({ editor } as never);

  return {
    connection,
    editor,
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

/** Closing the page: the connection is gone, but whatever it wrote to the store stays. */
async function closePage(page: Page): Promise<void> {
  await page.connection.saved();
  page.connection.destroy();
}

async function goOffline(server: FakeServer, page: Page): Promise<void> {
  server.ticketStatus = 500;
  [...server.sockets].find((socket) => socket.user.username === 'ann')!.drop();
  await until(() => page.connection.status === 'reconnecting', 'the connection to drop');
}

describe('unsent edits across reloads', () => {
  it('shows edits made offline again after a reload and sends them once the server is reachable', async () => {
    const server = newServer();
    const store = memoryPendingStore();
    const bob = await loadPage(server, 'bob', undefined);
    const first = await loadPage(server, 'ann', store);

    await goOffline(server, first);
    first.type('typed offline');
    await closePage(first);

    expect(await store.list()).toHaveLength(1);

    // The page is reloaded: the server is reachable again, the person's work is back before anything is sent.
    server.ticketStatus = 200;

    const second = await loadPage(server, 'ann', store, false);

    expect(second.text()).toBe('typed offline');
    expect(bob.text()).toBe('');

    second.connection.connect();
    await until(() => bob.text() === 'typed offline', 'bob to receive the restored edit');
    await second.connection.saved();
    expect(await store.list()).toEqual([]);
    expect(second.errors).toEqual([]);
  });

  it('does not bring back edits the server acknowledged', async () => {
    const server = newServer();
    const store = memoryPendingStore();
    const first = await loadPage(server, 'ann', store);

    first.type('acknowledged');
    await until(() => server.lastSeq > 0, 'the update to be stored');
    await tick(20);
    await first.connection.saved();
    expect(await store.list()).toEqual([]);

    await closePage(first);

    const second = await loadPage(server, 'ann', store);

    expect(second.text()).toBe('acknowledged');
    await tick(30);
    expect(server.lastSeq).toBe(1);
  });

  it('does not send an edit again when only its acknowledgement was lost', async () => {
    const server = newServer();
    const store = memoryPendingStore();

    server.dropAcks = true;

    const first = await loadPage(server, 'ann', store);

    first.type('stored but not acknowledged');
    await until(() => server.lastSeq === 1, 'the update to be stored');
    await closePage(first);
    expect(await store.list()).toHaveLength(1);

    server.dropAcks = false;

    const second = await loadPage(server, 'ann', store);

    expect(second.text()).toBe('stored but not acknowledged');
    await tick(30);
    expect(server.lastSeq).toBe(1);
    expect(await store.list()).toEqual([]);
  });

  it('merges a long offline stretch into a few records and still delivers everything', async () => {
    const server = newServer();
    const store = memoryPendingStore();
    const bob = await loadPage(server, 'bob', undefined);
    const ann = await loadPage(server, 'ann', store);

    await goOffline(server, ann);

    for (let i = 0; i < 120; i++) ann.type('x', i);

    await ann.connection.saved();
    // Merging starts at 50 unsent edits, so the stored list stays bounded however long the stretch is.
    expect((await store.list()).length).toBeLessThan(60);
    expect((await store.list()).length).toBeLessThan(120);

    server.ticketStatus = 200;
    await until(() => bob.text() === 'x'.repeat(120), 'all offline edits to arrive', 5000);
    await ann.connection.saved();
    expect(await store.list()).toEqual([]);
  });

  it('keeps editing and reports it when the store cannot be written', async () => {
    const server = newServer();
    const broken: PendingStore = {
      ...memoryPendingStore(),
      put: () => Promise.reject(new Error('quota exceeded')),
    };
    const bob = await loadPage(server, 'bob', undefined);
    const ann = await loadPage(server, 'ann', broken);

    ann.type('still works');
    await until(() => bob.text() === 'still works', 'the edit to reach bob');
    await ann.connection.saved();

    expect(ann.errors.map((error) => (error as { code?: string }).code)).toContain(
      'PENDING_STORE_FAILED',
    );
  });

  it('ignores damaged records instead of failing to open or sending them', async () => {
    const server = newServer();
    const store = memoryPendingStore();

    await store.put({ id: '1', update: new Uint8Array([1, 2, 3, 4]), touched: [] });
    await store.put({ id: '2', update: 'not bytes' as unknown as Uint8Array, touched: [] });
    await store.put({ id: '3', update: new Uint8Array(), touched: 'x' as unknown as string[] });

    const page = await loadPage(server, 'ann', store);

    await tick(30);
    expect(page.errors).toEqual([]);
    expect(server.lastSeq).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it('does not send the stored edits of a viewer', async () => {
    const server = newServer();
    const store = memoryPendingStore();
    const author = await loadPage(server, 'ann', undefined, false);

    author.type('someone else');

    const update = Y.encodeStateAsUpdate(author.connection['options'].collab.ydoc);

    await store.put({ id: '1', update, touched: [] });

    const guest = await loadPage(server, 'guest', store);

    await tick(30);
    expect(guest.connection.canWrite).toBe(false);
    expect(server.lastSeq).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it('forgets everything on discardPending', async () => {
    const server = newServer();
    const store = memoryPendingStore();
    const ann = await loadPage(server, 'ann', store);

    await goOffline(server, ann);
    ann.type('draft');
    await ann.connection.saved();
    expect(await store.list()).toHaveLength(1);

    await ann.connection.discardPending();
    expect(await store.list()).toEqual([]);
  });

  it('keeps the edits of two tabs apart and delivers both', async () => {
    const server = newServer();
    const store = memoryPendingStore();
    const bob = await loadPage(server, 'bob', undefined);
    const tabOne = await loadPage(server, 'ann', store, false);
    const tabTwo = await loadPage(server, 'ann', store, false);

    tabOne.type('one');
    tabTwo.type('two');
    await Promise.all([tabOne.connection.saved(), tabTwo.connection.saved()]);
    expect(await store.list()).toHaveLength(2);

    tabOne.connection.connect();
    tabTwo.connection.connect();
    await until(
      () => bob.text().includes('one') && bob.text().includes('two'),
      'both edits to arrive',
    );
    await Promise.all([tabOne.connection.saved(), tabTwo.connection.saved()]);
    expect(await store.list()).toEqual([]);
  });
});
