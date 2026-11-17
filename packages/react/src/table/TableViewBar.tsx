import type { BaseBlock } from '@inkbrick/document';

import { useEditor } from '../hooks/useEditor';
import { useT } from '../hooks/useT';

export interface TableViewBarProps {
  readonly block: BaseBlock;
  readonly hiddenColumns: number;
  readonly filters: number;
  /** Сколько строк скрыто фильтрами. */
  readonly hiddenRows: number;
  readonly readOnly: boolean;
}

/**
 * Полоса над таблицей, пока часть её скрыта: сколько столбцов и строк не видно и как вернуть всё. Без неё скрытое
 * нельзя было бы найти.
 */
export function TableViewBar({
  block,
  hiddenColumns,
  filters,
  hiddenRows,
  readOnly,
}: TableViewBarProps) {
  const editor = useEditor();
  const t = useT();
  const props = block.props as { columnHidden?: boolean[]; columnFilters?: unknown[] };

  const clear = () =>
    editor.batch(() => {
      props.columnFilters?.forEach((filter, index) => {
        if (filter) {
          editor.dispatch({
            type: 'setTableColumnFilter',
            payload: { blockId: block.id, index, filter: null },
          } as never);
        }
      });

      props.columnHidden?.forEach((hidden, index) => {
        if (hidden) {
          editor.dispatch({
            type: 'setTableColumnHidden',
            payload: { blockId: block.id, index, hidden: false },
          } as never);
        }
      });
    });

  return (
    <div
      data-inkbrick-part="view-bar"
      data-testid="table-view-bar"
      role="group"
      aria-label={t('table.view.label')}
    >
      {filters > 0 && (
        <span data-inkbrick-part="view-filters">
          {t('table.view.filters', { count: filters, rows: hiddenRows })}
        </span>
      )}
      {hiddenColumns > 0 && (
        <span data-inkbrick-part="view-columns">
          {t('table.view.columns', { count: hiddenColumns })}
        </span>
      )}
      {!readOnly && (
        <button type="button" data-inkbrick-part="view-reset" onClick={clear}>
          {t('table.view.reset')}
        </button>
      )}
    </div>
  );
}
