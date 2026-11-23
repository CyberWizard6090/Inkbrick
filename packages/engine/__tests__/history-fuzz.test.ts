import { describe, expect, it } from 'vitest';

import { serializeDocument, validateSnapshot, type BaseBlock } from '@inkbrick/document';

import {
  Editor,
  columnsFeature,
  tableCellAt,
  tableFeature,
  tableSize,
  toggleFeature,
} from '../src/internal';

/**
 * Undo/redo на случайных последовательностях структурных правок: ввод, удаление, деление и склейка блоков, вставка,
 * смена типа, перенос (в том числе вбок, в колонки), вложенность, дублирование, удаление групп, оформление, строки,
 * столбцы и объединение ячеек таблиц. После каждого шага документ цел (`validateSnapshot`); отмена проходит все
 * состояния в обратном порядке до исходного, повтор — вперёд до последнего. Падение воспроизводится по зерну.
 */

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

/** Состояние документа без отметок времени: undo возвращает блоки, а не их `meta`. */
function state(editor: Editor): string {
  const blocks = editor.document.dump();

  return JSON.stringify(
    Object.keys(blocks)
      .sort()
      .map((id) => {
        const { meta: _meta, ...rest } = blocks[id] as BaseBlock;

        return rest;
      }),
  );
}

const FLAVOURS = [
  'block:paragraph',
  'block:heading',
  'block:list',
  'block:quote',
  'block:code',
  'block:divider',
  'block:table',
  'block:toggle',
];

function run(seed: number, steps: number) {
  const rand = random(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const int = (max: number) => Math.floor(rand() * (max + 1));
  const editor = new Editor({ features: [tableFeature, columnsFeature, toggleFeature] });
  const all = () =>
    Object.values(editor.document.dump()).filter(
      (block) => block.flavour !== 'block:page' && block.flavour !== 'block:note',
    );
  const textual = () =>
    all().filter((block) => editor.schema.getBlockSchema(block.flavour)?.inline !== false);
  const length = (block: BaseBlock) => block.content.reduce((n, node) => n + node.insert.length, 0);
  const tables = () => all().filter((block) => block.flavour === 'block:table');
  const point = (block: BaseBlock) => ({ blockId: block.id, offset: int(length(block)) });

  const actions: (() => { type: string; payload: Record<string, unknown> } | null)[] = [
    () => {
      const block = pick(textual());
      const at = int(length(block));

      return {
        type: 'replaceText',
        payload: { blockId: block.id, from: at, to: at, text: pick(['a', 'word ', 'xy z']) },
      };
    },
    () => {
      const block = pick(textual());
      const from = int(length(block));

      return {
        type: 'deleteText',
        payload: { blockId: block.id, from, to: Math.min(length(block), from + 1 + int(3)) },
      };
    },
    () => {
      const block = pick(textual());

      return { type: 'splitBlock', payload: { blockId: block.id, offset: int(length(block)) } };
    },
    () => ({ type: 'deleteBackward', payload: { blockId: pick(textual()).id, offset: 0 } }),
    () => ({
      type: 'insertBlock',
      payload: { flavour: pick(FLAVOURS), afterId: pick(all()).id },
    }),
    () => ({
      type: 'convertBlock',
      payload: { blockId: pick(textual()).id, flavour: pick(FLAVOURS.slice(0, 5)) },
    }),
    () => ({
      type: 'moveBlock',
      payload: {
        blockId: pick(all()).id,
        targetId: pick(all()).id,
        position: pick(['before', 'after'] as const),
      },
    }),
    () => ({
      type: 'moveBlockToSide',
      payload: {
        blockId: pick(all()).id,
        targetId: pick(all()).id,
        side: pick(['left', 'right'] as const),
      },
    }),
    () => ({ type: pick(['indentBlock', 'outdentBlock']), payload: { blockId: pick(all()).id } }),
    () => {
      const lists = all().filter((block) => block.flavour === 'block:list');

      return lists.length > 0
        ? { type: pick(['indentBlock', 'outdentBlock']), payload: { blockId: pick(lists).id } }
        : null;
    },
    () => ({ type: 'duplicateBlock', payload: { blockId: pick(all()).id } }),
    () => {
      const blocks = all();

      return {
        type: 'delete-blocks',
        payload: { ids: blocks.filter(() => rand() < 0.15).map((block) => block.id) },
      };
    },
    () => {
      const blocks = textual();
      const a = pick(blocks);
      const b = pick(blocks);

      return rand() < 0.5
        ? {
            type: 'toggleFormatRange',
            payload: { from: point(a), to: point(b), format: pick(['bold', 'italic', 'code']) },
          }
        : {
            type: 'setInlineAttributes',
            payload: { from: point(a), to: point(b), attributes: { color: pick(['red', 'blue']) } },
          };
    },
    () => {
      const table = tables().length > 0 ? pick(tables()) : null;

      if (!table) return null;

      const size = tableSize((id) => editor.document.getBlock(id), table.id)!;
      const type = pick([
        'insertTableRow',
        'insertTableColumn',
        'deleteTableRow',
        'deleteTableColumn',
        'moveTableRow',
        'mergeTableCells',
        'splitTableCell',
      ]);
      const row = int(size.rows - 1);
      const column = int(size.columns - 1);

      switch (type) {
        case 'insertTableRow':
          return { type, payload: { blockId: table.id, index: int(size.rows) } };
        case 'insertTableColumn':
          return { type, payload: { blockId: table.id, index: int(size.columns) } };
        case 'deleteTableRow':
          return { type, payload: { blockId: table.id, index: row } };
        case 'deleteTableColumn':
          return { type, payload: { blockId: table.id, index: column } };
        case 'moveTableRow':
          return { type, payload: { blockId: table.id, from: row, to: int(size.rows - 1) } };
        case 'mergeTableCells':
          return {
            type,
            payload: {
              blockId: table.id,
              range: {
                top: row,
                left: column,
                bottom: Math.min(size.rows - 1, row + int(1)),
                right: Math.min(size.columns - 1, column + int(1)),
              },
            },
          };
        default:
          return { type, payload: { blockId: table.id, row, column } };
      }
    },
    () => {
      // Ввод в ячейку таблицы.
      const table = tables().length > 0 ? pick(tables()) : null;
      const cell = table && tableCellAt((id) => editor.document.getBlock(id), table.id, 0, 0);

      return cell
        ? { type: 'replaceText', payload: { blockId: cell, from: 0, to: 0, text: 'c' } }
        : null;
    },
  ];

  // Начальный документ: списки (для вложенности), таблица, переключатель и абзацы — друг за другом в заметке.
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];

  for (const flavour of [
    'block:list',
    'block:list',
    'block:list',
    'block:table',
    'block:toggle',
    'block:paragraph',
    'block:table',
    'block:paragraph',
  ]) {
    const afterId = editor.document.getBlock(note)!.children.at(-1)!;

    editor.dispatch({ type: 'insertBlock', payload: { flavour, afterId } });
  }

  editor.clearHistory();

  // Правки таблиц и ячеек — чаще: таблиц в документе меньше, чем остальных блоков.
  actions.push(
    actions[actions.length - 2],
    actions[actions.length - 2],
    actions[actions.length - 1],
  );

  const states = [state(editor)];
  const log: string[] = [];

  for (let step = 0; step < steps; step++) {
    const intent = pick(actions)();

    if (!intent) continue;

    const before = editor.store.getVersion();

    // Каждая правка — свой шаг истории: слияние набора текста проверяется отдельно.
    editor.sealHistory();

    try {
      editor.execute(intent.type as never, intent.payload as never);
    } catch (error) {
      // Недопустимая правка откатывается целиком и не оставляет следа.
      expect(state(editor), `${intent.type} threw and changed the document`).toBe(states.at(-1));
      log.push(`${intent.type} (refused: ${(error as Error).message})`);
      continue;
    }

    if (editor.store.getVersion() === before) continue;

    log.push(intent.type);
    expect(validateSnapshot(serializeDocument(editor.document, editor.schema), editor.schema), {
      toString: () => `seed ${seed}, after ${log.join(' → ')}`,
    } as never).toEqual([]);
    states.push(state(editor));
  }

  return { editor, states, log };
}

describe('undo/redo over random structural edits', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}: every undo walks back one state, redo walks forward again`, () => {
      const { editor, states, log } = run(seed, 150);
      const where = (n: number) => `seed ${seed}, step ${n}: ${log.slice(0, n).join(' → ')}`;

      expect(states.length).toBeGreaterThan(30);

      for (let n = states.length - 1; n > 0; n--) {
        expect(editor.canUndo, where(n)).toBe(true);
        editor.undo();
        expect(state(editor), `undo to ${where(n - 1)}`).toBe(states[n - 1]);
      }

      expect(editor.canUndo).toBe(false);

      for (let n = 1; n < states.length; n++) {
        editor.redo();
        expect(state(editor), `redo to ${where(n)}`).toBe(states[n]);
      }

      expect(editor.canRedo).toBe(false);
      expect(
        validateSnapshot(serializeDocument(editor.document, editor.schema), editor.schema),
      ).toEqual([]);
    });
  }
});

describe('history merging over random typing', () => {
  it('a run of single characters in one block is one step; another block or a deletion starts a new one', () => {
    const rand = random(42);
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const blocks = [editor.document.getBlock(note)!.children[0]];

    for (let i = 0; i < 3; i++)
      blocks.push(
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId: blocks.at(-1)! },
        })!.blockId,
      );

    editor.clearHistory();

    const states = [state(editor)];
    let last = '';

    for (let i = 0; i < 200; i++) {
      const blockId = blocks[Math.floor(rand() * blocks.length)];
      const block = editor.document.getBlock(blockId)!;
      const size = block.content.reduce((n, node) => n + node.insert.length, 0);
      const erase = size > 0 && rand() < 0.3;
      // Ключ шага: набор и стирание в одном блоке сливаются, иначе — новый шаг.
      const key = `${erase ? 'delete' : 'insert'}:${blockId}`;

      if (erase)
        editor.dispatch({ type: 'deleteText', payload: { blockId, from: size - 1, to: size } });
      else
        editor.dispatch({
          type: 'replaceText',
          payload: { blockId, from: size, to: size, text: 'x' },
        });

      if (key === last) states[states.length - 1] = state(editor);
      else states.push(state(editor));

      last = key;
    }

    for (let n = states.length - 1; n > 0; n--) {
      editor.undo();
      expect(state(editor), `undo of run ${n}`).toBe(states[n - 1]);
    }

    expect(editor.canUndo).toBe(false);
  });
});
