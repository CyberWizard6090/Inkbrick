import { type InlineNode, TABLE_CELL_COLORS, isAlignment } from '@inkbrick/document';
import type { FragmentBlock } from '@inkbrick/engine';
import { MAX_TABLE_CELLS, MAX_TABLE_COLUMNS } from '@inkbrick/engine';
import { cleanInline, inlineOf } from './inline';
import { styleOf } from './style';
import type { Style } from './tags';

interface Slot {
  content: InlineNode[];
  align?: string;
  background?: string;
}

const block = (
  flavour: string,
  props: Record<string, unknown>,
  content: InlineNode[],
  children: FragmentBlock[],
): FragmentBlock => ({ flavour, props, content, children });

const span = (cell: Element, name: 'colspan' | 'rowspan'): number => {
  const value = Math.trunc(Number(cell.getAttribute(name)));

  // 0 у rowspan означает «до конца секции» — для таблицы без слияния это одна строка.
  return Number.isFinite(value) && value > 1 ? value : 1;
};

/** Выравнивание ячейки: атрибут `align` или `text-align` в стиле (Word, Excel, Google Sheets). */
function alignOf(cell: HTMLElement): string | undefined {
  const value = (cell.style?.textAlign || cell.getAttribute('align') || '').trim().toLowerCase();

  return isAlignment(value) && value !== 'left' ? value : undefined;
}

/** `#rrggbb` из цвета CSS (`#rgb`, `#rrggbb`, `rgb()`); прозрачный, полупрозрачный и прочее — `undefined`. */
function hexOf(value: string): string | undefined {
  const color = value.trim().toLowerCase();
  const short = /^#([\da-f])([\da-f])([\da-f])$/.exec(color);

  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[\da-f]{6}$/.test(color)) return color;

  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(color);

  if (!rgb) return undefined;
  if (rgb[4] !== undefined && parseFloat(rgb[4]) < (rgb[4].endsWith('%') ? 100 : 1))
    return undefined;

  return `#${rgb
    .slice(1, 4)
    .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0'))
    .join('')}`;
}

const CELL_NAMES = new Map(
  Object.entries(TABLE_CELL_COLORS).map(([name, hex]) => [hex.toLowerCase(), name]),
);

/**
 * Фон ячейки: цвет палитры ячеек — по имени (так он следует теме), иной — свой `#rrggbb`. Белый не переносится: это фон
 * страницы в Word и Excel, а в тёмной теме он стал бы белым пятном.
 */
function backgroundOf(cell: HTMLElement): string | undefined {
  const hex = hexOf(cell.style?.backgroundColor || cell.getAttribute('bgcolor') || '');

  if (!hex || hex === '#ffffff') return undefined;

  return CELL_NAMES.get(hex) ?? hex;
}

/** Ширины столбцов из `<colgroup>`: `style="width:120px"` или `width="120"`; прочее — по содержимому. */
function widthsOf(table: HTMLTableElement, count: number): (number | null)[] | undefined {
  const cols = Array.from(table.querySelectorAll(':scope > colgroup > col'));
  const widths: (number | null)[] = [];

  for (const col of cols) {
    const raw = (col as HTMLElement).style?.width || col.getAttribute('width') || '';
    const px = /^(\d+(?:\.\d+)?)(px)?$/.exec(raw.trim());
    const value = px ? Math.round(Number(px[1])) : null;
    const span = Math.max(1, Math.trunc(Number(col.getAttribute('span'))) || 1);

    for (let i = 0; i < span; i++) widths.push(value && value > 0 ? value : null);
  }

  const result = Array.from({ length: count }, (_, i) => widths[i] ?? null);

  return result.some((width) => width !== null) ? result : undefined;
}

/** Текст ячейки: абзацы и `<br>` — строки внутри ячейки (подряд идущие переводы строк сворачиваются). */
function cellContent(cell: HTMLElement, style: Style, depth: number): InlineNode[] {
  const content: InlineNode[] = [];
  const own = styleOf(cell, style);

  cell.childNodes.forEach((child) => inlineOf(child, own, content, depth + 1));

  return cleanInline(content).map((node) => ({
    ...node,
    insert: node.insert.replace(/\n{2,}/g, '\n'),
  }));
}

/**
 * `<table>` → таблица Inkbrick. Объединённые ячейки (`colspan`, `rowspan`) остаются объединёнными: текст в первой ячейке
 * области, остальные пусты. Первая строка — заголовок, если она в `<thead>` или состоит из `<th>`.
 *
 * Результат: `[таблица]`; таблица из одной ячейки — абзац с её текстом (так вставляется копия одной ячейки
 * из Excel); `null` — таблицы нет или она больше пределов (вызывающий разберёт её строками текста).
 */
export function importTable(
  table: HTMLTableElement,
  style: Style,
  depth: number,
): FragmentBlock[] | null {
  const rows = Array.from(table.rows ?? []);

  if (rows.length === 0 || rows.length > MAX_TABLE_CELLS) return null;

  const grid: (Slot | undefined)[][] = [];
  const merges: { row: number; column: number; rows: number; columns: number }[] = [];

  for (let r = 0; r < rows.length; r++) {
    grid[r] ??= [];

    let column = 0;

    for (const cell of Array.from(rows[r].cells)) {
      while (grid[r][column] !== undefined) column++;

      const columns = span(cell, 'colspan');
      const height = Math.min(span(cell, 'rowspan'), rows.length - r);

      if (column + columns > MAX_TABLE_COLUMNS) return null;

      if (columns > 1 || height > 1) merges.push({ row: r, column, rows: height, columns });

      const slot: Slot = {
        content: cellContent(cell, style, depth),
        align: alignOf(cell),
        background: backgroundOf(cell),
      };

      for (let dr = 0; dr < height; dr++) {
        grid[r + dr] ??= [];

        for (let dc = 0; dc < columns; dc++)
          grid[r + dr][column + dc] =
            dr === 0 && dc === 0
              ? slot
              : { content: [], align: slot.align, background: slot.background };
      }

      column += columns;
    }
  }

  const width = Math.max(0, ...grid.map((row) => row.length));

  if (width === 0) return null;
  if (rows.length * width > MAX_TABLE_CELLS) return null;

  if (rows.length === 1 && width === 1) {
    const content = grid[0][0]?.content ?? [];

    return content.length > 0 ? [block('block:paragraph', {}, content, [])] : [];
  }

  const header =
    rows[0].parentElement?.tagName === 'THEAD' ||
    (rows[0].cells.length > 0 && Array.from(rows[0].cells).every((cell) => cell.tagName === 'TH'));

  const widths = widthsOf(table, width);
  const props: Record<string, unknown> = { header };

  if (merges.length > 0) props.merges = merges;
  if (widths) props.widths = widths;

  return [
    block(
      'block:table',
      props,
      [],
      grid.map((row) =>
        block(
          'block:table-row',
          {},
          [],
          Array.from({ length: width }, (_, column) => {
            const slot = row[column];

            const cellProps: Record<string, unknown> = {};

            if (slot?.align) cellProps.align = slot.align;
            if (slot?.background) cellProps.background = slot.background;

            return block('block:table-cell', cellProps, slot?.content ?? [], []);
          }),
        ),
      ),
    ),
  ];
}
