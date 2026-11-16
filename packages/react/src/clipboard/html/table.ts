import { type InlineNode, isAlignment } from '@inkbrick/document';
import type { FragmentBlock } from '@inkbrick/engine';
import { MAX_TABLE_CELLS, MAX_TABLE_COLUMNS } from '@inkbrick/engine';
import { cleanInline, inlineOf } from './inline';
import { styleOf } from './style';
import type { Style } from './tags';

interface Slot {
  content: InlineNode[];
  align?: string;
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
 * `<table>` → таблица Inkbrick. Объединённые ячейки раскладываются по сетке: текст остаётся в первой ячейке
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

  for (let r = 0; r < rows.length; r++) {
    grid[r] ??= [];

    let column = 0;

    for (const cell of Array.from(rows[r].cells)) {
      while (grid[r][column] !== undefined) column++;

      const columns = span(cell, 'colspan');
      const height = Math.min(span(cell, 'rowspan'), rows.length - r);

      if (column + columns > MAX_TABLE_COLUMNS) return null;

      const slot: Slot = { content: cellContent(cell, style, depth), align: alignOf(cell) };

      for (let dr = 0; dr < height; dr++) {
        grid[r + dr] ??= [];

        for (let dc = 0; dc < columns; dc++)
          grid[r + dr][column + dc] =
            dr === 0 && dc === 0 ? slot : { content: [], align: slot.align };
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

  return [
    block(
      'block:table',
      { header },
      [],
      grid.map((row) =>
        block(
          'block:table-row',
          {},
          [],
          Array.from({ length: width }, (_, column) => {
            const slot = row[column];

            return block(
              'block:table-cell',
              slot?.align ? { align: slot.align } : {},
              slot?.content ?? [],
              [],
            );
          }),
        ),
      ),
    ),
  ];
}
