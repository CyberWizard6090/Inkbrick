import { describe, expect, it } from 'vitest';

import {
  Editor,
  tableBlocks,
  createTableEditor,
  tableCellAt,
  tableIdOf,
  tableFragment,
  tableRangeFragment,
  type TableRange,
} from '../src';
import {
  createSchemaRegistry,
  tableBlockSchemas,
  toHtml,
  toMarkdown,
  validateSnapshot,
} from '@inkbrick/document';

const ALL: TableRange = { top: 0, left: 0, bottom: 2, right: 2 };

function setup(options: Parameters<typeof createTableEditor>[0] = {}) {
  const editor = createTableEditor({
    rows: [
      ['a', 'b', 'c'],
      ['d', '', 'f'],
      ['g', 'h', 'i'],
    ],
    ...options,
  });
  const tableId = tableIdOf(editor)!;
  const getBlock = (id: string) => editor.document.getBlock(id);
  const cell = (row: number, column: number) => tableCellAt(getBlock, tableId, row, column)!;
  const attrs = (row: number, column: number) =>
    editor.document.getBlock(cell(row, column))!.content.map((node) => node.attributes ?? {});
  const run = (type: string, payload: Record<string, unknown>) =>
    editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);
  const can = (type: string, payload: Record<string, unknown>) =>
    editor.can(type, { blockId: tableId, ...payload });

  return { editor, tableId, cell, attrs, run, can, getBlock };
}

const undoSteps = (editor: Editor) => {
  let steps = 0;

  while (editor.canUndo) {
    editor.undo();
    steps += 1;
  }

  return steps;
};

describe('formatTableCells', () => {
  it('turns a format on for every cell with text in the range, in one undo step', () => {
    const { editor, run, attrs } = setup();

    run('formatTableCells', { range: ALL, format: 'bold' });

    for (const [row, column] of [
      [0, 0],
      [0, 2],
      [1, 0],
      [2, 2],
    ])
      expect(attrs(row, column)).toEqual([{ bold: true }]);

    expect(undoSteps(editor)).toBe(1);
    expect(attrs(0, 0)).toEqual([{}]);
  });

  it('turns it off when every cell already has it, and on again when only some do', () => {
    const { run, attrs } = setup();

    run('formatTableCells', { range: ALL, format: 'italic' });
    run('formatTableCells', { range: ALL, format: 'italic' });
    expect(attrs(1, 0)).toEqual([{}]);

    run('formatTableCells', { range: { top: 0, left: 0, bottom: 0, right: 0 }, format: 'italic' });
    run('formatTableCells', { range: ALL, format: 'italic' });
    expect(attrs(0, 0)).toEqual([{ italic: true }]);
    expect(attrs(2, 2)).toEqual([{ italic: true }]);
  });

  it('formats only the rectangle', () => {
    const { run, attrs } = setup();

    run('formatTableCells', { range: { top: 1, left: 0, bottom: 2, right: 0 }, format: 'strike' });

    expect(attrs(0, 0)).toEqual([{}]);
    expect(attrs(1, 0)).toEqual([{ strike: true }]);
    expect(attrs(2, 0)).toEqual([{ strike: true }]);
    expect(attrs(2, 1)).toEqual([{}]);
  });

  it('refuses an unknown format and a range of empty cells', () => {
    const { can } = setup();

    expect(can('formatTableCells', { range: ALL, format: 'sparkle' })).toBe(false);
    expect(
      can('formatTableCells', { range: { top: 1, left: 1, bottom: 1, right: 1 }, format: 'bold' }),
    ).toBe(false);
    expect(can('formatTableCells', { range: 'all', format: 'bold' })).toBe(false);
  });

  it('is refused in a read-only editor', () => {
    const { editor, can } = setup();

    editor.setReadOnly(true);

    expect(can('formatTableCells', { range: ALL, format: 'bold' })).toBe(false);
  });
});

describe('setTableCellsColor and clearTableCellsFormat', () => {
  it('sets and removes the text colour and highlight of the whole range', () => {
    const { run, attrs } = setup();

    run('setTableCellsColor', { range: ALL, attributes: { color: 'red' } });
    run('setTableCellsColor', { range: ALL, attributes: { backgroundColor: 'yellow' } });
    expect(attrs(0, 1)).toEqual([{ color: 'red', backgroundColor: 'yellow' }]);

    run('setTableCellsColor', { range: ALL, attributes: { color: undefined } });
    expect(attrs(0, 1)).toEqual([{ backgroundColor: 'yellow' }]);
  });

  it('accepts only palette names and safe CSS colours, and only the two attributes', () => {
    const { can } = setup();

    expect(can('setTableCellsColor', { range: ALL, attributes: { color: 'blue' } })).toBe(true);
    expect(can('setTableCellsColor', { range: ALL, attributes: { color: '#ff0000' } })).toBe(true);
    expect(can('setTableCellsColor', { range: ALL, attributes: { color: 'red;x:y' } })).toBe(false);
    expect(can('setTableCellsColor', { range: ALL, attributes: { link: 'https://a.b' } })).toBe(
      false,
    );
    expect(can('setTableCellsColor', { range: ALL, attributes: {} })).toBe(false);
  });

  it('clears styles and colours but keeps links', () => {
    const { editor, run, attrs, cell } = setup();

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: {
        from: { blockId: cell(0, 0), offset: 0 },
        to: { blockId: cell(0, 0), offset: 1 },
        attributes: { link: 'https://example.com' },
      },
    });
    run('formatTableCells', { range: ALL, format: 'bold' });
    run('setTableCellsColor', { range: ALL, attributes: { color: 'red' } });

    run('clearTableCellsFormat', { range: ALL });

    expect(attrs(0, 0)).toEqual([{ link: 'https://example.com' }]);
    expect(attrs(2, 2)).toEqual([{}]);
  });
});

describe('alignTableCells', () => {
  it('aligns every cell of the range, in one undo step', () => {
    const { editor, run, getBlock, cell } = setup();

    run('alignTableCells', { range: { top: 0, left: 1, bottom: 2, right: 2 }, align: 'center' });

    expect(getBlock(cell(0, 1))!.props.align).toBe('center');
    expect(getBlock(cell(2, 2))!.props.align).toBe('center');
    expect(getBlock(cell(0, 0))!.props.align).toBeUndefined();
    expect(undoSteps(editor)).toBe(1);
  });

  it('refuses an unknown alignment', () => {
    const { can } = setup();

    expect(can('alignTableCells', { range: ALL, align: 'middle' })).toBe(false);
  });

  it('aligns empty cells too', () => {
    const { run, getBlock, cell } = setup();

    run('alignTableCells', { range: ALL, align: 'right' });

    expect(getBlock(cell(1, 1))!.props.align).toBe('right');
  });
});

describe('setTableCellsBackground', () => {
  it('sets and clears the background of the cells and the schema accepts it', () => {
    const { editor, run, getBlock, cell } = setup();

    run('setTableCellsBackground', {
      range: { top: 0, left: 0, bottom: 0, right: 2 },
      background: 'green',
    });

    expect(getBlock(cell(0, 2))!.props.background).toBe('green');
    expect(getBlock(cell(1, 2))!.props.background).toBeUndefined();
    expect(validateSnapshot(editor.serialize(), createSchemaRegistry(tableBlockSchemas))).toEqual(
      [],
    );

    run('setTableCellsBackground', { range: ALL, background: null });
    expect(getBlock(cell(0, 2))!.props.background).toBeUndefined();
  });

  it('refuses a colour outside the block palette', () => {
    const { can } = setup();

    expect(can('setTableCellsBackground', { range: ALL, background: 'black' })).toBe(false);
    expect(can('setTableCellsBackground', { range: ALL, background: 'url(x)' })).toBe(false);
    expect(can('setTableCellsBackground', { range: ALL, background: 'red' })).toBe(true);
  });

  it('takes a colour of its own as #rrggbb and nothing else', () => {
    const { can, run, cell, editor } = setup();

    expect(can('setTableCellsBackground', { range: ALL, background: '#12ab34' })).toBe(true);
    expect(can('setTableCellsBackground', { range: ALL, background: '#fff' })).toBe(false);
    expect(can('setTableCellsBackground', { range: ALL, background: 'red; x' })).toBe(false);

    run('setTableCellsBackground', { range: ALL, background: '#12ab34' });
    expect(editor.document.getBlock(cell(1, 1))!.props.background).toBe('#12ab34');
  });
});

describe('table properties', () => {
  it('stores headerColumn, striped and borders in the table props and validates them', () => {
    const { editor, tableId, getBlock } = setup();

    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: tableId, props: { headerColumn: true, striped: true, borders: false } },
    });

    expect(getBlock(tableId)!.props).toMatchObject({
      headerColumn: true,
      striped: true,
      borders: false,
    });
    expect(
      editor.can('setBlockProps', { blockId: tableId, props: { striped: 'yes' } as never }),
    ).toBe(false);
  });

  it('resets column widths to automatic in one step and only when some are set', () => {
    const { editor, run, can, getBlock, tableId } = setup();

    expect(can('resetTableColumnWidths', {})).toBe(false);

    run('setTableColumnWidth', { index: 0, width: 120 });
    expect(can('resetTableColumnWidths', {})).toBe(true);

    run('resetTableColumnWidths', {});
    expect(getBlock(tableId)!.props.widths).toBeUndefined();

    editor.undo();
    expect(getBlock(tableId)!.props.widths).toEqual([120, null, null]);
  });
});

describe('copying and export', () => {
  it('carries the table properties and the cell alignment and background into a range fragment', () => {
    const { editor, tableId, run } = setup();

    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: tableId, props: { striped: true, borders: false } },
    });
    run('alignTableCells', { range: { top: 1, left: 1, bottom: 1, right: 1 }, align: 'right' });
    run('setTableCellsBackground', {
      range: { top: 1, left: 1, bottom: 1, right: 1 },
      background: 'pink',
    });

    const fragment = tableRangeFragment((id) => editor.document.getBlock(id), tableId, {
      top: 1,
      left: 0,
      bottom: 1,
      right: 2,
    });
    const table = fragment.blocks[0];
    const cells = table.children[0].children;

    expect(table.props).toMatchObject({ striped: true, borders: false });
    expect(cells[1].props).toEqual({ align: 'right', background: 'pink' });
    expect(cells[0].props).toEqual({});
  });

  it('pastes a copied table with its properties, backgrounds and alignment', () => {
    const source = setup();

    source.editor.dispatch({
      type: 'setBlockProps',
      payload: {
        blockId: source.tableId,
        props: { headerColumn: true, striped: true, borders: false },
      },
    });
    source.run('setTableCellsBackground', { range: ALL, background: 'blue' });
    source.run('alignTableCells', { range: ALL, align: 'center' });

    const fragment = tableRangeFragment(
      (id) => source.editor.document.getBlock(id),
      source.tableId,
      ALL,
    );
    const target = new Editor({ blocks: tableBlocks });
    const note = target.document.getBlock(target.document.rootId)!.children[0];
    const paragraph = target.document.getBlock(note)!.children[0];

    target.dispatch({
      type: 'pasteFragment',
      payload: { at: { blockId: paragraph, offset: 0 }, fragment },
    });

    const pasted = [...document_tables(target)].pop()!;
    const cell = target.document.getBlock(
      target.document.getBlock(pasted.children[1])!.children[1],
    )!;

    expect(pasted.props).toMatchObject({ headerColumn: true, striped: true, borders: false });
    expect(cell.props).toMatchObject({ background: 'blue', align: 'center' });
  });

  it('writes cell backgrounds, alignment and the table properties into the HTML', () => {
    const { editor, tableId, run } = setup();

    editor.dispatch({
      type: 'setBlockProps',
      payload: {
        blockId: tableId,
        props: { headerColumn: true, striped: true, borders: false },
      },
    });
    run('setTableCellsBackground', {
      range: { top: 0, left: 0, bottom: 0, right: 0 },
      background: 'yellow',
    });
    run('alignTableCells', { range: { top: 0, left: 1, bottom: 0, right: 1 }, align: 'center' });

    const html = toHtml(editor.document);

    expect(html).toContain('<table data-borders="none" data-striped>');
    // Фон ячейки — насыщенный цвет, текст на нём по контрасту (как в редакторе).
    expect(html).toContain('<th style="background-color:#facc15;color:#1a1a1a">a</th>');
    expect(html).toContain('<th style="text-align:center">b</th>');
    expect(html).toContain('<th scope="row">d</th>');
    // Вторая строка тела — полоса.
    expect(html).toContain('<tr style="background-color:#f4f4f4">');
  });

  it('leaves the HTML of a plain table as it was and keeps Markdown unchanged', () => {
    const { editor, tableId, run } = setup();
    const before = toMarkdown(editor.document);

    expect(toHtml(editor.document)).toContain('<table>');

    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: tableId, props: { striped: true, headerColumn: true, borders: false } },
    });
    run('setTableCellsBackground', { range: ALL, background: 'red' });
    run('formatTableCells', { range: { top: 0, left: 0, bottom: 0, right: 0 }, format: 'bold' });

    const after = toMarkdown(editor.document);

    expect(after).toContain('| **a** | b | c |');
    expect(after.replace('**a**', 'a')).toBe(before);
  });
});

describe('table borders', () => {
  const sides = (editor: Editor, id: string) => {
    const { borderTop, borderRight, borderBottom, borderLeft, borderColor } =
      editor.document.getBlock(id)!.props;

    return { borderTop, borderRight, borderBottom, borderLeft, borderColor };
  };
  const MIDDLE: TableRange = { top: 1, left: 1, bottom: 1, right: 1 };

  it('outside borders go to the edge cells of the range and to their neighbours', () => {
    const { run, cell, editor } = setup();

    run('setTableCellsBorders', { range: MIDDLE, mode: 'outside', width: 'thick' });

    expect(sides(editor, cell(1, 1))).toMatchObject({
      borderTop: 'thick',
      borderRight: 'thick',
      borderBottom: 'thick',
      borderLeft: 'thick',
    });
    // Линия записана и в соседей: иначе их собственная линия перебила бы её.
    expect(sides(editor, cell(0, 1)).borderBottom).toBe('thick');
    expect(sides(editor, cell(2, 1)).borderTop).toBe('thick');
    expect(sides(editor, cell(1, 0)).borderRight).toBe('thick');
    expect(sides(editor, cell(1, 2)).borderLeft).toBe('thick');
    expect(sides(editor, cell(0, 0)).borderBottom).toBeUndefined();
  });

  it('inside borders stay between the cells of the range', () => {
    const { run, cell, editor } = setup();

    run('setTableCellsBorders', { range: ALL, mode: 'inside', width: 'thin' });

    expect(sides(editor, cell(1, 1))).toMatchObject({ borderTop: 'thin', borderLeft: 'thin' });
    expect(sides(editor, cell(0, 0)).borderTop).toBeUndefined();
    expect(sides(editor, cell(0, 0)).borderLeft).toBeUndefined();
    expect(sides(editor, cell(2, 2)).borderBottom).toBeUndefined();
  });

  it('horizontal and vertical inside borders are separate', () => {
    const { run, cell, editor } = setup();

    run('setTableCellsBorders', { range: ALL, mode: 'insideHorizontal', width: 'medium' });

    expect(sides(editor, cell(1, 1)).borderTop).toBe('medium');
    expect(sides(editor, cell(1, 1)).borderLeft).toBeUndefined();

    run('setTableCellsBorders', { range: ALL, mode: 'insideVertical', width: 'thin' });

    expect(sides(editor, cell(1, 1)).borderLeft).toBe('thin');
  });

  it('one side, the color and removing all borders', () => {
    const { run, cell, editor } = setup();

    run('setTableCellsBorders', { range: ALL, mode: 'bottom', width: 'thin', color: 'red' });

    expect(sides(editor, cell(2, 0)).borderBottom).toBe('thin');
    expect(editor.document.getBlock(cell(2, 0))!.props.borderBottomColor).toBe('red');
    // Цвет только у нарисованной стороны: остальные стороны ячейки прежние.
    expect(editor.document.getBlock(cell(2, 0))!.props.borderTopColor).toBeUndefined();
    expect(sides(editor, cell(0, 0)).borderBottom).toBeUndefined();

    run('setTableCellsBorders', { range: ALL, mode: 'none' });

    expect(sides(editor, cell(0, 0))).toMatchObject({
      borderTop: 'none',
      borderRight: 'none',
      borderBottom: 'none',
      borderLeft: 'none',
    });
  });

  it('is one undo step and rejects wrong input', () => {
    const { run, can, cell, editor } = setup();

    expect(can('setTableCellsBorders', { range: ALL, mode: 'all' })).toBe(false);
    expect(can('setTableCellsBorders', { range: ALL, mode: 'all', width: 'none' })).toBe(false);
    expect(can('setTableCellsBorders', { range: ALL, mode: 'diagonal', width: 'thin' })).toBe(
      false,
    );
    expect(
      can('setTableCellsBorders', { range: ALL, mode: 'all', width: 'thin', color: 'nope' }),
    ).toBe(false);

    run('setTableCellsBorders', { range: ALL, mode: 'all', width: 'thin' });
    expect(sides(editor, cell(1, 1)).borderTop).toBe('thin');

    editor.undo();

    expect(sides(editor, cell(1, 1)).borderTop).toBeUndefined();
    expect(sides(editor, cell(0, 0)).borderLeft).toBeUndefined();
  });

  it('keep changes the look of the existing lines only: a width, a style and a color', () => {
    const { run, can, cell, editor } = setup();

    // Без явных границ линиями считаются обычные границы таблицы: толщина ложится на все стороны ячеек выбранного диапазона.
    run('setTableCellsBorders', { range: MIDDLE, mode: 'keep', width: 'thick' });
    expect(sides(editor, cell(1, 1))).toMatchObject({
      borderTop: 'thick',
      borderRight: 'thick',
      borderBottom: 'thick',
      borderLeft: 'thick',
    });
    // Соседи получили свою сторону той же линии, остальные их стороны не тронуты.
    expect(sides(editor, cell(0, 1)).borderBottom).toBe('thick');
    expect(sides(editor, cell(0, 1)).borderTop).toBeUndefined();

    run('setTableCellsBorders', { range: MIDDLE, mode: 'keep', style: 'dashed', color: 'red' });
    expect(editor.document.getBlock(cell(1, 1))!.props).toMatchObject({
      borderTopStyle: 'dashed',
      borderLeftStyle: 'dashed',
      borderTopColor: 'red',
      borderRightColor: 'red',
    });
    // Сплошная — обычное начертание: свойство снимается.
    run('setTableCellsBorders', { range: MIDDLE, mode: 'keep', style: 'solid' });
    expect(editor.document.getBlock(cell(1, 1))!.props.borderTopStyle).toBeUndefined();

    // Убранные линии не возвращаются: меняется только оформление тех, что есть.
    run('setTableCellsBorders', { range: MIDDLE, mode: 'none' });
    run('setTableCellsBorders', { range: MIDDLE, mode: 'keep', width: 'medium' });
    expect(sides(editor, cell(1, 1)).borderTop).toBe('none');

    expect(can('setTableCellsBorders', { range: ALL, mode: 'keep' })).toBe(false);
    expect(can('setTableCellsBorders', { range: ALL, mode: 'keep', width: 'none' })).toBe(false);
    expect(can('setTableCellsBorders', { range: ALL, mode: 'keep', style: 'wavy' })).toBe(false);
  });

  it('keep with only a color or a style leaves the widths of the cell and of its neighbours as they are', () => {
    const { run, cell, editor } = setup();

    // Над B2 — B1 без своей нижней границы; у B2 толстая верхняя линия.
    run('setTableCellsBorders', { range: MIDDLE, mode: 'top', width: 'thick' });
    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: cell(0, 1), props: { borderBottom: undefined } },
    });

    run('setTableCellsBorders', {
      range: { top: 0, left: 1, bottom: 0, right: 1 },
      mode: 'keep',
      color: 'red',
    });

    expect(sides(editor, cell(1, 1)).borderTop).toBe('thick');
    expect(sides(editor, cell(0, 1)).borderBottom).toBeUndefined();
    expect(editor.document.getBlock(cell(0, 1))!.props.borderBottomColor).toBe('red');
    // Общая линия красится и у соседа, но только она: его другие стороны прежние.
    expect(editor.document.getBlock(cell(1, 1))!.props.borderTopColor).toBe('red');
    expect(editor.document.getBlock(cell(1, 1))!.props.borderBottomColor).toBeUndefined();
  });

  it('a colour on one cell paints only the shared lines of its neighbours, not their far edges', () => {
    const { run, cell, editor } = setup();

    run('setTableCellsBorders', { range: MIDDLE, mode: 'keep', color: 'red' });

    const above = editor.document.getBlock(cell(0, 1))!.props;

    expect(above.borderBottomColor).toBe('red');
    expect(above.borderTopColor).toBeUndefined();
    expect(above.borderLeftColor).toBeUndefined();
    expect(above.borderColor).toBeUndefined();
  });

  it('a cell-wide colour of an older document is spread over its sides before one side changes', () => {
    const { run, cell, editor } = setup();

    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: cell(1, 1), props: { borderColor: 'blue', borderStyle: 'dashed' } },
    });
    run('setTableCellsBorders', { range: MIDDLE, mode: 'top', width: 'thick', color: 'red' });

    expect(editor.document.getBlock(cell(1, 1))!.props).toMatchObject({
      borderTopColor: 'red',
      borderRightColor: 'blue',
      borderBottomColor: 'blue',
      borderLeftColor: 'blue',
      borderTopStyle: 'dashed',
    });
    expect(editor.document.getBlock(cell(1, 1))!.props.borderColor).toBeUndefined();
  });

  it('the style travels with a copied range', () => {
    const { run, editor, tableId } = setup();

    run('setTableCellsBorders', { range: MIDDLE, mode: 'all', width: 'thin', style: 'dotted' });

    const fragment = tableRangeFragment((id) => editor.document.getBlock(id), tableId, MIDDLE);

    expect(JSON.stringify(fragment)).toContain('dotted');
  });

  it('the borders and the color are exported to HTML', () => {
    const { run, editor } = setup();

    run('setTableCellsBorders', { range: MIDDLE, mode: 'outside', width: 'thick', color: 'red' });

    const html = toHtml(editor.document);

    expect(html).toContain('border-top:3px solid');
    expect(html).toContain('border-left:3px solid');
    run('setTableCellsBorders', { range: MIDDLE, mode: 'none' });
    expect(toHtml(editor.document)).toContain('border-top:none');
  });

  it('the borders and the color travel with a copied range', () => {
    const { run, cell, editor, tableId } = setup();

    run('setTableCellsBorders', { range: MIDDLE, mode: 'all', width: 'thick', color: 'blue' });

    const fragment = tableRangeFragment(
      (id: string) => editor.document.getBlock(id),
      tableId,
      MIDDLE,
    );
    const copied = JSON.stringify(fragment);

    expect(copied).toContain('"borderTop":"thick"');
    expect(copied).toContain('"borderTopColor":"blue"');
    expect(cell(1, 1)).toBeTruthy();
  });
});

function* document_tables(editor: Editor) {
  const stack = [editor.document.rootId];

  while (stack.length > 0) {
    const block = editor.document.getBlock(stack.pop()!);

    if (!block) continue;
    if (block.flavour === 'block:table') yield block;

    stack.push(...block.children);
  }
}

describe('pasting a copied range into an existing table', () => {
  it('keeps the background and the alignment of each cell', () => {
    const source = setup();

    source.run('setTableCellsBackground', { range: ALL, background: 'blue' });
    source.run('alignTableCells', { range: ALL, align: 'center' });

    const fragment = tableRangeFragment(
      (id) => source.editor.document.getBlock(id),
      source.tableId,
      ALL,
    );
    const target = setup();
    const at = target.cell(1, 1);

    target.editor.dispatch({
      type: 'pasteFragment',
      payload: { at: { blockId: at, offset: 0 }, fragment },
    });

    expect(target.editor.document.getBlock(at)!.props).toMatchObject({
      background: 'blue',
      align: 'center',
    });
    expect(target.editor.document.getBlock(target.cell(2, 2))!.props).toMatchObject({
      background: 'blue',
    });
  });

  it('plain text from a spreadsheet over several cells keeps their formatting', () => {
    const target = setup();

    target.run('setTableCellsBackground', { range: ALL, background: 'yellow' });
    target.run('setTableCellsBorders', { range: ALL, mode: 'all', width: 'thick' });

    target.editor.dispatch({
      type: 'pasteFragment',
      payload: {
        at: { blockId: target.cell(0, 0), offset: 0 },
        fragment: tableFragment([
          ['1', '2'],
          ['3', '4'],
        ]),
      },
    });

    expect(target.editor.document.getBlock(target.cell(1, 1))!.props).toMatchObject({
      background: 'yellow',
      borderTop: 'thick',
    });
    expect(
      target.editor.document
        .getBlock(target.cell(1, 1))!
        .content.map((n) => n.insert)
        .join(''),
    ).toBe('4');
  });

  it('a forged fragment carries no unknown properties and no invalid formatting', () => {
    const target = setup();
    const forged = (props: Record<string, unknown>) => {
      const fragment = tableFragment([['a']]);

      (fragment.blocks[0].children[0].children[0] as { props: Record<string, unknown> }).props =
        props;

      return fragment;
    };
    const paste = (props: Record<string, unknown>) =>
      target.editor.dispatch({
        type: 'pasteFragment',
        payload: { at: { blockId: target.cell(1, 1), offset: 0 }, fragment: forged(props) },
      });

    // Неизвестные свойства отбрасываются, известные с допустимыми значениями переносятся.
    paste({ borderBottom: 'thick', align: 'center', foo: { bar: 1 } });
    expect(target.editor.document.getBlock(target.cell(1, 1))!.props).toEqual({
      borderBottom: 'thick',
      align: 'center',
    });

    // Недопустимое значение — чужое оформление не переносится: у ячейки остаётся её собственное.
    paste({ background: 'url(https://evil.example/x.png)', borderTop: 'huge', align: 'right' });
    expect(target.editor.document.getBlock(target.cell(1, 1))!.props).toEqual({
      borderBottom: 'thick',
      align: 'center',
    });
  });
});

describe('the HTML export of the line style', () => {
  it('a dashed or dotted cell line is written as dashed or dotted', () => {
    const { run, editor, cell } = setup();

    run('setTableCellsBorders', { range: MIDDLE_CELL, mode: 'all', width: 'thin' });
    run('setTableCellsBorders', { range: MIDDLE_CELL, mode: 'keep', style: 'dashed' });

    const html = toHtml(editor.document);

    expect(editor.document.getBlock(cell(1, 1))!.props.borderTopStyle).toBe('dashed');
    expect(html).toContain('border-top:1px dashed');

    run('setTableCellsBorders', { range: MIDDLE_CELL, mode: 'keep', style: 'dotted' });
    expect(toHtml(editor.document)).toContain('border-top:1px dotted');
  });
});

const MIDDLE_CELL: TableRange = { top: 1, left: 1, bottom: 1, right: 1 };

describe('the size limits hold for the commands too', () => {
  it('a column and a row past the limit are refused by the command itself', () => {
    const { run, can, tableId, editor } = setup();

    for (let i = 0; i < 47; i++) run('insertTableColumn', { index: 3 + i });
    expect(can('insertTableColumn', { index: 0 })).toBe(false);

    for (let i = 0; i < 37; i++) run('insertTableRow', { index: 3 + i });
    expect(editor.document.getBlock(tableId)!.children.length).toBe(40);
    expect(can('insertTableRow', { index: 0 })).toBe(false);
  });
});

describe('pasting a table into a cell of a table with merged cells', () => {
  it('keeps the hidden cells of a merge: a table over them goes in as text', () => {
    const target = setup();

    target.run('mergeTableCells', { range: { top: 0, left: 0, bottom: 0, right: 1 } });

    const merges = target.getBlock(target.tableId)!.props.merges;
    const pasted = tableFragment([['X', 'Y']]);

    target.editor.dispatch({
      type: 'pasteFragment',
      payload: { at: { blockId: target.cell(0, 0), offset: 0 }, fragment: pasted },
    });

    expect(target.getBlock(target.tableId)!.props.merges).toEqual(merges);
    expect(target.editor.document.getBlock(target.cell(0, 1))!.content).toEqual([]);
    expect(
      target.editor.document
        .getBlock(target.cell(0, 0))!
        .content.map((n) => n.insert)
        .join(''),
    ).toContain('X');
  });

  it('moves the merges of a copied table to the place of the paste', () => {
    const source = setup();

    source.run('mergeTableCells', { range: { top: 0, left: 0, bottom: 0, right: 1 } });

    const fragment = tableRangeFragment(
      (id) => source.editor.document.getBlock(id),
      source.tableId,
      ALL,
    );
    const target = setup();

    target.editor.dispatch({
      type: 'pasteFragment',
      payload: { at: { blockId: target.cell(1, 1), offset: 0 }, fragment },
    });

    expect(target.getBlock(target.tableId)!.props.merges).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 1, column: 1, rows: 1, columns: 2 })]),
    );
  });
});

describe('the caret that undo gives back', () => {
  it('is the one the caller reported: Tab into a new row returns to the cell it started from', () => {
    const { editor, tableId, cell } = setup();
    const from = { blockId: cell(2, 2), offset: 2 };

    editor.sealHistory();
    editor.dispatch({
      type: 'insertTableRow',
      payload: { blockId: tableId, index: 3, caretBefore: from },
    } as never);

    expect(editor.undo()?.caret).toEqual(from);
  });
});
