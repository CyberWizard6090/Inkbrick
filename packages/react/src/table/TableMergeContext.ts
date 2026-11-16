import { createContext } from 'react';

export interface MergedCell {
  /** Ячейка перекрыта объединением: она есть в документе, но не показывается. */
  readonly covered: boolean;
  readonly colSpan: number;
  readonly rowSpan: number;
}

/** Объединённые ячейки таблицы по id ячейки; в таблице без объединений — пустая карта. */
export const TableMergeContext = createContext<ReadonlyMap<string, MergedCell>>(new Map());
