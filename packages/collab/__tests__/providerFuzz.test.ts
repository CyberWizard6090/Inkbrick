import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { validateSnapshot } from '@inkbrick/document';
import { Editor } from '@inkbrick/engine';

import {
  memoryPendingStore,
  openDocument,
  type Collab,
  type DocumentConnection,
  type PendingStore,
} from '../src';
import { FakeServer } from './fakeServer';
import { createServerState, schema } from './harness';

/** Seeded generator: a failed run is reproduced by its number. */
function random(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const ALPHABET = ['a', 'b', 'c', ' ', 'é', '😀', '😁', 'x'];
const FLAVOURS = ['block:paragraph', 'block:heading', 'block:quote', 'block:list'];

interface Options {
  clients: number;
  steps: number;
  /** Capture window of the undo manager, ms. */
  undoCaptureMs: number;
  /** Interval between two update frames, ms. */
  sendEvery: number;
  /** Clients keep their unsent edits in a pending store. */
  pending: boolean;
  /** Clients hold remote updates now and then, like during IME composition. */
  compose: boolean;
  /** The server sometimes loses acknowledgements. */
  dropAcks: boolean;
}

interface Client {
  name: string;
  collab: Collab;
  editor: Editor;
  connection: DocumentConnection;
  store?: PendingStore;
}

const opened: DocumentConnection[] = [];

afterEach(() => {
  for (const connection of opened.splice(0)) connection.destroy();
});

function step(client: Client, rnd: () => number): string {
  const { editor, collab } = client;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)];
  const rootId = editor.document.rootId;
  const blocks = Object.values(editor.document.dump()).filter(
    (block) => block.id !== rootId && block.parentId !== rootId,
  );

  if (blocks.length === 0) return 'skip';

  const block = pick(blocks);
  const text = block.content.map((node) => node.insert).join('');
  const offset = Math.floor(rnd() * (text.length + 1));
  const other = Math.floor(rnd() * (text.length + 1));
  const [from, to] = offset <= other ? [offset, other] : [other, offset];
  const kind = Math.floor(rnd() * 14);

  const run = (intent: Parameters<typeof editor.dispatch>[0]): string => {
    try {
      editor.dispatch(intent);
    } catch {
      // a command that cannot run here is an ordinary situation
    }

    return intent.type;
  };

  // Offsets are UTF-16 units: never split a surrogate pair.
  const safe = (position: number): number => {
    const code = text.charCodeAt(position - 1);

    return code >= 0xd800 && code <= 0xdbff ? position - 1 : position;
  };

  switch (kind) {
    case 0:
    case 1:
    case 2:
      return run({
        type: 'insertText',
        payload: {
          text: pick(ALPHABET),
          selection: { anchor: { blockId: block.id, offset: safe(offset) } },
        },
      });
    case 3:
      return run({
        type: 'deleteText',
        payload: { blockId: block.id, from: safe(from), to: safe(to) },
      });
    case 4:
      return run({ type: 'splitBlock', payload: { blockId: block.id, offset: safe(offset) } });
    case 5:
      return run({ type: 'deleteBackward', payload: { blockId: block.id, offset: safe(offset) } });
    case 6:
      return run({
        type: 'moveBlock',
        payload: {
          blockId: block.id,
          targetId: pick(blocks).id,
          position: pick(['before', 'after'] as const),
        },
      });
    case 7:
      return run({ type: 'indentBlock', payload: { blockId: block.id } });
    case 8:
      return run({ type: 'outdentBlock', payload: { blockId: block.id } });
    case 9:
      return run({ type: 'convertBlock', payload: { blockId: block.id, flavour: pick(FLAVOURS) } });
    case 10:
      return run({ type: 'delete-block', payload: { id: block.id } } as never);
    case 11:
      return run({
        type: 'toggleFormat',
        payload: {
          blockId: block.id,
          from: safe(from),
          to: safe(to),
          format: pick(['bold', 'italic', 'code']),
        },
      });
    case 12:
      collab.history.undo();
      return 'undo';
    default:
      collab.history.redo();
      return 'redo';
  }
}

/** Blocks by id, keys sorted: the order of the keys depends on the history of the edits and is not significant. */
const blocksOf = (client: Client): string => {
  const blocks = client.editor.serialize().blocks;

  return JSON.stringify(
    Object.keys(blocks)
      .sort()
      .map((id) => blocks[id]),
    (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([x], [y]) => (x < y ? -1 : 1)))
        : item,
  );
};

const vectorOf = (client: Client): string =>
  Buffer.from(Y.encodeStateVector(client.collab.ydoc)).toString('hex');

async function run(seed: number, options: Options): Promise<void> {
  const rnd = random(seed);
  const server = new FakeServer(createServerState());
  const log: string[] = [];
  const clients: Client[] = [];

  const fail = (message: string): never => {
    throw new Error(
      `seed=${seed} ${JSON.stringify(options)}: ${message}\nlog: ${log.slice(-12).join(', ')}`,
    );
  };

  for (let index = 0; index < options.clients; index++) {
    const token = `user${index}`;
    const name = `c${index}`;
    const store = options.pending ? memoryPendingStore() : undefined;

    server.addUser(token, { id: index + 1, username: token, canWrite: true });

    const { collab, connection } = await openDocument({
      baseUrl: 'http://server.test',
      getToken: () => token,
      fetch: server.fetch as typeof fetch,
      WebSocket: server.WebSocket,
      documentId: 1,
      schema,
      backoff: { min: 2, max: 10 },
      awarenessEvery: 5,
      sendEvery: options.sendEvery,
      undoCaptureMs: options.undoCaptureMs,
      pendingStore: store,
      onError: (error) => log.push(`${name}:error:${error.message}`),
    });
    const editor = new Editor({
      schema,
      document: collab.createDocument(),
      history: { limit: 0 },
    });

    collab.attach(editor.store);
    opened.push(connection);
    connection.connect();
    clients.push({ name, collab, editor, connection, store });
  }

  for (let i = 0; i < options.steps; i++) {
    const client = clients[Math.floor(rnd() * clients.length)];

    log.push(`${client.name}:${step(client, rnd)}`);

    if (!client.collab.inSync())
      fail(`${client.name} store differs from the projection\n${log.at(-1)}`);

    const roll = rnd();

    if (roll < 0.06) {
      for (const socket of server.sockets) {
        if (socket.user.id === clients.indexOf(client) + 1) socket.drop();
      }

      log.push(`${client.name}:drop`);
    } else if (options.compose && roll < 0.14) {
      client.collab.setComposing(rnd() < 0.6);
      log.push(`${client.name}:compose`);
    } else if (options.dropAcks && roll < 0.2) {
      server.dropAcks = !server.dropAcks;
    }

    if (rnd() < 0.5) await tick(Math.floor(rnd() * 4));
  }

  server.dropAcks = false;

  for (const client of clients) client.collab.setComposing(false);

  // An edit whose acknowledgement was lost is sent again after a reconnect.
  for (const socket of server.sockets) socket.drop();

  // Quiescence: everybody is online, nothing waits to be sent and every state vector is the same.
  const deadline = Date.now() + 4000;

  for (;;) {
    await tick(10);

    const settled =
      clients.every(
        (client) => client.connection.status === 'online' && client.connection.unsent === 0,
      ) && new Set(clients.map(vectorOf)).size === 1;

    if (settled) break;
    if (Date.now() > deadline) fail('no quiescence: ' + clients.map(vectorOf).join(' | '));
  }

  const reference = blocksOf(clients[0]);

  for (const client of clients) {
    if (!client.collab.inSync())
      fail(`${client.name} store differs from the projection after sync`);

    const snapshot = client.editor.serialize();
    const issues = validateSnapshot(snapshot, schema);

    if (issues.length > 0) fail(`${client.name} snapshot is invalid: ${issues.join('; ')}`);
    if (blocksOf(client) !== reference)
      fail(`${client.name} shows another document\n${reference}\n${blocksOf(client)}`);
  }

  expect(new Set(clients.map(vectorOf)).size).toBe(1);
}

const base: Options = {
  clients: 3,
  steps: 60,
  undoCaptureMs: 1000,
  sendEvery: 3,
  pending: false,
  compose: false,
  dropAcks: false,
};

const configs: Array<[string, Partial<Options>]> = [
  ['default', {}],
  ['undoCaptureMs 0', { undoCaptureMs: 0 }],
  ['2 clients, undoCaptureMs 0', { clients: 2, undoCaptureMs: 0 }],
  ['4 clients, pending store', { clients: 4, pending: true }],
  ['composition holds', { compose: true, undoCaptureMs: 0 }],
  ['lost acknowledgements, pending store', { dropAcks: true, pending: true }],
  ['merged sends', { sendEvery: 40, undoCaptureMs: 0 }],
];

describe('provider convergence (fuzz)', () => {
  const runs = Number(process.env.COLLAB_FUZZ_RUNS ?? 2);
  const start = Number(process.env.COLLAB_FUZZ_SEED ?? 1);
  const steps = Number(process.env.COLLAB_FUZZ_STEPS ?? base.steps);

  for (const [name, config] of configs) {
    for (let seed = start; seed < start + runs; seed++) {
      it(`${name}, seed ${seed}`, () => run(seed, { ...base, steps, ...config }), 20000);
    }
  }
});
