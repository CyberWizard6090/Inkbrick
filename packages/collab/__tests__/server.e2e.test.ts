import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { Editor } from '@inkbrick/engine';

import { memoryPendingStore, openDocument, toBase64, type DocumentConnection } from '../src';
import { schema } from './harness';

/**
 * End to end against a running Rabbit Hole server (this repository's `rabbit-hole-server`, migrated to the
 * notebooks schema). Skipped unless COLLAB_E2E_URL is set:
 *
 *   COLLAB_E2E_URL=http://127.0.0.1:8081 pnpm vitest run --project @inkbrick/collab server.e2e
 *
 * The tests register three users (ann, bob, guest) once for the whole file.
 */
const base = process.env.COLLAB_E2E_URL;

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as { data: T };

  return { status: response.status, data: json.data };
}

const people = new Map<string, Promise<{ token: string; id: number }>>();

/** One account per name for the whole file: the server limits registrations to a few per minute. */
function signUp(name: string): Promise<{ token: string; id: number }> {
  if (!people.has(name)) people.set(name, register(name));

  return people.get(name)!;
}

/** Makes `other` a contact of `owner`. Repeating it for people who are contacts already is harmless. */
async function befriend(
  owner: { token: string; id: number },
  other: { token: string; id: number },
): Promise<void> {
  await call('POST', '/contacts', owner.token, { contact_id: other.id });
  await call('POST', `/contacts/requests/${owner.id}/accept`, other.token);
}

async function register(name: string): Promise<{ token: string; id: number }> {
  const email = `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;

  await call('POST', '/auth/register', '', { email, password: 'password-123' });

  const login = await call<{ access_token: string }>('POST', '/auth/login', '', {
    email,
    password: 'password-123',
  });
  const token = login.data.access_token;
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
    user_id: number;
  };

  return { token, id: payload.user_id };
}

const until = async (condition: () => boolean, label: string, timeout = 5000): Promise<void> => {
  const deadline = Date.now() + timeout;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe.skipIf(!base)('against a real server', () => {
  it('edits one document together, with presence, attribution and compaction', async () => {
    const ann = await signUp('ann');
    const bob = await signUp('bob');
    const guest = await signUp('guest');

    const workspace = (
      await call<{ id: number }>('POST', '/workspaces', ann.token, { name: 'e2e' })
    ).data.id;

    for (const [person, role] of [
      [bob, 'Member'],
      [guest, 'Guest'],
    ] as const) {
      await befriend(ann, person);
      expect(
        (
          await call('POST', `/workspaces/${workspace}/members`, ann.token, {
            user_id: person.id,
            role,
          })
        ).status,
      ).toBe(201);
    }

    const notebook = (
      await call<{ id: number }>('POST', `/workspaces/${workspace}/notebooks`, ann.token, {
        name: 'n',
      })
    ).data.id;
    const documentId = (
      await call<{ id: number }>('POST', `/notebooks/${notebook}/documents`, ann.token, {
        title: 'Shared',
      })
    ).data.id;

    const open = async (token: string) => {
      const errors: Error[] = [];
      const { collab, connection } = await openDocument({
        baseUrl: base!,
        getToken: () => token,
        documentId,
        schema,
        awarenessEvery: 10,
        onError: (error) => errors.push(error),
      });
      const editor = new Editor({
        schema,
        document: collab.createDocument(),
        history: { limit: 0 },
      });

      collab.attach(editor.store);
      connection.connect();
      await until(() => connection.status === 'online', 'a connection to be online');

      const note = editor.document.getBlock(editor.document.rootId)!.children[0];
      const block = editor.document.getBlock(note)!.children[0];

      return {
        collab,
        connection,
        editor,
        errors,
        block,
        text: () =>
          editor.store
            .getBlock(block)!
            .content.map((node) => node.insert)
            .join(''),
        type: (text: string, at: number) =>
          void editor.dispatch({
            type: 'insertText',
            payload: { text, selection: { anchor: { blockId: block, offset: at } } },
          }),
      };
    };

    const a = await open(ann.token);
    const b = await open(bob.token);
    const g = await open(guest.token);
    const connections: DocumentConnection[] = [a.connection, b.connection, g.connection];

    try {
      expect(a.block).toBe(b.block);
      expect([a.connection.canWrite, b.connection.canWrite, g.connection.canWrite]).toEqual([
        true,
        true,
        false,
      ]);

      // Everyone sees everyone.
      await until(
        () => connections.every((connection) => connection.peers.length === 2),
        'presence',
      );
      expect(
        (
          await call<Array<{ user: { id: number } }>>(
            'GET',
            `/documents/${documentId}/presence`,
            ann.token,
          )
        ).data.map((entry) => entry.user.id),
      ).toEqual([ann.id, bob.id, guest.id].sort((x, y) => x - y));

      // Edits travel both ways, and the viewer sees them.
      a.type('Hello', 0);
      await until(() => b.text() === 'Hello' && g.text() === 'Hello', 'the first edit to arrive');
      b.type(' world', 5);
      await until(
        () => a.text() === 'Hello world' && g.text() === 'Hello world',
        'the second edit to arrive',
      );

      // Concurrent typing in one block merges.
      a.type('<', 0);
      b.type('>', b.text().length);
      await until(
        () =>
          a.text() === b.text() &&
          a.text() === g.text() &&
          a.text().includes('<') &&
          a.text().includes('>'),
        'concurrent edits to converge',
      );

      // A viewer's local edit is not sent.
      const before = (
        await call<{ last_seq: number }>('GET', `/documents/${documentId}`, ann.token)
      ).data.last_seq;

      g.type('SNEAK', 0);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(
        (await call<{ last_seq: number }>('GET', `/documents/${documentId}`, ann.token)).data
          .last_seq,
      ).toBe(before);

      // Presence carries awareness, stamped with the real user.
      a.connection.setAwareness({ block: a.block, color: '#2f6fed' });
      await until(
        () =>
          (
            b.connection.peers.find((peer) => peer.user.id === ann.id)?.state as {
              color?: string;
            } | null
          )?.color === '#2f6fed',
        'the awareness of ann',
      );

      // Who edited the block.
      const activity = (
        await call<
          Array<{
            block_id: string;
            created_by: { id: number } | null;
            last_edited_by: { id: number } | null;
          }>
        >('GET', `/documents/${documentId}/blocks/activity?block_id=${a.block}`, guest.token)
      ).data;

      expect(activity).toHaveLength(1);
      expect([ann.id, bob.id]).toContain(activity[0].last_edited_by?.id);

      // Compaction by a client, then a fresh client opens the compacted document.
      const state = (
        await call<{ last_seq: number }>('GET', `/documents/${documentId}/state`, ann.token)
      ).data;
      const snapshot = await call('POST', `/documents/${documentId}/snapshot`, ann.token, {
        upto_seq: state.last_seq,
        state: toBase64(Y.encodeStateAsUpdate(a.collab.ydoc)),
      });

      expect(snapshot.status).toBe(200);

      const late = await open(bob.token);

      expect(late.text()).toBe(a.text());
      late.connection.destroy();

      expect([a.errors, b.errors, g.errors].flat()).toEqual([]);

      // Deleting the document closes every open connection at once, and the clients do not reconnect.
      expect((await call('DELETE', `/documents/${documentId}`, ann.token)).status).toBe(200);
      await until(
        () => connections.every((connection) => connection.status === 'closed'),
        'every connection to be closed by the server',
      );
      expect([a.errors, b.errors, g.errors].map((list) => list.at(-1))).toEqual([
        expect.objectContaining({ code: 'DOCUMENT_NOT_FOUND' }),
        expect.objectContaining({ code: 'DOCUMENT_NOT_FOUND' }),
        expect.objectContaining({ code: 'DOCUMENT_NOT_FOUND' }),
      ]);
    } finally {
      for (const connection of connections) connection.destroy();
    }
  }, 60000);

  it('checks every update on the server: a long session passes, a broken update is refused', async () => {
    const ann = await signUp('ann');
    const bob = await signUp('bob');
    const workspace = (
      await call<{ id: number }>('POST', '/workspaces', ann.token, { name: 'e2e-checks' })
    ).data.id;

    await befriend(ann, bob);
    await call('POST', `/workspaces/${workspace}/members`, ann.token, {
      user_id: bob.id,
      role: 'Member',
    });

    const notebook = (
      await call<{ id: number }>('POST', `/workspaces/${workspace}/notebooks`, ann.token, {
        name: 'n',
      })
    ).data.id;
    const documentId = (
      await call<{ id: number }>('POST', `/notebooks/${notebook}/documents`, ann.token, {
        title: 'Checked',
      })
    ).data.id;

    const open = async (token: string) => {
      const errors: Error[] = [];
      const { collab, connection } = await openDocument({
        baseUrl: base!,
        getToken: () => token,
        documentId,
        schema,
        undoCaptureMs: 0,
        onError: (error) => errors.push(error),
      });
      const editor = new Editor({
        schema,
        document: collab.createDocument(),
        history: { limit: 0 },
      });

      collab.attach(editor.store);
      connection.connect();
      await until(() => connection.status === 'online', 'a connection to be online');

      return { collab, connection, editor, errors };
    };

    const peers = [await open(ann.token), await open(bob.token)];

    // A seeded random session of real editor commands on both sides: typing with Cyrillic and emoji, splitting,
    // merging, moving, nesting, converting, formatting, deleting, undo and redo.
    let seed = Number(process.env.COLLAB_E2E_SEED ?? 20261115);
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;

      return seed / 2 ** 32;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
    const flavours = [
      'block:paragraph',
      'block:heading',
      'block:list',
      'block:quote',
      'block:code',
    ];

    for (let step = 0; step < 400; step++) {
      const peer = pick(peers);
      const blocks = Object.values(peer.editor.document.dump()).filter(
        (block) => schema.getBlockSchema(block.flavour)?.inline !== false,
      );

      if (blocks.length === 0) continue;

      const block = pick(blocks);
      const length = block.content.reduce((sum, node) => sum + node.insert.length, 0);
      const offset = Math.floor(rnd() * (length + 1));
      const other = Math.floor(rnd() * (length + 1));
      const [from, to] = offset <= other ? [offset, other] : [other, offset];
      // An offset never lands inside a surrogate pair (an emoji): a selection in the editor cannot either.
      const plain = block.content.map((node) => node.insert).join('');
      const safe = (position: number): number => {
        const code = plain.charCodeAt(position - 1);

        return code >= 0xd800 && code <= 0xdbff ? position - 1 : position;
      };
      const run = (intent: Parameters<typeof peer.editor.dispatch>[0]): void => {
        try {
          peer.editor.dispatch(intent);
        } catch {
          // the command cannot be run here: an ordinary situation
        }
      };

      switch (Math.floor(rnd() * 12)) {
        case 0:
        case 1:
        case 2:
        case 3:
          run({
            type: 'insertText',
            payload: {
              text: pick(['a', 'б', 'привет ', '🙂', ' ', 'xyz']),
              selection: { anchor: { blockId: block.id, offset: 0 } },
            },
          });
          break;
        case 4:
          run({ type: 'splitBlock', payload: { blockId: block.id, offset: 0 } });
          break;
        case 5:
          run({ type: 'deleteBackward', payload: { blockId: block.id, offset: 0 } });
          break;
        case 6:
          run({
            type: 'moveBlock',
            payload: { blockId: block.id, targetId: pick(blocks).id, position: 'after' },
          });
          break;
        case 7:
          run({ type: pick(['indentBlock', 'outdentBlock']), payload: { blockId: block.id } });
          break;
        case 8:
          run({ type: 'convertBlock', payload: { blockId: block.id, flavour: pick(flavours) } });
          break;
        case 9:
          run({
            type: 'toggleFormat',
            payload: {
              blockId: block.id,
              from: 0,
              to: safe(Math.min(length, to - from)),
              format: 'bold',
            },
          });
          break;
        case 10:
          peer.collab.history.undo();
          break;
        default:
          peer.collab.history.redo();
      }

      if (step % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 30));
    }

    await until(
      () => peers.every((peer) => peer.connection.unsent === 0),
      'every edit to be acknowledged',
      20000,
    );

    const vector = (peer: (typeof peers)[number]): string =>
      Buffer.from(Y.encodeStateVector(peer.collab.ydoc)).toString('hex');

    await until(() => vector(peers[0]) === vector(peers[1]), 'both sides to have the same edits');

    // The server refused nothing of what the editor produced, and both sides show the same document.
    expect(peers.flatMap((peer) => peer.errors)).toEqual([]);
    expect(peers[0].collab.inSync() && peers[1].collab.inSync()).toBe(true);
    expect(peers[1].editor.serialize().blocks).toEqual(peers[0].editor.serialize().blocks);

    // Bytes that are not an update, and an update that removes the root block, are refused over REST.
    const rootId = peers[0].editor.document.rootId;
    const attacker = new Y.Doc();

    Y.applyUpdate(attacker, Y.encodeStateAsUpdate(peers[0].collab.ydoc));

    const before = Y.encodeStateVector(attacker);

    attacker.getMap('blocks').delete(rootId);

    for (const update of [
      toBase64(new TextEncoder().encode('not a yjs update')),
      toBase64(Y.encodeStateAsUpdate(attacker, before)),
    ]) {
      expect(
        (await call('POST', `/documents/${documentId}/updates`, bob.token, { update })).status,
      ).toBe(400);
    }

    // The document on the server is intact: a newcomer opens it and sees what the others see.
    const late = await open(ann.token);

    await until(() => vector(late) === vector(peers[0]), 'the newcomer to catch up');
    expect(late.errors).toEqual([]);
    expect(late.editor.serialize().blocks).toEqual(peers[0].editor.serialize().blocks);

    // And the session goes on after the refusals.
    const firstText = Object.values(peers[0].editor.document.dump()).find(
      (block) => schema.getBlockSchema(block.flavour)?.inline !== false,
    )!;

    peers[0].editor.dispatch({
      type: 'insertText',
      payload: { text: 'после', selection: { anchor: { blockId: firstText.id, offset: 0 } } },
    });
    await until(
      () => JSON.stringify(late.editor.serialize().blocks).includes('после'),
      'an edit after the refusals to arrive',
    );

    for (const peer of [...peers, late]) peer.connection.destroy();
  }, 60000);

  it('keeps edits made offline across a reload of the page', async () => {
    const ann = await signUp('ann');
    const bob = await signUp('bob');
    const workspace = (
      await call<{ id: number }>('POST', '/workspaces', ann.token, { name: 'e2e reload' })
    ).data.id;

    await befriend(ann, bob);
    expect(
      (
        await call('POST', `/workspaces/${workspace}/members`, ann.token, {
          user_id: bob.id,
          role: 'Member',
        })
      ).status,
    ).toBe(201);

    const notebook = (
      await call<{ id: number }>('POST', `/workspaces/${workspace}/notebooks`, ann.token, {
        name: 'n',
      })
    ).data.id;
    const documentId = (
      await call<{ id: number }>('POST', `/notebooks/${notebook}/documents`, ann.token, {
        title: 'Reload',
      })
    ).data.id;
    // The same store for both page loads, like IndexedDB of one browser.
    const store = memoryPendingStore();

    const page = async (token: string, pendingStore?: typeof store) => {
      const { collab, connection } = await openDocument({
        baseUrl: base!,
        getToken: () => token,
        documentId,
        schema,
        pendingStore,
      });
      const editor = new Editor({
        schema,
        document: collab.createDocument(),
        history: { limit: 0 },
      });

      collab.attach(editor.store);

      const note = editor.document.getBlock(editor.document.rootId)!.children[0];
      const block = editor.document.getBlock(note)!.children[0];

      return {
        connection,
        text: () =>
          editor.store
            .getBlock(block)!
            .content.map((node) => node.insert)
            .join(''),
        type: (text: string) =>
          void editor.dispatch({
            type: 'insertText',
            payload: { text, selection: { anchor: { blockId: block, offset: 0 } } },
          }),
      };
    };

    const watcher = await page(bob.token);

    watcher.connection.connect();
    await until(() => watcher.connection.status === 'online', 'bob to be online');

    // Ann types without any connection (it was never opened), then closes the page.
    const first = await page(ann.token, store);

    first.type('written offline');
    await first.connection.saved();
    expect(await store.list()).toHaveLength(1);
    first.connection.destroy();

    // The page is opened again: her work is back at once, and it reaches the server and Bob after the connect.
    const second = await page(ann.token, store);

    expect(second.text()).toBe('written offline');
    expect(watcher.text()).toBe('');

    second.connection.connect();
    await until(() => watcher.text() === 'written offline', 'the restored edit to reach bob');
    await second.connection.saved();
    expect(await store.list()).toEqual([]);

    second.connection.destroy();
    watcher.connection.destroy();
  }, 60000);
});
