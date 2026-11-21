import { describe, expect, it } from 'vitest';

import { deserializeDocument, validateSnapshot } from '@inkbrick/document';
import { Editor, columnsBlocks, type CaretResult } from '../src';

const COLUMNS = 'block:columns';
const COLUMN = 'block:column';

function setup(count: number) {
  const editor = new Editor({ blocks: columnsBlocks });
  const get = (id: string) => editor.document.getBlock(id)!;
  const noteId = get(editor.document.rootId).children[0];
  const ids = [get(noteId).children[0]];

  for (let i = 1; i < count; i++) {
    ids.push(
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
        }) as CaretResult
      ).blockId,
    );
  }

  ids.forEach((blockId, i) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId, from: 0, to: 0, text: `b${i}` } }),
  );
  editor.clearHistory();

  const textOf = (id: string) => editor.engine.inline.toPlainText(get(id).content);
  const shape = (id: string = noteId): unknown[] =>
    get(id).children.map((childId) => {
      const child = get(childId);

      return child.flavour === COLUMNS || child.flavour === COLUMN
        ? shape(childId)
        : textOf(childId);
    });

  return { editor, get, noteId, ids, shape, textOf };
}

/** Детерминированный генератор (mulberry32): падение воспроизводится по зерну. */
function random(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Нарушения инвариантов колонок: пустые колонки, колонки из одной, доли не по числу колонок, потерянные блоки. */
function problems(editor: Editor, ids: string[]): string[] {
  const found: string[] = [];
  const blocks = Object.values(editor.serialize().blocks ?? {}) as Array<{
    id: string;
    flavour: string;
    children: string[];
    props: Record<string, unknown>;
  }>;

  for (const block of blocks) {
    if (block.flavour === COLUMN && block.children.length === 0)
      found.push(`empty column ${block.id}`);
    if (block.flavour === COLUMNS && block.children.length < 2)
      found.push(`lonely columns ${block.id}`);
    if (
      block.flavour === COLUMNS &&
      Array.isArray(block.props.ratios) &&
      block.props.ratios.length !== block.children.length
    ) {
      found.push(`ratios of ${block.id}`);
    }
  }

  for (const id of ids) if (!editor.document.getBlock(id)) found.push(`lost ${id}`);

  return found;
}

describe('columns: saved and loaded after drags', () => {
  it('a document after a series of drags loads back the same', () => {
    const { editor, ids, shape } = setup(5);
    const side = (blockId: string, targetId: string, to: 'left' | 'right') =>
      editor.dispatch({ type: 'moveBlockToSide', payload: { blockId, targetId, side: to } });

    side(ids[1], ids[0], 'right');
    side(ids[2], ids[1], 'right');
    editor.dispatch({
      type: 'moveBlock',
      payload: { blockId: ids[3], targetId: ids[0], position: 'after' },
    });
    editor.dispatch({
      type: 'moveBlock',
      payload: { blockId: ids[2], targetId: ids[4], position: 'after' },
    });

    const snapshot = editor.serialize();

    expect(validateSnapshot(snapshot, editor.schema)).toEqual([]);

    const restored = new Editor({
      blocks: columnsBlocks,
      document: deserializeDocument(snapshot, { schema: editor.schema }),
    });

    expect(restored.serialize()).toEqual(snapshot);
    expect(shape()).toEqual([[['b0', 'b3'], ['b1']], 'b4', 'b2']);
  });
});

describe('columns: random drags keep the document sound', () => {
  // INKBRICK_FUZZ=<число> добавляет столько случайных зёрен и удваивает шаги: долгий прогон вручную.
  const EXTRA = Number(process.env.INKBRICK_FUZZ ?? 0);
  const SEEDS = [
    ...[1, 2, 3, 7, 42, 2024, 31337, 99991],
    ...Array.from({ length: EXTRA }, (_, i) => 100_000 + i),
  ];
  const STEPS = EXTRA > 0 ? 300 : 150;

  for (const seed of SEEDS) {
    it(`seed ${seed}: ${STEPS} drags, undos and redos`, () => {
      const { editor, ids, shape } = setup(7);
      const next = random(seed);
      const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
      const log: string[] = [];

      for (let step = 0; step < STEPS; step++) {
        const roll = next();
        const blockId = pick(ids);
        const targetId = pick(ids);

        if (roll < 0.4) {
          const payload = { blockId, targetId, side: pick(['left', 'right'] as const) };

          if (editor.can('moveBlockToSide', payload)) {
            editor.dispatch({ type: 'moveBlockToSide', payload });
            log.push(`side ${JSON.stringify(payload)}`);
          }
        } else if (roll < 0.8) {
          const payload = { blockId, targetId, position: pick(['before', 'after'] as const) };

          if (editor.can('moveBlock', payload)) {
            editor.dispatch({ type: 'moveBlock', payload });
            log.push(`move ${JSON.stringify(payload)}`);
          }
        } else if (roll < 0.92) {
          editor.store.undo();
          log.push('undo');
        } else {
          editor.store.redo();
          log.push('redo');
        }

        editor.sealHistory();

        const found = [
          ...problems(editor, ids),
          ...validateSnapshot(editor.serialize(), editor.schema).map((issue) => String(issue)),
        ];

        if (found.length > 0) {
          throw new Error(
            `seed ${seed}, step ${step}: ${found.join('; ')}\n${log.slice(-8).join('\n')}\n${JSON.stringify(shape())}`,
          );
        }
      }

      // Все тексты на месте, ни один не задвоен.
      const texts = JSON.stringify(shape()).match(/b\d/g)!.sort();

      expect(texts).toEqual(ids.map((_, i) => `b${i}`).sort());
    });
  }
});
