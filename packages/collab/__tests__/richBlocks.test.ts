import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import {
  createDocument,
  createSchemaRegistry,
  serializeDocument,
  validateSnapshot,
  type SchemaRegistry,
} from '@inkbrick/document';
import { Editor, columnsBlocks, tableBlocks, tocBlocks, toggleBlocks } from '@inkbrick/engine';

import { REMOTE_ORIGIN, createCollab, initYDoc, project } from '../src';
import type { Peer } from './harness';
import { syncAll } from './harness';

/** Встроенные блоки редактора вместе с таблицами, колонками, оглавлением и переключателем из `master`. */
const definitions = [...tableBlocks, ...tocBlocks, ...columnsBlocks, ...toggleBlocks];
const schema: SchemaRegistry = createSchemaRegistry(definitions.map((item) => item.schema));
const controllers = Object.fromEntries(
  definitions.flatMap((item) => (item.controller ? [[item.schema.flavour, item.controller]] : [])),
);

function serverState(): Uint8Array {
  const ydoc = new Y.Doc();

  initYDoc(ydoc, serializeDocument(createDocument({ schema }), schema));

  return Y.encodeStateAsUpdate(ydoc);
}

function peer(name: string, state: Uint8Array): Peer {
  const ydoc = new Y.Doc();

  Y.applyUpdate(ydoc, state, REMOTE_ORIGIN);

  const collab = createCollab({ ydoc, schema, undoCaptureMs: 0 });
  const editor = new Editor({ schema, document: collab.createDocument(), controllers });

  collab.attach(editor.store);

  return { name, ydoc, collab, editor, inbox: [], online: true };
}

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

/** JSON с отсортированными ключами: порядок ключей зависит от истории правок и не значим. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  );
}

function describeDiff(who: Peer): string {
  const projected = who.collab.snapshot().blocks;
  const stored = who.editor.document.dump();
  const lines: string[] = [];

  for (const id of new Set([...Object.keys(projected), ...Object.keys(stored)])) {
    const a = canonical(stored[id]);
    const b = canonical(projected[id]);

    if (a !== b) lines.push(`${id}\n  store: ${a}\n  ydoc:  ${b}`);
  }

  return lines.join('\n');
}

function step(who: Peer, rnd: () => number): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)];
  const all = Object.values(who.editor.document.dump());
  const content = all.filter((block) => block.id !== who.editor.document.rootId);
  const ofFlavour = (flavour: string) => all.filter((block) => block.flavour === flavour);
  const run = (intent: Parameters<typeof who.editor.dispatch>[0]): string => {
    try {
      who.editor.dispatch(intent);
    } catch {
      // the command is refused here: an ordinary situation
    }

    return intent.type;
  };

  if (content.length === 0) return 'skip';

  const block = pick(content);
  const inline = content.filter((item) => schema.getBlockSchema(item.flavour)?.inline !== false);
  const kind = Math.floor(rnd() * 16);

  switch (kind) {
    case 0:
    case 1:
      return run({
        type: 'insertBlock',
        payload: {
          flavour: pick(['block:table', 'block:columns', 'block:toggle', 'block:toc']),
          afterId: block.id,
        },
      } as never);
    case 2:
    case 3: {
      if (inline.length === 0) return 'skip';

      const target = pick(inline);

      return run({
        type: 'insertText',
        payload: {
          text: pick(['a', 'б', 'привет', '🙂']),
          selection: { anchor: { blockId: target.id, offset: 0 } },
        },
      });
    }
    case 4: {
      const table = pick([...ofFlavour('block:table'), block]);

      return run({
        type: pick(['insertTableRow', 'insertTableColumn']),
        payload: { blockId: table.id, index: Math.floor(rnd() * 3) },
      } as never);
    }
    case 5: {
      const table = pick([...ofFlavour('block:table'), block]);

      return run({
        type: pick(['deleteTableRow', 'deleteTableColumn']),
        payload: { blockId: table.id, index: Math.floor(rnd() * 3) },
      } as never);
    }
    case 6: {
      const columns = pick([...ofFlavour('block:columns'), block]);

      return run({
        type: pick(['addColumn', 'removeColumn']),
        payload: { blockId: columns.id, index: Math.floor(rnd() * 3) },
      } as never);
    }
    case 7:
      return run({
        type: 'moveBlockToSide',
        payload: { blockId: block.id, targetId: pick(content).id, side: pick(['left', 'right']) },
      } as never);
    case 8: {
      const toggle = pick([...ofFlavour('block:toggle'), block]);

      return run({
        type: 'setBlockProps',
        payload: { blockId: toggle.id, props: { open: rnd() < 0.5 } },
      } as never);
    }
    case 9:
      return run({
        type: 'moveBlock',
        payload: {
          blockId: block.id,
          targetId: pick(content).id,
          position: pick(['before', 'after']),
        },
      });
    case 10:
      return run({ type: pick(['indentBlock', 'outdentBlock']), payload: { blockId: block.id } });
    case 11:
      return run({ type: 'delete-block', payload: { id: block.id } } as never);
    case 12:
      return run({ type: 'splitBlock', payload: { blockId: block.id, offset: 0 } });
    case 13:
      return run({
        type: 'sortTableRows',
        payload: { blockId: block.id, column: 0, direction: 'asc' },
      } as never);
    case 14:
      who.collab.history.undo();

      return 'undo';
    default:
      who.collab.history.redo();

      return 'redo';
  }
}

function run(seed: number, peerCount: number, steps: number): void {
  const rnd = random(seed);
  const state = serverState();
  const peers = Array.from({ length: peerCount }, (_, index) => peer(`p${index}`, state));
  const outbox: Array<{ to: Peer; update: Uint8Array }> = [];
  const log: string[] = [];
  const fail = (message: string): never => {
    throw new Error(`seed=${seed}: ${message}\nlog: ${log.slice(-12).join(', ')}`);
  };

  for (const from of peers) {
    from.collab.onLocalUpdate((update) => {
      for (const to of peers) if (to !== from) outbox.push({ to, update });
    });
  }

  for (let i = 0; i < steps; i++) {
    const who = peers[Math.floor(rnd() * peers.length)];

    log.push(`${who.name}:${step(who, rnd)}`);

    if (rnd() < 0.6 && outbox.length > 0) {
      const [message] = outbox.splice(Math.floor(rnd() * outbox.length), 1);

      message.to.collab.receive(message.update);
    }

    if (!who.collab.inSync())
      fail(
        `${who.name} store differs from the projection after "${log[log.length - 1]}"\n${describeDiff(who)}`,
      );
  }

  for (const message of outbox.splice(0)) message.to.collab.receive(message.update);

  syncAll(peers);

  const reference = canonical(project(peers[0].ydoc));

  for (const who of peers) {
    if (canonical(project(who.ydoc)) !== reference)
      fail(`${who.name} projection differs after sync`);
    if (!who.collab.inSync()) fail(`${who.name} store differs from the projection after sync`);

    const issues = validateSnapshot(who.editor.serialize(), schema);

    if (issues.length > 0) fail(`${who.name} snapshot is invalid: ${issues.join('; ')}`);
  }

  expect(
    new Set(peers.map((who) => Buffer.from(Y.encodeStateVector(who.ydoc)).toString('hex'))).size,
  ).toBe(1);
}

describe('collaboration with tables, columns, toggles and contents blocks', () => {
  const runs = Number(process.env.COLLAB_FUZZ_RUNS ?? 20);
  const steps = Number(process.env.COLLAB_FUZZ_STEPS ?? 120);
  const start = Number(process.env.COLLAB_FUZZ_SEED ?? 1);
  const peers = Number(process.env.COLLAB_FUZZ_PEERS ?? 3);

  for (let seed = start; seed < start + runs; seed++) {
    it(`seed ${seed}, ${peers} peers`, () => run(seed, peers, steps));
  }

  it('two people edit a table at the same time', () => {
    const state = serverState();
    const a = peer('a', state);
    const b = peer('b', state);
    const first = Object.values(a.editor.document.dump()).find(
      (block) => block.flavour === 'block:paragraph',
    )!;

    a.editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: first.id },
    } as never);
    syncAll([a, b]);

    const table = Object.values(b.editor.document.dump()).find(
      (block) => block.flavour === 'block:table',
    )!;

    expect(table.children).toHaveLength(3);

    a.editor.dispatch({
      type: 'insertTableRow',
      payload: { blockId: table.id, index: 0 },
    } as never);
    b.editor.dispatch({
      type: 'insertTableColumn',
      payload: { blockId: table.id, index: 0 },
    } as never);
    syncAll([a, b]);

    expect(canonical(a.editor.serialize().blocks)).toBe(canonical(b.editor.serialize().blocks));
    expect(a.collab.inSync() && b.collab.inSync()).toBe(true);
    expect(validateSnapshot(a.editor.serialize(), schema)).toEqual([]);
  });
});
