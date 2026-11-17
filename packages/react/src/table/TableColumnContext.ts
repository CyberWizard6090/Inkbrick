import { createContext } from 'react';

import type { TableColumnType, TableOption } from '@inkbrick/document';

export interface TableColumns {
  /** Первая строка — заголовок: он остаётся текстом при любом типе столбца. */
  readonly header: boolean;
  readonly types: readonly (TableColumnType | undefined)[];
  readonly options: readonly (readonly TableOption[] | null | undefined)[];
}

/**
 * Типы и варианты столбцов таблицы. `null` — в таблице только текстовые столбцы: ячейки рисуются как обычно и не
 * ищут свой столбец.
 */
export const TableColumnContext = createContext<TableColumns | null>(null);
