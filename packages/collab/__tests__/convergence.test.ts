import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { validateSnapshot } from '@inkbrick/document';

import { project } from '../src';
import { createPeer, createServerState, schema, syncAll, type Peer } from './harness';

/** Генератор с зерном: упавший прогон воспроизводится по номеру. */
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

const ALPHABET = ['a', 'b', 'c', ' ', 'é', '😀', '😁', 'x'];
const FLAVOURS = ['block:paragraph', 'block:heading', 'block:quote', 'block:list'];

function step(peer: Peer, rnd: () => number): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)];
  const dump = peer.editor.document.dump();
  const rootId = peer.editor.document.rootId;
  const blocks = Object.values(dump).filter(
    (block) => block.id !== rootId && block.parentId !== rootId,
  );
  if (blocks.length === 0) return 'skip';

  const block = pick(blocks);
  const length = block.content.reduce((sum, node) => sum + node.insert.length, 0);
  const offset = Math.floor(rnd() * (length + 1));
  const other = Math.floor(rnd() * (length + 1));
  const [from, to] = offset <= other ? [offset, other] : [other, offset];
  const kind = Math.floor(rnd() * 14);

  const run = (intent: Parameters<typeof peer.editor.dispatch>[0]): string => {
    try {
      peer.editor.dispatch(intent);
    } catch {
      // команда отклонена (нельзя выполнить здесь) — это обычная ситуация
    }

    return intent.type;
  };

  // Вставка по смещению в символах: смещения считаются в единицах UTF-16, суррогатные пары не рвём.
  const safe = (position: number): number => {
    const text = block.content.map((node) => node.insert).join('');
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
      peer.collab.history.undo();
      return 'undo';
    default:
      peer.collab.history.redo();
      return 'redo';
  }
}

/** JSON с отсортированными ключами: порядок ключей атрибутов зависит от истории правок и не значим. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  );
}

function describeDiff(peer: Peer): string {
  const projected = peer.collab.snapshot().blocks;
  const stored = peer.editor.document.dump();
  const lines: string[] = [];

  for (const id of new Set([...Object.keys(projected), ...Object.keys(stored)])) {
    const a = canonical(stored[id]);
    const b = canonical(projected[id]);

    if (a !== b) lines.push(`${id}\n  store: ${a}\n  ydoc:  ${b}`);
  }

  return lines.join('\n');
}

function run(seed: number, peerCount: number, steps: number): void {
  const rnd = random(seed);
  const state = createServerState();
  const peers = Array.from({ length: peerCount }, (_, index) => createPeer(`p${index}`, state));
  const log: string[] = [];

  // Сеть в памяти: обновления задерживаются и приходят в случайном порядке, у части участников связь обрывается.
  const outbox = new Map<Peer, Array<{ to: Peer; update: Uint8Array }>>();

  for (const peer of peers) {
    outbox.set(peer, []);
    peer.collab.onLocalUpdate((update) => {
      for (const to of peers) if (to !== peer) outbox.get(peer)!.push({ to, update });
    });
  }

  const deliver = (): void => {
    const sender = peers[Math.floor(rnd() * peers.length)];
    const queue = outbox.get(sender)!;

    if (queue.length === 0) return;

    const index = Math.floor(rnd() * queue.length);
    const [message] = queue.splice(index, 1);

    if (!message.to.online) {
      queue.push(message);
      return;
    }

    message.to.collab.receive(message.update);
  };

  const fail = (message: string): never => {
    throw new Error(
      `seed=${seed} peers=${peerCount}: ${message}\nlog: ${log.slice(-12).join(', ')}`,
    );
  };

  for (let i = 0; i < steps; i++) {
    const peer = peers[Math.floor(rnd() * peers.length)];

    if (rnd() < 0.05) peer.online = !peer.online;

    log.push(`${peer.name}:${step(peer, rnd)}`);

    if (rnd() < 0.6) deliver();

    // Инвариант сразу после каждого шага: хранилище равно проекции собственного Y.Doc.
    if (!peer.collab.inSync()) {
      fail(
        `${peer.name} store differs from the projection after "${log[log.length - 1]}"\n${describeDiff(peer)}`,
      );
    }
  }

  for (const peer of peers) peer.online = true;

  for (const queue of outbox.values()) {
    for (const message of queue.splice(0)) message.to.collab.receive(message.update);
  }

  syncAll(peers);

  const reference = canonical(project(peers[0].ydoc));

  peers.forEach((peer) => {
    if (canonical(project(peer.ydoc)) !== reference)
      fail(`${peer.name} projection differs after sync`);
    if (!peer.collab.inSync()) fail(`${peer.name} store differs from the projection after sync`);

    const issues = validateSnapshot(peer.editor.serialize(), schema);

    if (issues.length > 0) fail(`${peer.name} snapshot is invalid: ${issues.join('; ')}`);
    if (JSON.stringify(peer.editor.serialize().blocks).includes('�'))
      fail(`${peer.name} has U+FFFD`);
  });

  const vectors = peers.map((peer) => Buffer.from(Y.encodeStateVector(peer.ydoc)).toString('hex'));

  expect(new Set(vectors).size).toBe(1);
}

describe('convergence (fuzz)', () => {
  const runs = Number(process.env.COLLAB_FUZZ_RUNS ?? 30);
  const steps = Number(process.env.COLLAB_FUZZ_STEPS ?? 120);
  const start = Number(process.env.COLLAB_FUZZ_SEED ?? 1);
  const peers = Number(process.env.COLLAB_FUZZ_PEERS ?? 3);

  for (let seed = start; seed < start + runs; seed++) {
    it(`seed ${seed}, ${peers} peers`, () => run(seed, peers, steps));
  }

  it('one peer keeps the store equal to the projection', () => run(9001, 1, 300));
});
