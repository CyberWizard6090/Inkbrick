import { describe, expect, it } from 'vitest';

import { fragmentToHtml, readTable, tableFragment, type Fragment } from '@inkbrick/engine';

import { htmlToFragment } from '../src';

/** Таблица со всем, что переживает HTML: заголовок, объединение, выравнивание, фон по имени и свой, ширины. */
const source = (): Fragment =>
  tableFragment(
    [
      ['Name', 'Qty', 'Note'],
      ['Apple', '3', 'a|b\nline'],
      ['Pear', '', 'x'],
    ],
    {
      header: true,
      merges: [{ row: 1, column: 1, rows: 2, columns: 1 }],
      align: [undefined, 'right', 'center'],
      widths: [120, null, 200],
      cellProps: [
        [{ background: 'yellow' }],
        [undefined, undefined, { background: '#123456' }],
        [{ background: 'blue', borderTop: 'thick', borderTopColor: 'red' }],
      ],
    },
  );

describe('a table through HTML and back', () => {
  it('the clipboard HTML has spans for merges and no hidden cells', () => {
    const html = fragmentToHtml(source());

    expect(html).toContain('rowspan="2"');
    // Три строки по три ячейки, одна скрыта объединением.
    expect(html.match(/<t[dh][ >]/g)).toHaveLength(8);
    expect(html).toContain('background-color:#facc15');
    expect(html).toContain('border-top:3px solid');
  });

  it('text, header, merges, alignment, backgrounds and widths come back', () => {
    const back = htmlToFragment(fragmentToHtml(source()))!;
    const table = back.blocks[0];
    const read = readTable(table);

    expect(table.props.header).toBe(true);
    expect(table.props.merges).toEqual([{ row: 1, column: 1, rows: 2, columns: 1 }]);
    expect(read.widths).toEqual([120, null, 200]);
    expect(read.rows.map((row) => row.map((cell) => cell.map((n) => n.insert).join('')))).toEqual([
      ['Name', 'Qty', 'Note'],
      ['Apple', '3', 'a|b\nline'],
      ['Pear', '', 'x'],
    ]);
    expect(read.cellProps[0][0].background).toBe('yellow');
    expect(read.cellProps[1][2].background).toBe('#123456');
    expect(read.cellProps[2][0].background).toBe('blue');
    expect(read.cellProps[1][1].align).toBe('right');
  });

  it('the contrast text colour of a coloured cell does not become a colour of the text', () => {
    const back = htmlToFragment(fragmentToHtml(source()))!;
    const read = readTable(back.blocks[0]);

    for (const row of read.rows)
      for (const cell of row)
        for (const node of cell) expect(node.attributes?.color).toBeUndefined();
  });

  it('a table from a spreadsheet: rgb() backgrounds, white skipped, column widths', () => {
    const html =
      '<table><colgroup><col width="80"><col style="width:140px"><col span="2" style="width:60px"></colgroup>' +
      '<tr><td style="background-color:rgb(255, 255, 255)">a</td><td style="background-color:rgb(59, 130, 246)">b</td>' +
      '<td bgcolor="#0f0">c</td><td style="background-color:rgba(0, 0, 0, 0.2)">d</td></tr>' +
      '<tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></table>';
    const table = htmlToFragment(html)!.blocks[0];
    const read = readTable(table);

    expect(read.widths).toEqual([80, 140, 60, 60]);
    expect(read.cellProps[0][0].background).toBeUndefined();
    // Синий палитры ячеек — по имени, чтобы следовать теме.
    expect(read.cellProps[0][1].background).toBe('blue');
    expect(read.cellProps[0][2].background).toBe('#00ff00');
    expect(read.cellProps[0][3].background).toBeUndefined();
  });
});
