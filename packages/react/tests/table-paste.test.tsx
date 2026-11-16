import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { validateSnapshot } from '@inkbrick/document';
import { locateTableCell, tableCellAt, tableSize, type CaretResult } from '@inkbrick/engine';

import { tableBlocks } from '../src';
import { tabularText } from '../src/clipboard/tabularText';
import { mountEditor } from './harness';

afterEach(cleanup);

const EXCEL =
  '<table border=0 cellpadding=0 cellspacing=0><tr><td>Name</td><td>Qty</td></tr>' +
  '<tr><td>Apple</td><td align=right>3</td></tr><tr><td>Pear</td><td align=right>10</td></tr></table>';

/** Текст ячеек таблицы по строкам; таблица — n-й таблица заметки. */
function tableText(mounted: ReturnType<typeof mountEditor>, index = 0): string[][] | null {
  const { editor, blocks } = mounted;
  const getBlock = (id: string) => editor.document.getBlock(id)!;
  const table = blocks()
    .filter((id) => getBlock(id).flavour === 'block:table')
    .map(getBlock)[index];

  return table
    ? table.children.map((rowId) =>
        getBlock(rowId).children.map((cellId) =>
          editor.engine.inline.toPlainText(getBlock(cellId).content),
        ),
      )
    : null;
}

describe('pasting tables', () => {
  it('HTML from Excel or the web becomes a table', () => {
    const mounted = mountEditor([''], { blocks: tableBlocks });
    const { ids, caret, clipboard, editor } = mounted;

    caret(ids[0], 0);
    clipboard('paste', { 'text/html': EXCEL, 'text/plain': 'Name\tQty\nApple\t3\nPear\t10' });

    expect(tableText(mounted)).toEqual([
      ['Name', 'Qty'],
      ['Apple', '3'],
      ['Pear', '10'],
    ]);
    expect(validateSnapshot(editor.serialize(), editor.schema)).toEqual([]);
  });

  it('plain text with tabs becomes a table when there is no HTML', () => {
    const mounted = mountEditor([''], { blocks: tableBlocks });

    mounted.caret(mounted.ids[0], 0);
    mounted.clipboard('paste', { 'text/plain': 'a\tb\r\nc\td\r\n' });

    expect(tableText(mounted)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('quoted cells with tabs and line breaks stay in one cell', () => {
    const mounted = mountEditor([''], { blocks: tableBlocks });

    mounted.caret(mounted.ids[0], 0);
    mounted.clipboard('paste', { 'text/plain': 'x\t"two\nlines"\n"a\tb"\ty' });

    expect(tableText(mounted)).toEqual([
      ['x', 'two\nlines'],
      ['a\tb', 'y'],
    ]);
  });

  it('Ctrl+Shift+V pastes the text as it is', () => {
    const mounted = mountEditor([''], { blocks: tableBlocks });

    mounted.caret(mounted.ids[0], 0);
    mounted.key('V', { ctrl: true, shift: true });
    mounted.clipboard('paste', { 'text/plain': 'a\tb\nc\td' });

    expect(mounted.outline()).toEqual(['paragraph:a\tb', 'paragraph:c\td']);
  });

  it('text that only looks a bit like a table stays text', () => {
    const mounted = mountEditor([''], { blocks: tableBlocks });

    mounted.caret(mounted.ids[0], 0);
    mounted.clipboard('paste', { 'text/plain': 'one\ttwo' });

    expect(mounted.outline()).toEqual(['paragraph:one\ttwo']);
  });

  it('code stays code', () => {
    const mounted = mountEditor([''], { blocks: tableBlocks });

    mounted.caret(mounted.ids[0], 0);
    mounted.type('``` ');
    mounted.clipboard('paste', { 'text/plain': 'a\tb\nc\td', 'text/html': EXCEL });

    expect(mounted.outline()).toEqual(['code:a\tb\nc\td']);
  });

  it('in an editor without tables the rows arrive as paragraphs with tabs, as before', () => {
    const html = mountEditor(['']);

    html.caret(html.ids[0], 0);
    html.clipboard('paste', { 'text/html': EXCEL });
    expect(html.outline()).toEqual([
      'paragraph:Name\tQty',
      'paragraph:Apple\t3',
      'paragraph:Pear\t10',
    ]);

    const text = mountEditor(['']);

    text.caret(text.ids[0], 0);
    text.clipboard('paste', { 'text/plain': 'a\tb\nc\td' });
    expect(text.outline()).toEqual(['paragraph:a\tb', 'paragraph:c\td']);
  });

  it('pasted into the cells of an existing table it fills them from the caret', () => {
    const mounted = mountEditor(['intro'], { blocks: tableBlocks });
    const { editor, ids, caret, clipboard } = mounted;
    const getBlock = (id: string) => editor.document.getBlock(id);
    let made!: CaretResult;

    act(() => {
      made = editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:table', afterId: ids[0] },
      }) as CaretResult;
    });

    const tableId = locateTableCell(getBlock, made.blockId)!.tableId;

    caret(tableCellAt(getBlock, tableId, 1, 1)!, 0);
    clipboard('paste', { 'text/plain': 'a\tb\tc\nd\te\tf' });

    expect(tableSize(getBlock, tableId)).toEqual({ rows: 3, columns: 4 });
    expect(tableText(mounted)).toEqual([
      ['', '', '', ''],
      ['', 'a', 'b', 'c'],
      ['', 'd', 'e', 'f'],
    ]);
  });
});

describe('copying tables', () => {
  function withTable() {
    const mounted = mountEditor(['intro'], { blocks: tableBlocks });
    const { editor, ids, select } = mounted;
    const getBlock = (id: string) => editor.document.getBlock(id);
    let made!: CaretResult;

    act(() => {
      made = editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:table', afterId: ids[0] },
      }) as CaretResult;
    });

    const tableId = locateTableCell(getBlock, made.blockId)!.tableId;
    const cell = (r: number, c: number) => tableCellAt(getBlock, tableId, r, c)!;

    act(() => {
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          editor.dispatch({
            type: 'replaceText',
            payload: { blockId: cell(r, c), from: 0, to: 0, text: `${r}${c}` },
          });
    });

    return { ...mounted, tableId, cell, select };
  }

  it('puts a table on the clipboard as HTML and as tab-separated text', () => {
    const { select, cell, clipboard } = withTable();

    select({ blockId: cell(0, 0), offset: 0 }, { blockId: cell(1, 2), offset: 2 });

    const copied = clipboard('copy');

    expect(copied['text/plain']).toBe('00\t01\t02\n10\t11\t12');
    expect(copied['text/html']).toContain('<table>');
    expect(copied['text/html']).toContain('<td>11</td>');
  });

  it('a table copied in one editor pastes as a table in another', () => {
    const { select, cell, clipboard, unmount } = withTable();

    select({ blockId: cell(1, 0), offset: 0 }, { blockId: cell(2, 2), offset: 2 });

    const copied = clipboard('copy');

    unmount();

    const target = mountEditor([''], { blocks: tableBlocks });

    target.caret(target.ids[0], 0);
    target.clipboard('paste', copied);

    expect(tableText(target)).toEqual([
      ['10', '11', '12'],
      ['20', '21', '22'],
    ]);
  });

  it('the same data pastes as a table from the HTML alone (an app that drops our own format)', () => {
    const { select, cell, clipboard, unmount } = withTable();

    select({ blockId: cell(0, 0), offset: 0 }, { blockId: cell(0, 2), offset: 2 });

    const html = clipboard('copy')['text/html'].replace(/ data-inkbrick-fragment="[^"]*"/, '');

    unmount();

    const target = mountEditor([''], { blocks: tableBlocks });

    target.caret(target.ids[0], 0);
    target.clipboard('paste', { 'text/html': html });

    expect(tableText(target)).toEqual([['00', '01', '02']]);
  });
});

describe('tabularText', () => {
  it('needs two rows, two columns and the same number of cells in every row', () => {
    expect(tabularText('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(tabularText('a\tb')).toBeNull();
    expect(tabularText('a\nb')).toBeNull();
    expect(tabularText('a\tb\nc')).toBeNull();
    expect(tabularText('a\tb\nc\td\te')).toBeNull();
    expect(tabularText('no tabs at all')).toBeNull();
    expect(tabularText('\ta\n\tb')).toEqual([
      ['', 'a'],
      ['', 'b'],
    ]);
  });
});
