import { describe, expect, it } from 'vitest';

import {
  deserializeDocument,
  toHtml,
  validateSnapshot,
  type DocumentSnapshot,
} from '@inkbrick/document';

import { Editor, createTableEditor, tableBlocks, tableIdOf, tableValue } from '../src/internal';

describe('a document saved before per-side border colours', () => {
  /** Таблица 1×2: у первой ячейки толщина по сторонам, а цвет и начертание — одни на ячейку (как раньше). */
  const legacy = (): DocumentSnapshot => {
    const editor = createTableEditor({ rows: [['old', 'next']] });
    const snapshot = structuredClone(editor.serialize());
    const table = snapshot.blocks[tableIdOf(editor)!];
    const row = snapshot.blocks[table.children[0]];
    const cell = snapshot.blocks[row.children[0]];

    cell.props = {
      borderTop: 'thick',
      borderRight: 'thin',
      borderColor: 'red',
      borderStyle: 'dashed',
    };

    return snapshot;
  };

  it('loads, validates and exports the cell-wide colour and style on every side with a width', () => {
    const snapshot = legacy();
    const editor = new Editor({ blocks: tableBlocks });
    const document = deserializeDocument(snapshot, { schema: editor.schema });
    const loaded = new Editor({ blocks: tableBlocks, document });

    expect(validateSnapshot(loaded.serialize(), loaded.schema)).toEqual([]);

    const html = toHtml(loaded.document, { schema: loaded.schema, title: false });

    expect(html).toMatch(/border-top:3px dashed #[\da-f]{6}/);
    expect(html).toMatch(/border-right:1px dashed #[\da-f]{6}/);
  });

  it('changing one side spreads the old values to the sides and keeps the look of the others', () => {
    const snapshot = legacy();
    const schemaEditor = new Editor({ blocks: tableBlocks });
    const editor = new Editor({
      blocks: tableBlocks,
      document: deserializeDocument(snapshot, { schema: schemaEditor.schema }),
    });
    const tableId = tableIdOf(editor)!;

    editor.dispatch({
      type: 'setTableCellsBorders',
      payload: {
        blockId: tableId,
        range: { top: 0, left: 0, bottom: 0, right: 0 },
        mode: 'keep',
        color: 'blue',
      },
    } as never);

    const cell = editor.document.getBlock(
      editor.document.getBlock(editor.document.getBlock(tableId)!.children[0])!.children[0],
    )!;

    expect(cell.props.borderColor).toBeUndefined();
    expect(cell.props.borderTopColor).toBe('blue');
    expect(cell.props.borderTopStyle ?? cell.props.borderStyle).toBe('dashed');
    expect(validateSnapshot(editor.serialize(), editor.schema)).toEqual([]);
  });
});

describe('a large table stays fast', () => {
  const ROWS = 40;
  const COLUMNS = 40;
  // Щедро для медленной машины CI: цель — поймать квадратичный рост, а не мерить миллисекунды.
  const BUDGET_MS = 1500;

  const make = () =>
    createTableEditor({
      rows: Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLUMNS }, (_, c) => (r === 0 ? `H${c}` : `${(r * 7919 + c) % 1000}`)),
      ),
    });

  const time = (action: () => void) => {
    const start = performance.now();

    action();

    return performance.now() - start;
  };

  it(`${ROWS}×${COLUMNS}: structure, formatting, sort and undo each within ${BUDGET_MS} ms`, () => {
    const editor = make();
    const tableId = tableIdOf(editor)!;
    const run = (type: string, payload: Record<string, unknown>) =>
      editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);
    const all = { top: 0, left: 0, bottom: ROWS - 1, right: COLUMNS - 1 };
    const timings: Record<string, number> = {
      insertRow: time(() => run('insertTableRow', { index: 1 })),
      deleteRow: time(() => run('deleteTableRow', { index: 1 })),
      deleteColumn: time(() => run('deleteTableColumn', { index: 3 })),
      insertColumn: time(() => run('insertTableColumn', { index: 3 })),
      setType: time(() => run('setTableColumnType', { index: 5, type: 'number' })),
      sort: time(() => run('sortTableRows', { column: 5, direction: 'desc' })),
      borders: time(() => run('setTableCellsBorders', { range: all, mode: 'all', width: 'thin' })),
      background: time(() => run('setTableCellsBackground', { range: all, background: 'blue' })),
      merge: time(() =>
        run('mergeTableCells', { range: { top: 5, left: 5, bottom: 25, right: 25 } }),
      ),
      undo: time(() => editor.undo()),
      serialize: time(() => editor.serialize()),
      html: time(() => toHtml(editor.document, { schema: editor.schema })),
    };

    for (const [name, ms] of Object.entries(timings)) {
      expect(ms, `${name} took ${Math.round(ms)} ms`).toBeLessThan(BUDGET_MS);
    }

    expect(tableValue(editor).rows).toHaveLength(ROWS);
  });
});
