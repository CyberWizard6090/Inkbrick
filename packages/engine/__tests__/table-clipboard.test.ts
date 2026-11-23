import { describe, expect, it } from 'vitest';

import { validateSnapshot, type BlockId, type InlineNode } from '@inkbrick/document';

import {
  Editor,
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  fragmentToHtml,
  fragmentToPlainText,
  locateTableCell,
  readTable,
  sanitizeFragment,
  tableBlocks,
  tableCellAt,
  tableFragment,
  tableSize,
  type CaretResult,
  type Fragment,
  type FragmentBlock,
} from '../src/internal';

const block = (
  flavour: string,
  props: Record<string, unknown> = {},
  content: InlineNode[] = [],
  children: FragmentBlock[] = [],
): FragmentBlock => ({ flavour, props, content, children });

const cell = (text: string, props: Record<string, unknown> = {}) =>
  block('block:table-cell', props, text ? [{ insert: text }] : []);

const row = (...texts: string[]) =>
  block(
    'block:table-row',
    {},
    [],
    texts.map((t) => cell(t)),
  );

const paragraph = (text: string) => block('block:paragraph', {}, [{ insert: text }]);

/** Таблица значений ячеек по строкам: так сравнивать удобнее, чем блоки. */
const gridOf = (table: FragmentBlock) =>
  readTable(table).rows.map((cells) =>
    cells.map((content) => content.map((node) => node.insert).join('')),
  );

function setup(options: { tables?: boolean } = {}) {
  const editor = new Editor(options.tables === false ? {} : { blocks: tableBlocks });
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];
  const get = (id: BlockId) => editor.document.getBlock(id)!;
  const getBlock = (id: BlockId) => editor.document.getBlock(id);
  const text = (id: BlockId) => editor.engine.inline.toPlainText(get(id).content);
  const type = (blockId: BlockId, value: string, offset = 0) =>
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId, from: offset, to: offset, text: value },
    });
  const noteChildren = () => get(noteId).children;
  const flavours = () => noteChildren().map((id) => get(id).flavour);
  const valid = () => validateSnapshot(editor.serialize(), editor.schema);
  const paste = (fragment: Fragment, blockId: BlockId = firstId, offset = 0) =>
    editor.dispatch({ type: 'pasteFragment', payload: { at: { blockId, offset }, fragment } }) as
      CaretResult | undefined;
  /** Вставляет таблицу после первого абзаца и подписывает ячейки «r<строка>c<столбец>». */
  const addTable = (rows = 3, columns = 3) => {
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: firstId },
    }) as CaretResult;
    const tableId = locateTableCell(getBlock, caret.blockId)!.tableId;

    const resize = (have: () => number, want: number, insert: string, remove: string) => {
      for (let n = have(); n !== want; n = have()) {
        editor.dispatch({
          type: n < want ? insert : remove,
          payload: { blockId: tableId, index: n < want ? n : n - 1 },
        } as never);
      }
    };

    // Таблица из insertBlock — 3×3; приводим к нужному размеру.
    resize(() => tableSize(getBlock, tableId)!.rows, rows, 'insertTableRow', 'deleteTableRow');
    resize(
      () => tableSize(getBlock, tableId)!.columns,
      columns,
      'insertTableColumn',
      'deleteTableColumn',
    );

    const at = (r: number, c: number) => tableCellAt(getBlock, tableId, r, c)!;

    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) type(at(r, c), `r${r}c${c}`);

    return { tableId, at };
  };
  const tableGrid = (tableId: BlockId) =>
    get(tableId).children.map((rowId) => get(rowId).children.map((id) => text(id)));

  return {
    editor,
    noteId,
    firstId,
    get,
    getBlock,
    text,
    type,
    noteChildren,
    flavours,
    valid,
    paste,
    addTable,
    tableGrid,
  };
}

describe('tableFragment', () => {
  it('builds a rectangular table from rows of text and pads short rows', () => {
    const [table] = tableFragment([['a', 'b', 'c'], ['d']]).blocks;

    expect(table.flavour).toBe('block:table');
    expect(table.props).toEqual({ header: true });
    expect(gridOf(table)).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
    ]);
  });

  it('keeps formatting, line breaks, alignment, widths and the header flag', () => {
    const [table] = tableFragment(
      [
        [[{ insert: 'bold', attributes: { bold: true } }], 'two\nlines'],
        ['x', 'y'],
      ],
      { header: false, align: ['right', undefined], widths: [120, null] },
    ).blocks;
    const grid = readTable(table);

    expect(table.props).toEqual({ header: false, widths: [120, null] });
    expect(grid.rows[0][0]).toEqual([{ insert: 'bold', attributes: { bold: true } }]);
    expect(grid.rows[0][1]).toEqual([{ insert: 'two\nlines' }]);
    expect(grid.align).toEqual(['right', undefined]);
    expect(grid.widths).toEqual([120, null]);
  });

  it('is empty without rows or cells', () => {
    expect(tableFragment([]).blocks).toEqual([]);
    expect(tableFragment([[], []]).blocks).toEqual([]);
  });

  it('copies its input: later changes do not leak into the fragment', () => {
    const content = [{ insert: 'x', attributes: { bold: true } }];
    const [table] = tableFragment([[content]]).blocks;

    content[0].attributes.bold = false;
    expect(readTable(table).rows[0][0][0].attributes).toEqual({ bold: true });
  });
});

describe('sanitizeFragment and tables', () => {
  it('keeps a table and pads ragged rows', () => {
    const table = block('block:table', { header: true }, [], [row('a', 'b', 'c'), row('d')]);
    const result = sanitizeFragment({ blocks: [table] })!;

    expect(result.blocks).toHaveLength(1);
    expect(gridOf(result.blocks[0])).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
    ]);
    expect(result.blocks[0].children.every((r) => r.children.length === 3)).toBe(true);
  });

  it('ignores stray children of a table and of its cells', () => {
    const table = block(
      'block:table',
      {},
      [],
      [
        paragraph('stray'),
        block('block:table-row', {}, [], [cell('a'), paragraph('stray cell')]),
        block('block:table-row', {}, [], [{ ...cell('b'), children: [paragraph('inside')] }]),
      ],
    );
    const [kept] = sanitizeFragment({ blocks: [table] })!.blocks;

    expect(gridOf(kept)).toEqual([['a'], ['b']]);
    expect(kept.children[1].children[0].children).toEqual([]);
  });

  it('turns rows and cells outside a table into paragraphs so their text survives', () => {
    const result = sanitizeFragment({
      blocks: [cell('lonely', { align: 'center' }), row('x', 'y'), paragraph('after')],
    })!;

    expect(result.blocks.map((b) => [b.flavour, b.content.map((n) => n.insert).join('')])).toEqual([
      ['block:paragraph', 'lonely'],
      ['block:paragraph', 'x\ty'],
      ['block:paragraph', 'after'],
    ]);
    expect(result.blocks[0].props).toEqual({ alignment: 'center' });
  });

  it('an empty table has nothing to paste', () => {
    expect(sanitizeFragment({ blocks: [block('block:table', {}, [], [])] })).toBeNull();
    expect(
      sanitizeFragment({ blocks: [block('block:table', {}, [], [block('block:table-row')])] }),
    ).toBeNull();
  });

  it('refuses a table over the size limits instead of silently cutting it', () => {
    const wide = block(
      'block:table',
      {},
      [],
      [
        block(
          'block:table-row',
          {},
          [],
          Array.from({ length: MAX_TABLE_COLUMNS + 1 }, (_, i) => cell(String(i))),
        ),
      ],
    );
    const tall = block(
      'block:table',
      {},
      [],
      Array.from({ length: MAX_TABLE_CELLS / 2 + 1 }, () => row('a', 'b')),
    );
    const ok = block(
      'block:table',
      {},
      [],
      Array.from({ length: MAX_TABLE_CELLS / 2 }, () => row('a', 'b')),
    );

    expect(sanitizeFragment({ blocks: [wide] })).toBeNull();
    expect(sanitizeFragment({ blocks: [tall] })).toBeNull();
    // Даже вместе с другими блоками: целиком, иначе рядом остался бы кусок без таблицы.
    expect(sanitizeFragment({ blocks: [paragraph('keep'), tall] })).toBeNull();
    expect(sanitizeFragment({ blocks: [ok] })?.blocks[0].children).toHaveLength(
      MAX_TABLE_CELLS / 2,
    );
  });

  it('a table survives a round trip through JSON', () => {
    const fragment = tableFragment(
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
      { align: ['center', undefined] },
    );
    const result = sanitizeFragment(JSON.parse(JSON.stringify(fragment)))!;

    expect(gridOf(result.blocks[0])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(readTable(result.blocks[0]).align).toEqual(['center', undefined]);
  });
});

describe('fragment to text and HTML', () => {
  it('plain text: tab-separated rows, quoted when needed', () => {
    const fragment = tableFragment([
      ['Name', 'Note'],
      ['a\tb', 'two\nlines'],
      ['say "hi"', ''],
    ]);

    expect(fragmentToPlainText(fragment)).toBe('Name\tNote\n"a\tb"\t"two\nlines"\n"say ""hi"""\t');
    expect(fragmentToPlainText({ blocks: [paragraph('before'), ...fragment.blocks] })).toContain(
      'before\nName\tNote',
    );
  });

  it('html: <table> with a header row, alignment, widths and escaped text', () => {
    const fragment = tableFragment(
      [
        ['A <b>', [{ insert: 'x', attributes: { bold: true } }]],
        ['1', '2'],
      ],
      { align: ['center', 'right'], widths: [100, null] },
    );

    expect(fragmentToHtml(fragment)).toBe(
      '<div><table><colgroup><col style="width:100px"><col></colgroup>' +
        '<thead><tr><th style="text-align:center">A &lt;b&gt;</th>' +
        '<th style="text-align:right"><strong>x</strong></th></tr></thead>' +
        '<tbody><tr><td style="text-align:center">1</td><td style="text-align:right">2</td></tr></tbody></table></div>',
    );
  });

  it('html without a header row has only <tbody>', () => {
    const html = fragmentToHtml(tableFragment([['a', 'b']], { header: false }));

    expect(html).toContain('<tbody><tr><td>a</td><td>b</td></tr></tbody>');
    expect(html).not.toContain('<thead>');
  });
});

describe('copying from a table', () => {
  it('a selection from a paragraph through the whole table copies the table as a table', () => {
    const { editor, firstId, addTable, type } = setup();
    const { tableId, at } = addTable(2, 2);

    type(firstId, 'before');

    const fragment = editor.copyFragment(
      { blockId: firstId, offset: 2 },
      { blockId: at(1, 1), offset: 4 },
    );

    expect(fragment.blocks.map((b) => b.flavour)).toEqual(['block:paragraph', 'block:table']);
    expect(gridOf(fragment.blocks[1])).toEqual([
      ['r0c0', 'r0c1'],
      ['r1c0', 'r1c1'],
    ]);
    expect(tableId).toBeDefined();
  });

  it('a selection across cells copies the rows and columns it touches', () => {
    const { editor, addTable } = setup();
    const { at } = addTable(3, 3);

    // От середины (1,1) до середины (2,0): по порядку документа — (1,1), (1,2), (2,0).
    const [table] = editor.copyFragment(
      { blockId: at(1, 1), offset: 1 },
      { blockId: at(2, 0), offset: 2 },
    ).blocks;

    expect(gridOf(table)).toEqual([
      ['', '1c1', 'r1c2'],
      ['r2', '', ''],
    ]);
    // Первая строка таблицы в выделение не попала: заголовка в копии нет.
    expect(table.props.header).toBe(false);
  });

  it('keeps the header when the first row is selected and drops the empty columns', () => {
    const { editor, addTable } = setup();
    const { at } = addTable(2, 4);

    const [table] = editor.copyFragment(
      { blockId: at(0, 1), offset: 0 },
      { blockId: at(0, 2), offset: 4 },
    ).blocks;

    expect(gridOf(table)).toEqual([['r0c1', 'r0c2']]);
    expect(table.props.header).toBe(true);
  });

  it('carries the widths of the columns it keeps', () => {
    const { editor, addTable, getBlock } = setup();
    const { tableId, at } = addTable(2, 3);

    editor.dispatch({
      type: 'setTableColumnWidth',
      payload: { blockId: tableId, index: 2, width: 150 },
    } as never);

    const [table] = editor.copyFragment(
      { blockId: at(0, 1), offset: 0 },
      { blockId: at(0, 2), offset: 4 },
    ).blocks;

    expect(table.props.widths).toEqual([null, 150]);
    expect(getBlock(tableId)).toBeDefined();
  });

  it('a selection inside one cell is text, not a table', () => {
    const { editor, addTable } = setup();
    const { at } = addTable(2, 2);

    const fragment = editor.copyFragment(
      { blockId: at(1, 0), offset: 1 },
      { blockId: at(1, 0), offset: 3 },
    );

    expect(fragment.blocks).toHaveLength(1);
    expect(fragment.blocks[0].flavour).toBe('block:paragraph');
    expect(fragment.blocks[0].content).toEqual([{ insert: '1c' }]);
    expect(fragmentToPlainText(fragment)).toBe('1c');
  });

  it('a whole cell is complete text and an empty selection copies nothing', () => {
    const { editor, addTable, type } = setup();
    const { at } = addTable(2, 2);

    type(at(0, 0), '', 0);

    expect(
      editor.copyFragment({ blockId: at(1, 1), offset: 2 }, { blockId: at(1, 1), offset: 2 })
        .blocks,
    ).toEqual([]);
    expect(
      editor.copyFragment({ blockId: at(1, 1), offset: 0 }, { blockId: at(1, 1), offset: 4 })
        .blocks[0].complete,
    ).toBe(true);
  });
});

describe('pasting a table', () => {
  it('replaces an empty paragraph with the table and leaves a paragraph to continue in', () => {
    const { paste, flavours, valid, noteChildren, firstId } = setup();
    const caret = paste(
      tableFragment([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    )!;

    expect(flavours()).toEqual(['block:table', 'block:paragraph']);
    expect(noteChildren()).not.toContain(firstId);
    expect(caret.offset).toBe(0);
    expect(valid()).toEqual([]);
  });

  it('is a single undo step', () => {
    const { editor, paste, flavours } = setup();

    paste(
      tableFragment([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    );
    editor.undo();

    expect(flavours()).toEqual(['block:paragraph']);
  });

  it('splits a paragraph: the text before stays above, the text after goes below', () => {
    const { paste, firstId, type, flavours, text, noteChildren, valid } = setup();

    type(firstId, 'abcd');
    paste(tableFragment([['x']]), firstId, 2);

    expect(flavours()).toEqual(['block:paragraph', 'block:table', 'block:paragraph']);

    const [head, , tail] = noteChildren();

    expect([text(head), text(tail)]).toEqual(['ab', 'cd']);
    expect(valid()).toEqual([]);
  });

  it('at the start of a paragraph the table comes first and no empty paragraph is left', () => {
    const { paste, firstId, type, flavours, text, noteChildren } = setup();

    type(firstId, 'abcd');
    paste(tableFragment([['x', 'y']]), firstId, 0);

    expect(flavours()).toEqual(['block:table', 'block:paragraph']);
    expect(text(noteChildren()[1])).toBe('abcd');
  });

  it('text and a table together keep their order', () => {
    const { paste, flavours } = setup();
    const table = tableFragment([['a']]).blocks[0];

    paste({ blocks: [paragraph('intro'), table, paragraph('outro')] });

    expect(flavours()).toEqual(['block:paragraph', 'block:table', 'block:paragraph']);
  });

  it('in an editor without tables it becomes paragraphs of rows with tabs between cells', () => {
    const { paste, noteChildren, text, flavours, valid } = setup({ tables: false });

    paste(
      tableFragment([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    );

    expect(flavours()).toEqual(['block:paragraph', 'block:paragraph']);
    expect(noteChildren().map(text)).toEqual(['a\tb', 'c\td']);
    expect(valid()).toEqual([]);
  });
});

describe('pasting a table into a table', () => {
  it('fills the cells from the caret on, leaving the others alone', () => {
    const { paste, addTable, tableGrid, valid } = setup();
    const { tableId, at } = addTable(3, 3);

    const caret = paste(
      tableFragment([
        ['A', 'B'],
        ['C', 'D'],
      ]),
      at(1, 1),
      0,
    )!;

    expect(tableGrid(tableId)).toEqual([
      ['r0c0', 'r0c1', 'r0c2'],
      ['r1c0', 'A', 'B'],
      ['r2c0', 'C', 'D'],
    ]);
    expect(caret).toEqual({ blockId: at(2, 2), offset: 1 });
    expect(valid()).toEqual([]);
  });

  it('grows the table by rows and columns when the paste does not fit', () => {
    const { paste, addTable, tableGrid, getBlock, valid } = setup();
    const { tableId, at } = addTable(2, 2);

    paste(
      tableFragment([
        ['A', 'B', 'C'],
        ['D', 'E', 'F'],
        ['G', 'H', 'I'],
      ]),
      at(1, 1),
      0,
    );

    expect(tableSize(getBlock, tableId)).toEqual({ rows: 4, columns: 4 });
    expect(tableGrid(tableId)).toEqual([
      ['r0c0', 'r0c1', '', ''],
      ['r1c0', 'A', 'B', 'C'],
      ['', 'D', 'E', 'F'],
      ['', 'G', 'H', 'I'],
    ]);
    expect(valid()).toEqual([]);
  });

  it('grows widths together with the columns', () => {
    const { editor, paste, addTable, get } = setup();
    const { tableId, at } = addTable(1, 2);

    editor.dispatch({
      type: 'setTableColumnWidth',
      payload: { blockId: tableId, index: 0, width: 90 },
    } as never);
    paste(tableFragment([['a', 'b', 'c']]), at(0, 0), 0);

    expect(get(tableId).props.widths).toEqual([90, null, null]);
  });

  it('is one undo step', () => {
    const { editor, paste, addTable, tableGrid, getBlock } = setup();
    const { tableId, at } = addTable(2, 2);

    editor.sealHistory();
    paste(tableFragment([['A', 'B', 'C']]), at(0, 1), 0);
    editor.undo();

    expect(tableGrid(tableId)).toEqual([
      ['r0c0', 'r0c1'],
      ['r1c0', 'r1c1'],
    ]);
    expect(tableSize(getBlock, tableId)).toEqual({ rows: 2, columns: 2 });
  });

  it('a paste that would exceed the size limit goes in as text instead', () => {
    const { paste, addTable, text, tableGrid, getBlock } = setup();
    const { tableId, at } = addTable(1, 1);
    const huge = tableFragment([Array.from({ length: MAX_TABLE_COLUMNS + 5 }, (_, i) => `c${i}`)]);

    paste(huge, at(0, 0), 0);

    expect(tableSize(getBlock, tableId)).toEqual({ rows: 1, columns: 1 });
    expect(tableGrid(tableId)[0][0]).toContain('c0');
    expect(text(at(0, 0))).toContain(`c${MAX_TABLE_COLUMNS + 4}`);
  });

  it('other fragments go into a cell as text lines', () => {
    const { paste, addTable, text } = setup();
    const { at } = addTable(1, 2);

    paste({ blocks: [paragraph('one'), paragraph('two')] }, at(0, 1), 0);

    expect(text(at(0, 1))).toBe('one\ntwor0c1');
  });
});

describe('pasting into a cell hidden by a merge', () => {
  it('goes to the visible cell of the merge: text at its end, a table over it', () => {
    const { editor, addTable, paste, tableGrid, valid } = setup();
    const { tableId, at } = addTable(2, 3);

    editor.dispatch({
      type: 'mergeTableCells',
      payload: { blockId: tableId, range: { top: 0, bottom: 1, left: 0, right: 1 } },
    } as never);

    // Текст дописывается в конец видимой ячейки.
    paste({ blocks: [paragraph('!')] }, at(1, 1));
    expect(tableGrid(tableId)[0][0]).toBe('r0c0\nr0c1\nr1c0\nr1c1!');

    // Таблица, как и при вставке в видимую ячейку, заменяет её содержимое.
    paste(tableFragment([['?']]), at(0, 1));
    expect(tableGrid(tableId)[0][0]).toBe('?');
    expect(tableGrid(tableId)[0][1]).toBe('');
    expect(tableGrid(tableId)[1][1]).toBe('');
    expect(valid()).toEqual([]);
  });
});
