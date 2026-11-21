import { describe, expect, it } from 'vitest';

import {
  TABLE_BORDER_STYLES,
  TABLE_BORDER_WIDTHS,
  normalizeMerges,
  validateSnapshot,
  type BlockId,
  type TableMerge,
} from '@inkbrick/document';

import {
  Editor,
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  locateTableCell,
  tableBlocks,
  tableCellAt,
  tableFragment,
  type CaretResult,
} from '../src';

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

function setup() {
  const editor = new Editor({ blocks: tableBlocks });
  const getBlock = (id: BlockId) => editor.document.getBlock(id);
  const get = (id: BlockId) => getBlock(id)!;
  const noteId = get(editor.document.rootId).children[0];
  const firstId = get(noteId).children[0];
  const caret = editor.dispatch({
    type: 'insertBlock',
    payload: { flavour: 'block:table', afterId: firstId },
  }) as CaretResult;
  const tableId = locateTableCell(getBlock, caret.blockId)!.tableId;
  let token = 0;

  // Каждая ячейка — свой уникальный текст «tN»: по нему видно потерю и задвоение.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      editor.dispatch({
        type: 'replaceText',
        payload: {
          blockId: tableCellAt(getBlock, tableId, r, c)!,
          from: 0,
          to: 0,
          text: `t${token++}`,
        },
      });
    }
  }

  editor.clearHistory();

  const text = (id: BlockId) => editor.engine.inline.toPlainText(get(id).content);
  const rows = () => get(tableId).children;
  const columns = () => get(rows()[0]).children.length;
  const grid = () => rows().map((rowId) => get(rowId).children.map(text));

  return { editor, get, getBlock, tableId, rows, columns, grid, nextToken: () => `t${token++}` };
}

type Setup = ReturnType<typeof setup>;

/** Нарушения инвариантов таблицы. */
function problems({ editor, get, tableId, rows, columns, grid }: Setup): string[] {
  const found: string[] = [];
  const table = get(tableId);
  const count = columns();

  if (rows().length === 0 || count === 0) found.push('empty table');

  rows().forEach((rowId, index) => {
    if (get(rowId).children.length !== count)
      found.push(`row ${index} has ${get(rowId).children.length} cells, not ${count}`);
  });

  if (rows().length * count > MAX_TABLE_CELLS) found.push('too many cells');
  if (count > MAX_TABLE_COLUMNS) found.push('too many columns');

  const merges = (table.props.merges ?? []) as TableMerge[];
  const clean = normalizeMerges(merges, rows().length, count);

  if (clean.length !== merges.length) found.push(`invalid merges ${JSON.stringify(merges)}`);
  if (table.props.merges && merges.length === 0) found.push('empty merges list');

  // Перекрытые ячейки объединения пусты.
  const cells = grid();

  for (const merge of clean) {
    for (let r = merge.row; r < merge.row + merge.rows; r++) {
      for (let c = merge.column; c < merge.column + merge.columns; c++) {
        if ((r !== merge.row || c !== merge.column) && cells[r][c] !== '')
          found.push(`covered cell ${r},${c} has «${cells[r][c]}»`);
      }
    }
  }

  // Ни один текст не задвоен.
  const tokens = cells.flat().join('\n').match(/t\d+/g) ?? [];

  if (new Set(tokens).size !== tokens.length)
    found.push(`duplicated text ${JSON.stringify(cells)}`);

  found.push(...validateSnapshot(editor.serialize(), editor.schema).map(String));

  return found;
}

/** JSON с ключами по алфавиту: отмена может вернуть те же props в другом порядке ключей. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

function diff(a: string, b: string): string {
  const x = JSON.parse(a).blocks as Record<string, unknown>;
  const y = JSON.parse(b).blocks as Record<string, unknown>;
  const out: string[] = [];

  for (const id of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const l = JSON.stringify(x[id]);
    const r = JSON.stringify(y[id]);

    if (l !== r) out.push(`${id}:\n  want ${l}\n  got  ${r}`);
  }

  if (out.length === 0) {
    const { blocks: _a, ...restA } = JSON.parse(a);
    const { blocks: _b, ...restB } = JSON.parse(b);

    out.push(`meta: ${JSON.stringify(restA)} vs ${JSON.stringify(restB)}`);
  }

  return out.slice(0, 4).join('\n');
}

describe('tables: random operations keep the table sound', () => {
  // INKBRICK_FUZZ=<число> добавляет столько случайных зёрен и удваивает шаги: долгий прогон вручную.
  const EXTRA = Number(process.env.INKBRICK_FUZZ ?? 0);
  const SEEDS = [
    ...[1, 2, 3, 5, 8, 13, 21, 42, 777, 2024],
    ...Array.from({ length: EXTRA }, (_, i) => 100_000 + i),
  ];
  const STEPS = EXTRA > 0 ? 400 : 200;

  for (const seed of SEEDS) {
    it(`seed ${seed}: ${STEPS} operations with undo and redo checked against snapshots`, () => {
      const t = setup();
      const { editor, tableId, rows, columns } = t;
      const next = random(seed);
      const int = (max: number) => Math.floor(next() * max);
      const pick = <T>(items: readonly T[]) => items[int(items.length)];
      const range = () => {
        const [a, b] = [int(rows().length), int(rows().length)];
        const [c, d] = [int(columns()), int(columns())];

        return {
          top: Math.min(a, b),
          bottom: Math.max(a, b),
          left: Math.min(c, d),
          right: Math.max(c, d),
        };
      };
      const cellAt = (r: number, c: number) => tableCellAt(t.getBlock, tableId, r, c)!;

      const operations: Array<() => { type: string; payload: Record<string, unknown> }> = [
        () => ({ type: 'insertTableRow', payload: { index: int(rows().length + 1) } }),
        () => ({ type: 'deleteTableRow', payload: { index: int(rows().length) } }),
        () => ({
          type: 'moveTableRow',
          payload: { from: int(rows().length), to: int(rows().length) },
        }),
        () => ({ type: 'insertTableColumn', payload: { index: int(columns() + 1) } }),
        () => ({ type: 'deleteTableColumn', payload: { index: int(columns()) } }),
        () => ({ type: 'moveTableColumn', payload: { from: int(columns()), to: int(columns()) } }),
        () => ({
          type: 'setTableColumnWidth',
          payload: { index: int(columns()), width: 60 + int(200) },
        }),
        () => ({
          type: 'setTableColumnType',
          payload: { index: int(columns()), type: pick(['text', 'number', 'date']) },
        }),
        () => ({
          type: 'sortTableRows',
          payload: { column: int(columns()), direction: pick(['asc', 'desc']) },
        }),
        () => ({ type: 'mergeTableCells', payload: { range: range() } }),
        () => ({ type: 'mergeTableCells', payload: { range: range() } }),
        () => ({
          type: 'splitTableCell',
          payload: { row: int(rows().length), column: int(columns()) },
        }),
        () => ({
          type: 'setTableCellsBackground',
          payload: { range: range(), background: pick(['red', 'blue', null, '#123456']) },
        }),
        () => ({
          type: 'alignTableCells',
          payload: { range: range(), align: pick(['left', 'center', 'right']) },
        }),
        () => ({
          type: 'setTableCellsBorders',
          payload: {
            range: range(),
            mode: pick(['all', 'outside', 'inside', 'none', 'keep']),
            width: pick(TABLE_BORDER_WIDTHS.filter((w) => w !== 'none')),
            color: pick(['red', 'blue', null]),
            style: pick(TABLE_BORDER_STYLES),
          },
        }),
        () => ({ type: 'resetTableColumnWidths', payload: {} }),
        () => {
          // Вставка таблицы из 1–4 строк и 1–4 столбцов в случайную ячейку, иногда с объединением.
          const height = 1 + int(4);
          const width = 1 + int(4);
          const cells = Array.from({ length: height }, () =>
            Array.from({ length: width }, () => t.nextToken()),
          );
          const merges =
            height > 1 && width > 1 && next() < 0.3
              ? [{ row: 0, column: 0, rows: 2, columns: 2 }]
              : undefined;

          if (merges) cells[0][1] = cells[1][0] = cells[1][1] = '';

          return {
            type: 'pasteFragment',
            payload: {
              at: { blockId: cellAt(int(rows().length), int(columns())), offset: 0 },
              fragment: tableFragment(cells, merges ? { merges } : {}),
            },
          };
        },
      ];

      const past: string[] = [];
      const future: string[] = [];
      const log: string[] = [];
      const snapshot = () => canonical(editor.serialize());

      for (let step = 0; step < STEPS; step++) {
        const roll = next();
        const before = snapshot();

        if (roll < 0.15 && past.length > 0) {
          editor.store.undo();
          future.push(before);
          log.push('undo');

          const expected = past.pop()!;

          if (snapshot() !== expected)
            throw new Error(
              `${diff(expected, snapshot())}\nseed ${seed}, step ${step}: undo did not restore\n${log.slice(-6).join('\n')}`,
            );
        } else if (roll < 0.22 && future.length > 0) {
          editor.store.redo();
          past.push(before);
          log.push('redo');

          const expected = future.pop()!;

          if (snapshot() !== expected)
            throw new Error(
              `seed ${seed}, step ${step}: redo did not repeat\n${log.slice(-6).join('\n')}`,
            );
        } else {
          const { type, payload } = pick(operations)();
          const full = type === 'pasteFragment' ? payload : { blockId: tableId, ...payload };

          if (!editor.can(type, full)) continue;

          editor.dispatch({ type, payload: full } as never);
          editor.sealHistory();
          log.push(`${type} ${JSON.stringify(payload).slice(0, 160)}`);

          if (snapshot() !== before) {
            past.push(before);
            future.length = 0;
          }
        }

        const found = problems(t);

        if (found.length > 0) {
          throw new Error(
            `seed ${seed}, step ${step}: ${found.join('; ')}\n${log.slice(-8).join('\n')}`,
          );
        }
      }

      expect(log.length).toBeGreaterThan(STEPS / 3);
    });
  }
});
