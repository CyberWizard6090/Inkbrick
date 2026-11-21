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

describe('tables pasted from spreadsheets keep merges, fills and widths', () => {
  it('Google Sheets: merged header, filled cells, bold text and column widths', () => {
    const fragment = htmlToFragment(
      '<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}--></style>' +
        '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none" data-sheets-root="1">' +
        '<colgroup><col width="120"><col width="80"><col width="80"></colgroup><tbody>' +
        '<tr style="height:21px;"><td colspan="3" rowspan="1" style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;background-color:#ffff00;font-weight:bold;text-align:center;">Report</td></tr>' +
        '<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;">Apples</td>' +
        '<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;background-color:#22c55e;">3</td>' +
        '<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;background-color:#ffffff;">4</td></tr>' +
        '</tbody></table></google-sheets-html-origin>',
    )!;
    const table = fragment.blocks[0];
    const read = readTable(table);

    expect(table.props.merges).toEqual([{ row: 0, column: 0, rows: 1, columns: 3 }]);
    expect(read.widths).toEqual([120, 80, 80]);
    expect(read.cellProps[0][0]).toEqual({ align: 'center', background: '#ffff00' });
    expect(read.rows[0][0]).toEqual([{ insert: 'Report', attributes: { bold: true } }]);
    // Зелёный палитры ячеек — по имени; белый лист таблицы не переносится.
    expect(read.cellProps[1][1]).toEqual({ align: 'right', background: 'green' });
    expect(read.cellProps[1][2]).toEqual({ align: 'right' });
  });

  it('Excel: <col> without <colgroup>, a colspan and an mso fill', () => {
    const table = htmlToFragment(
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment-->' +
        '<table border=0 cellpadding=0 cellspacing=0 width=192 style="border-collapse:collapse;width:144pt">' +
        '<col width=64 span=3 style="width:48pt">' +
        '<tr height=20 style="height:15.0pt"><td colspan=2 height=20 class=xl67 width=128 style="height:15.0pt;width:96pt;background:#FFC000;mso-pattern:black none">Fruit</td>' +
        '<td class=xl65 width=64 style="width:48pt">Qty</td></tr>' +
        '<tr height=20><td height=20>Apple</td><td>red</td><td align=right x:num>3</td></tr>' +
        '<!--EndFragment--></table></body></html>',
    )!.blocks[0];
    const read = readTable(table);

    expect(table.props.merges).toEqual([{ row: 0, column: 0, rows: 1, columns: 2 }]);
    expect(read.widths).toEqual([64, 64, 64]);
    expect(read.cellProps[0][0].background).toBe('#ffc000');
    expect(read.rows.map((row) => row.map((cell) => cell.map((n) => n.insert).join('')))).toEqual([
      ['Fruit', '', 'Qty'],
      ['Apple', 'red', '3'],
    ]);
  });
});
