import { normalizeMerges, type TableMerge } from '@inkbrick/document';

export { normalizeMerges };

import type { TableRange } from './tableRange';

/** Одна ось сетки: строки или столбцы. */
export type TableAxis = 'row' | 'column';

const sizeKey = (axis: TableAxis) => (axis === 'row' ? 'rows' : 'columns');

/** Объединение, в которое входит ячейка (в том числе перекрытая), и является ли она его верхней левой. */
export function mergeAt(
  merges: readonly TableMerge[],
  row: number,
  column: number,
): { merge: TableMerge; origin: boolean } | undefined {
  const merge = merges.find(
    (item) =>
      row >= item.row &&
      row < item.row + item.rows &&
      column >= item.column &&
      column < item.column + item.columns,
  );

  return merge && { merge, origin: merge.row === row && merge.column === column };
}

/** Вставка строки или столбца на место `index`: объединения сдвигаются, а те, что пересекают линию вставки, растут. */
export function mergesAfterInsert(
  merges: readonly TableMerge[],
  axis: TableAxis,
  index: number,
): TableMerge[] {
  const start = axis;
  const size = sizeKey(axis);

  return merges.map((merge) => {
    if (index <= merge[start]) return { ...merge, [start]: merge[start] + 1 };
    if (index < merge[start] + merge[size]) return { ...merge, [size]: merge[size] + 1 };

    return { ...merge };
  });
}

/** Удаление строки или столбца: объединения сдвигаются и сжимаются; ставшие одной ячейкой пропадают. */
export function mergesAfterDelete(
  merges: readonly TableMerge[],
  axis: TableAxis,
  index: number,
): TableMerge[] {
  const start = axis;
  const size = sizeKey(axis);
  const result: TableMerge[] = [];

  for (const merge of merges) {
    let next: TableMerge;

    if (index < merge[start]) next = { ...merge, [start]: merge[start] - 1 };
    else if (index < merge[start] + merge[size]) next = { ...merge, [size]: merge[size] - 1 };
    else next = { ...merge };

    if (next.rows >= 1 && next.columns >= 1 && next.rows * next.columns >= 2) result.push(next);
  }

  return result;
}

/** Прямоугольник, расширенный так, чтобы объединённые ячейки не оказались выделены наполовину. */
export function expandRangeToMerges(range: TableRange, merges: readonly TableMerge[]): TableRange {
  let current = range;
  let changed = true;

  while (changed) {
    changed = false;

    for (const merge of merges) {
      const touches =
        merge.row <= current.bottom &&
        current.top < merge.row + merge.rows &&
        merge.column <= current.right &&
        current.left < merge.column + merge.columns;

      if (!touches) continue;

      const next = {
        top: Math.min(current.top, merge.row),
        left: Math.min(current.left, merge.column),
        bottom: Math.max(current.bottom, merge.row + merge.rows - 1),
        right: Math.max(current.right, merge.column + merge.columns - 1),
      };

      if (
        next.top !== current.top ||
        next.left !== current.left ||
        next.bottom !== current.bottom ||
        next.right !== current.right
      ) {
        current = next;
        changed = true;
      }
    }
  }

  return current;
}

/** Объединения, целиком лежащие в прямоугольнике, с координатами относительно его верхнего левого угла. */
export function mergesWithin(merges: readonly TableMerge[], range: TableRange): TableMerge[] {
  return merges
    .filter(
      (merge) =>
        merge.row >= range.top &&
        merge.column >= range.left &&
        merge.row + merge.rows - 1 <= range.bottom &&
        merge.column + merge.columns - 1 <= range.right,
    )
    .map((merge) => ({ ...merge, row: merge.row - range.top, column: merge.column - range.left }));
}

const runStart = (kept: readonly number[], first: number, length: number): number => {
  const at = kept.indexOf(first);

  if (at < 0) return -1;

  for (let i = 1; i < length; i++) if (kept[at + i] !== first + i) return -1;

  return at;
};

/**
 * Объединения после выбора части строк и столбцов (копирование): остаются те, чьи строки и столбцы вошли целиком
 * и подряд, с новыми номерами.
 */
export function mergesAfterKeeping(
  merges: readonly TableMerge[],
  keptRows: readonly number[],
  keptColumns: readonly number[],
): TableMerge[] {
  const result: TableMerge[] = [];

  for (const merge of merges) {
    const row = runStart(keptRows, merge.row, merge.rows);
    const column = runStart(keptColumns, merge.column, merge.columns);

    if (row >= 0 && column >= 0) result.push({ ...merge, row, column });
  }

  return result;
}
