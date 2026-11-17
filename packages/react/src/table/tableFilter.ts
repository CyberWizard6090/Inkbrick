import type {
  BlockId,
  BaseBlock,
  TableColumnType,
  TableFilter,
  TableProps,
  TableView,
} from '@inkbrick/document';

import { parseDate, parseNumber, sortKey, sortedOrder } from '@inkbrick/engine';

/** Какие условия имеет смысл предлагать для типа столбца. */
export function filterOpsFor(type: TableColumnType): readonly TableFilter['op'][] {
  if (type === 'checkbox') return ['checked', 'unchecked'];
  if (type === 'number' || type === 'date')
    return ['equals', 'notEquals', 'gt', 'lt', 'empty', 'notEmpty'];

  return ['contains', 'notContains', 'equals', 'notEquals', 'empty', 'notEmpty'];
}

/** Нужно ли условию значение для сравнения. */
export const filterNeedsValue = (op: TableFilter['op']): boolean =>
  !['empty', 'notEmpty', 'checked', 'unchecked'].includes(op);

/** Подходит ли текст ячейки фильтру (учитывает тип столбца). */
export function matchesFilter(text: string, type: TableColumnType, filter: TableFilter): boolean {
  const value = text.trim();
  const target = (filter.value ?? '').trim();

  switch (filter.op) {
    case 'empty':
      return value === '';
    case 'notEmpty':
      return value !== '';
    case 'checked':
      return value.toLowerCase() === 'true';
    case 'unchecked':
      return value.toLowerCase() !== 'true';
  }

  // Пустое условие ничего не отсеивает: пока значение не введено, строки не пропадают.
  if (target === '') return true;

  if (type === 'number' || type === 'date') {
    const parse = type === 'number' ? parseNumber : parseDate;
    const left = parse(value);
    const right = parse(target);

    if (right === undefined) return true;
    if (left === undefined) return filter.op === 'notEquals';

    switch (filter.op) {
      case 'equals':
        return left === right;
      case 'notEquals':
        return left !== right;
      case 'gt':
        return left > right;
      case 'lt':
        return left < right;
      default:
        return true;
    }
  }

  const left = value.toLowerCase();
  const right = target.toLowerCase();
  const parts = type === 'multiselect' ? left.split(',').map((part) => part.trim()) : [left];

  switch (filter.op) {
    case 'contains':
      return left.includes(right);
    case 'notContains':
      return !left.includes(right);
    case 'equals':
      return parts.includes(right);
    case 'notEquals':
      return !parts.includes(right);
    default:
      return true;
  }
}

/**
 * Строки таблицы, скрытые фильтрами вида (id строк). Заголовок не фильтруется; строка скрыта, если не подходит хотя бы
 * одному фильтру. `textOf` — текст ячейки.
 */
export function filteredRowIds(
  table: BaseBlock,
  getBlock: (id: BlockId) => BaseBlock | undefined,
  textOf: (cell: BaseBlock) => string,
  filters: readonly (TableFilter | null | undefined)[] | undefined,
): Set<BlockId> {
  const props = table.props as TableProps;
  const hidden = new Set<BlockId>();

  if (!filters?.some((filter) => filter)) return hidden;

  const body = table.children.slice(props.header === false ? 0 : 1);

  for (const rowId of body) {
    const row = getBlock(rowId);

    if (!row) continue;

    const visible = filters.every((filter, column) => {
      if (!filter) return true;

      const cell = getBlock(row.children[column] ?? '');

      return matchesFilter(cell ? textOf(cell) : '', props.columnTypes?.[column] ?? 'text', filter);
    });

    if (!visible) hidden.add(rowId);
  }

  return hidden;
}

/**
 * Порядок показа строк вида: заголовок первым, остальные по столбцу сортировки (как при сортировке данных, но порядок в
 * документе не меняется). `null` — порядок документа.
 */
export function sortedRowIds(
  table: BaseBlock,
  getBlock: (id: BlockId) => BaseBlock | undefined,
  textOf: (cell: BaseBlock) => string,
  sort: TableView['sort'],
): BlockId[] | null {
  if (!sort) return null;

  const props = table.props as TableProps;
  const fixed = props.header === false ? 0 : 1;
  const rows = table.children.slice(fixed);
  const type = props.columnTypes?.[sort.column] ?? 'text';
  const keys = rows.map((rowId) => {
    const cell = getBlock(getBlock(rowId)?.children[sort.column] ?? '');

    return sortKey(cell ? textOf(cell) : '', type);
  });

  return [
    ...table.children.slice(0, fixed),
    ...sortedOrder(keys, sort.direction).map((index) => rows[index]),
  ];
}
