import { createContext } from 'react';

import type { TableColumnType, TableOption } from '@inkbrick/document';

export interface TableColumns {
  /** Первая строка — заголовок: он остаётся текстом при любом типе столбца. */
  readonly header: boolean;
  readonly types: readonly (TableColumnType | undefined)[];
  /** Скрытые столбцы по порядку. */
  readonly hidden: readonly boolean[];
  readonly options: readonly (readonly TableOption[] | null | undefined)[];
}

/**
 * Типы, варианты и скрытие столбцов таблицы. `null` — в таблице только обычные текстовые столбцы: ячейки рисуются как
 * раньше и не ищут свой столбец.
 */
export const TableColumnContext = createContext<TableColumns | null>(null);

/** Строки (id), скрытые фильтрами таблицы; пустое множество — все видны. */
export const TableHiddenRowsContext = createContext<ReadonlySet<string>>(new Set());
