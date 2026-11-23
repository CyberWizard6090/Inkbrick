import type { TableRange } from '@inkbrick/engine';

/*
 * Геометрия управления таблицей: где на экране строка, ячейка, границы столбцов и рамка выделения. Всё считается по
 * `getBoundingClientRect`, в координатах окна (ручки стоят по `position: fixed`).
 */

export interface Position {
  readonly row: number;
  readonly column: number;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Layout {
  /** Видимая часть сетки: при прокрутке внутри блока таблицы (широкая, закреплённая строка) она меньше сетки. */
  readonly table: Box;
  /** Вся сетка, в том числе прокрученная за край блока. */
  readonly grid: Box;
  readonly row: Box;
  readonly cell: Box;
  /** Правые края столбцов (по ячейкам первой строки). */
  readonly edges: readonly Edge[];
  /** Все участки границ столбцов: у объединённых ячеек граница лежит кусками, и у каждого куска своя ручка. */
  readonly segments: readonly (Edge & { column: number })[];
  /** Рамка выделения (телефон): прямоугольник выделенных ячеек, а без выделения — ячейка с кареткой. */
  readonly frame: Box;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Верх ручки не уходит за верхний край окна: когда таблица почти у верха, ручки остаются доступны. */
export const edgeTop = (top: number) => Math.max(4, top);

function boxOf(element: Element): Box {
  const { left, top, width, height } = element.getBoundingClientRect();

  return { left, top, width, height };
}

/**
 * Сетка, обрезанная рамкой блока таблицы, который прокручивается сам: ручки строки, столбца и угла стоят у видимого
 * края, а не у края сетки, уехавшего за рамку.
 */
function visibleBox(grid: Element): Box {
  const own = grid.getBoundingClientRect();
  const frame = grid.closest('[data-inkbrick-block="table"]')?.getBoundingClientRect() ?? own;
  const left = Math.max(own.left, frame.left);
  const top = Math.max(own.top, frame.top);
  const right = Math.min(own.right, frame.right);
  const bottom = Math.min(own.bottom, frame.bottom);

  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export interface Edge {
  readonly x: number;
  readonly top: number;
  readonly height: number;
}

/**
 * Правые границы столбцов и участок, где граница настоящая. Скрытые (перекрытые) ячейки остаются в `row.cells`, поэтому
 * номер ячейки — это столбец; объединённая ячейка даёт границу только своего последнего столбца. Участок — самая длинная
 * непрерывная цепочка строк с такой границей: ручка не лежит поверх текста объединённых ячеек.
 */
function columnEdges(table: HTMLTableElement): {
  edges: Edge[];
  segments: (Edge & { column: number })[];
} {
  const columns = table.rows[0]?.cells.length ?? 0;
  const found: { x: number; top: number; bottom: number }[][] = Array.from(
    { length: columns },
    () => [],
  );

  for (const row of Array.from(table.rows)) {
    Array.from(row.cells).forEach((cell, index) => {
      const last = index + Math.max(1, cell.colSpan) - 1;

      if (cell.hidden || last >= columns) return;

      const { right, top, bottom } = cell.getBoundingClientRect();

      found[last].push({ x: right, top, bottom });
    });
  }

  const bounds = table.getBoundingClientRect();
  const all: (Edge & { column: number })[] = [];
  let previous = bounds.left;

  const edges = found.map((segments, column) => {
    const runs: { x: number; top: number; bottom: number }[] = [];

    for (const segment of segments.sort((a, b) => a.top - b.top)) {
      const run = runs[runs.length - 1];

      if (run && segment.top - run.bottom <= 2) run.bottom = Math.max(run.bottom, segment.bottom);
      else runs.push({ ...segment });
    }

    const best = [...runs].sort((a, b) => b.bottom - b.top - (a.bottom - a.top))[0];

    previous = best?.x ?? previous;

    const edge = best
      ? { x: best.x, top: best.top, height: best.bottom - best.top }
      : { x: previous, top: bounds.top, height: bounds.height };

    // Ручка на каждом участке границы: объединение внизу не должно оставлять без ручки верхние строки. У столбца всегда
    // есть хотя бы одна: основная, даже если все участки короче порога.
    const long = runs.filter((run) => run.bottom - run.top >= MIN_SEGMENT);

    if (long.length === 0) all.push({ column, ...edge });
    else
      for (const run of long)
        all.push({ column, x: run.x, top: run.top, height: run.bottom - run.top });

    return edge;
  });

  return { edges, segments: all };
}

/** Участок границы короче этого не получает ручки: под палец он слишком мал. */
const MIN_SEGMENT = 16;

/**
 * Прямоугольник выделенных ячеек: хватает ячеек по периметру диапазона (скрытые ячейки объединений пропускаются, а их
 * видимая верхняя левая ячейка занимает всю площадь объединения).
 */
function rangeBox(table: HTMLTableElement, range: TableRange): Box | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const add = (cell: HTMLTableCellElement | undefined) => {
    if (!cell || cell.hidden) return;

    const box = cell.getBoundingClientRect();

    if (box.width === 0) return;

    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  };

  for (let column = range.left; column <= range.right; column++) {
    add(table.rows[range.top]?.cells[column]);
    add(table.rows[range.bottom]?.cells[column]);
  }

  for (let row = range.top; row <= range.bottom; row++) {
    add(table.rows[row]?.cells[range.left]);
    add(table.rows[row]?.cells[range.right]);
  }

  return Number.isFinite(left) ? { left, top, width: right - left, height: bottom - top } : null;
}

export function measure(
  table: HTMLTableElement,
  position: Position,
  range?: TableRange,
): Layout | null {
  const row = table.rows[position.row];
  const cell = row?.cells[position.column];
  const first = table.rows[0];

  if (!row || !cell || !first) return null;

  return {
    table: visibleBox(table),
    grid: boxOf(table),
    row: boxOf(row),
    cell: boxOf(cell),
    ...columnEdges(table),
    frame: (range && rangeBox(table, range)) || boxOf(cell),
  };
}

export const sameLayout = (a: Layout | null, b: Layout | null) =>
  a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));
