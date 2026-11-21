import { describe, expect, it } from 'vitest';

import { Editor, locateTableCell, tableBlocks, type CaretResult } from '../src';

/** Команда, которая ничего не меняет, не оставляет шага в истории: иначе Ctrl+Z «ничего не делает». */
describe('a command that changes nothing leaves no undo step', () => {
  function setup() {
    const editor = new Editor({ blocks: tableBlocks });
    const getBlock = (id: string) => editor.document.getBlock(id);
    const noteId = getBlock(editor.document.rootId)!.children[0];
    const firstId = getBlock(noteId)!.children[0];
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: firstId },
    }) as CaretResult;
    const tableId = locateTableCell(getBlock, caret.blockId)!.tableId;

    editor.clearHistory();

    return { editor, firstId, tableId };
  }

  const range = { top: 0, bottom: 1, left: 0, right: 1 };

  it('removing a background the cells do not have', () => {
    const { editor, tableId } = setup();

    editor.dispatch({
      type: 'setTableCellsBackground',
      payload: { blockId: tableId, range, background: null },
    } as never);

    expect(editor.canUndo).toBe(false);
  });

  it('setting the alignment or background the cells already have', () => {
    const { editor, tableId } = setup();
    const run = (type: string, extra: Record<string, unknown>) =>
      editor.dispatch({ type, payload: { blockId: tableId, range, ...extra } } as never);

    run('setTableCellsBackground', { background: 'red' });
    run('alignTableCells', { align: 'center' });
    editor.clearHistory();

    run('setTableCellsBackground', { background: 'red' });
    run('alignTableCells', { align: 'center' });

    expect(editor.canUndo).toBe(false);
  });

  it('setting block props to what they are', () => {
    const { editor, firstId, tableId } = setup();

    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: firstId, props: {} },
    } as never);
    editor.dispatch({
      type: 'setTableColumnType',
      payload: { blockId: tableId, index: 0, type: 'text' },
    } as never);

    expect(editor.canUndo).toBe(false);
  });

  it('a real change still makes one step, and undo brings the document back', () => {
    const { editor, tableId } = setup();
    const before = JSON.stringify(editor.serialize());

    editor.dispatch({
      type: 'setTableCellsBackground',
      payload: { blockId: tableId, range, background: 'blue' },
    } as never);
    expect(editor.canUndo).toBe(true);

    editor.undo();
    expect(JSON.stringify(editor.serialize())).toBe(before);
    expect(editor.canUndo).toBe(false);
  });
});
