import { useEffect, useRef, useState } from 'react';

import type { BaseBlock, TableView } from '@inkbrick/document';

import { useEditor } from '../hooks/useEditor';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { isCustomized, newViewId, updateView, updateViews } from './views';

export interface TableViewBarProps {
  readonly block: BaseBlock;
  readonly views: readonly TableView[];
  readonly active: TableView;
  readonly onSelect: (id: string) => void;
  readonly hiddenColumns: number;
  readonly filters: number;
  /** Сколько строк скрыто фильтрами. */
  readonly hiddenRows: number;
  readonly readOnly: boolean;
}

/**
 * Полоса над таблицей: переключатель видов и сводка того, что скрыто в открытом виде. Показывается, когда видов
 * несколько или открытый настроен: иначе скрытое нельзя было бы найти.
 */
export function TableViewBar({
  block,
  views,
  active,
  onSelect,
  hiddenColumns,
  filters,
  hiddenRows,
  readOnly,
}: TableViewBarProps) {
  const editor = useEditor();
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const name = (view: TableView) => view.name || t('table.view.default');

  useEffect(() => {
    if (renaming) {
      input.current?.focus();
      input.current?.select();
    }
  }, [renaming]);

  const reset = () =>
    updateView(editor, block, active.id, (view) => ({ id: view.id, name: view.name }));

  const add = () => {
    const id = newViewId();

    if (updateViews(editor, block, (list) => [...list, { id }])) onSelect(id);
  };

  const remove = () => {
    const index = views.findIndex((view) => view.id === active.id);
    const fallback = views[index === 0 ? 1 : index - 1];

    if (updateViews(editor, block, (list) => list.filter((view) => view.id !== active.id))) {
      onSelect(fallback.id);
    }
  };

  const commit = (value: string) => {
    setRenaming(false);

    const next = value.trim().slice(0, 60);

    if (next !== (active.name ?? '')) {
      updateView(editor, block, active.id, (view) => ({ ...view, name: next }));
    }
  };

  return (
    <div data-inkbrick-part="view-bar" data-testid="table-view-bar">
      <div data-inkbrick-part="view-tabs" role="tablist" aria-label={t('table.view.label')}>
        {views.map((view) =>
          view.id === active.id && renaming && !readOnly ? (
            <input
              key={view.id}
              ref={input}
              data-inkbrick-part="view-rename"
              defaultValue={view.name ?? ''}
              placeholder={t('table.view.default')}
              maxLength={60}
              aria-label={t('table.view.rename')}
              onBlur={(event) => commit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit(event.currentTarget.value);
                if (event.key === 'Escape') setRenaming(false);
              }}
            />
          ) : (
            <button
              key={view.id}
              type="button"
              role="tab"
              data-inkbrick-part="view-tab"
              aria-selected={view.id === active.id}
              data-active={view.id === active.id || undefined}
              onClick={() => onSelect(view.id)}
              onDoubleClick={() => !readOnly && view.id === active.id && setRenaming(true)}
            >
              {name(view)}
            </button>
          ),
        )}
        {!readOnly && (
          <button
            type="button"
            data-inkbrick-part="view-add"
            aria-label={t('table.view.add')}
            title={t('table.view.add')}
            onClick={add}
          >
            <Icon name="plus" />
          </button>
        )}
      </div>
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
      {active.sort && <span data-inkbrick-part="view-sort">{t('table.view.sorted')}</span>}
      {!readOnly && isCustomized(active) && (
        <button type="button" data-inkbrick-part="view-reset" onClick={reset}>
          {t('table.view.reset')}
        </button>
      )}
      {!readOnly && !renaming && (
        <>
          <button
            type="button"
            data-inkbrick-part="view-rename-button"
            onClick={() => setRenaming(true)}
          >
            {t('table.view.rename')}
          </button>
          {views.length > 1 && (
            <button type="button" data-inkbrick-part="view-delete" onClick={remove}>
              {t('table.view.delete')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
