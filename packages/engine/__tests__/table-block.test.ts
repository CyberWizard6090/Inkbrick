import { describe, expect, it } from 'vitest';

import { validateSnapshot, type BlockId } from '@inkbrick/document';

import {
  Editor,
  columnsBlocks,
  locateTableCell,
  tableBlocks,
  tableCellAt,
  toggleBlocks,
  type CaretResult,
} from '../src/internal';

/** JSON с ключами по алфавиту: отмена и копирование могут вернуть те же props в другом порядке ключей. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

/** Документ: абзацы «a», «b», таблица 2×2 с оформлением, «c». Таблица и абзацы — блоки, которые можно переносить. */
function setup() {
  const editor = new Editor({ blocks: [...tableBlocks, ...columnsBlocks, ...toggleBlocks] });
  const getBlock = (id: BlockId) => editor.document.getBlock(id);
  const get = (id: BlockId) => getBlock(id)!;
  const noteId = get(editor.document.rootId).children[0];
  const a = get(noteId).children[0];
  const insert = (flavour: string, afterId: string) =>
    (editor.dispatch({ type: 'insertBlock', payload: { flavour, afterId } }) as CaretResult)
      .blockId;
  const write = (blockId: string, text: string) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId, from: 0, to: 0, text } });

  write(a, 'a');

  const b = insert('block:paragraph', a);

  write(b, 'b');

  const tableId = locateTableCell(getBlock, insert('block:table', b))!.tableId;
  const cell = (r: number, c: number) => tableCellAt(getBlock, tableId, r, c)!;

  editor.dispatch({ type: 'deleteTableRow', payload: { blockId: tableId, index: 2 } } as never);
  editor.dispatch({ type: 'deleteTableColumn', payload: { blockId: tableId, index: 2 } } as never);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) write(cell(r, c), `r${r}c${c}`);

  const range = { top: 0, left: 0, bottom: 1, right: 1 };
  const run = (type: string, payload: Record<string, unknown>) =>
    editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);

  run('setTableColumnWidth', { index: 0, width: 140 });
  run('setTableColumnType', { index: 1, type: 'number' });
  run('setTableCellsBackground', { range: { ...range, bottom: 0 }, background: 'yellow' });
  run('setTableCellsBorders', {
    range,
    mode: 'outside',
    width: 'thick',
    color: 'red',
    style: 'dashed',
  });
  run('mergeTableCells', { range: { top: 1, left: 0, bottom: 1, right: 1 } });
  editor.dispatch({
    type: 'setBlockProps',
    payload: { blockId: tableId, props: { striped: true, freezeRow: true, tableStyle: undefined } },
  } as never);

  const c = insert('block:paragraph', tableId);

  write(c, 'c');
  editor.clearHistory();

  const text = (id: string) => editor.engine.inline.toPlainText(get(id).content);
  /** Всё о таблице, кроме id: текст ячеек, props таблицы и ячеек. */
  const look = (id: string) =>
    canonical({
      props: get(id).props,
      rows: get(id).children.map((rowId) =>
        get(rowId).children.map((cellId) => ({ text: text(cellId), props: get(cellId).props })),
      ),
    });
  const valid = () => validateSnapshot(editor.serialize(), editor.schema);
  const move = (blockId: string, targetId: string, position: 'before' | 'after') =>
    editor.dispatch({ type: 'moveBlock', payload: { blockId, targetId, position } });

  return { editor, get, noteId, a, b, c, tableId, cell, look, valid, move, insert, write, text };
}

describe('a table as a block', () => {
  it('goes into columns and back, keeping everything', () => {
    const { editor, get, noteId, a, tableId, look, valid, move } = setup();
    const before = look(tableId);

    editor.dispatch({
      type: 'moveBlockToSide',
      payload: { blockId: tableId, targetId: a, side: 'right' },
    });
    expect(get(get(tableId).parentId!).flavour).toBe('block:column');
    expect(look(tableId)).toBe(before);

    move(tableId, a, 'after');
    expect(get(tableId).parentId).toBe(noteId);
    expect(get(noteId).children.some((id) => get(id).flavour === 'block:columns')).toBe(false);
    expect(look(tableId)).toBe(before);
    expect(valid()).toEqual([]);
  });

  it('does not go into a toggle: the toggle does not take tables', () => {
    const { editor, get, noteId, c, tableId, look, move, insert } = setup();
    const before = look(tableId);
    const toggle = insert('block:toggle', c);
    const inner = (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', parentId: toggle },
      }) as CaretResult
    ).blockId;

    expect(get(inner).parentId).toBe(toggle);
    expect(editor.can('moveBlock', { blockId: tableId, targetId: inner, position: 'after' })).toBe(
      false,
    );

    move(tableId, inner, 'after');
    expect(get(tableId).parentId).toBe(noteId);
    expect(look(tableId)).toBe(before);
  });

  it('a duplicate is an independent copy', () => {
    const { editor, get, tableId, look, valid } = setup();
    const before = look(tableId);
    const copyCaret = editor.dispatch({
      type: 'duplicateBlock',
      payload: { blockId: tableId },
    }) as CaretResult;
    const copyId =
      locateTableCell((id) => editor.document.getBlock(id), copyCaret.blockId)?.tableId ??
      copyCaret.blockId;

    expect(copyId).not.toBe(tableId);
    expect(get(copyId).flavour).toBe('block:table');
    expect(look(copyId)).toBe(before);

    // Правки копии не трогают оригинал.
    const run = (type: string, payload: Record<string, unknown>) =>
      editor.dispatch({ type, payload: { blockId: copyId, ...payload } } as never);

    run('setTableColumnWidth', { index: 0, width: 300 });
    run('setTableCellsBackground', {
      range: { top: 0, left: 0, bottom: 0, right: 1 },
      background: null,
    });
    run('splitTableCell', { row: 1, column: 0 });
    run('insertTableRow', { index: 0 });

    expect(look(tableId)).toBe(before);
    expect(look(copyId)).not.toBe(before);

    // У копии свои ячейки: ни одна не общая.
    const cellsOf = (id: string) => get(id).children.flatMap((rowId) => get(rowId).children);

    expect(cellsOf(copyId).some((id) => cellsOf(tableId).includes(id))).toBe(false);
    expect(valid()).toEqual([]);
  });

  it('deleting the table and undoing brings back every property', () => {
    const { editor, get, tableId, look, valid } = setup();
    const before = look(tableId);
    const snapshot = canonical(editor.serialize());

    editor.dispatch({ type: 'delete-block', payload: { id: tableId } } as never);
    expect(editor.document.getBlock(tableId)).toBeUndefined();

    editor.undo();
    expect(look(tableId)).toBe(before);
    expect(get(tableId).props.merges).toEqual([{ row: 1, column: 0, rows: 1, columns: 2 }]);
    expect(canonical(editor.serialize())).toBe(snapshot);
    expect(valid()).toEqual([]);

    editor.redo();
    expect(editor.document.getBlock(tableId)).toBeUndefined();
  });

  it('turning a paragraph with text into a table keeps the text and puts the table after it', () => {
    const { editor, get, noteId, b, text, valid } = setup();
    const before = get(noteId).children.length;

    editor.dispatch({ type: 'convertBlock', payload: { blockId: b, flavour: 'block:table' } });

    const children = get(noteId).children;
    const at = children.indexOf(b);

    expect(text(b)).toBe('b');
    expect(get(children[at + 1]).flavour).toBe('block:table');
    expect(children.length).toBeGreaterThan(before);
    expect(valid()).toEqual([]);

    // Таблицу не превратить обратно в абзац: её содержимое не текст.
    const tableId = children[at + 1];

    expect(editor.can('convertBlock', { blockId: tableId, flavour: 'block:paragraph' })).toBe(
      false,
    );
  });

  it('rows and cells of a table cannot be moved out of it as blocks', () => {
    const { editor, get, tableId, c, cell } = setup();
    const row = get(tableId).children[0];

    expect(editor.can('moveBlock', { blockId: row, targetId: c, position: 'after' })).toBe(false);
    expect(editor.can('moveBlock', { blockId: cell(0, 0), targetId: c, position: 'after' })).toBe(
      false,
    );
    expect(editor.can('moveBlockToSide', { blockId: cell(0, 0), targetId: c, side: 'left' })).toBe(
      false,
    );
    expect(editor.can('duplicateBlock', { blockId: row })).toBe(false);
  });
});
