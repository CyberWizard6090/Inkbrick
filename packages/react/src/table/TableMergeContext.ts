import { createContext } from 'react';

export interface MergedCell {
  /** Ячейка перекрыта объединением: она есть в документе, но не показывается. */
  readonly covered: boolean;
  readonly colSpan: number;
  readonly rowSpan: number;
}

/** Объединённые ячейки таблицы по id ячейки; в таблице без объединений — пустая карта. */
export const TableMergeContext = createContext<ReadonlyMap<string, MergedCell>>(new Map());

/**
 * Строка заголовка таблицы (id первой строки) или `null`, если заголовка нет. Ячейки читают её из контекста, а не из
 * хранилища: так они перерисовываются, когда заголовок выключают или первой становится другая строка.
 */
export const TableHeaderRowContext = createContext<string | null>(null);
