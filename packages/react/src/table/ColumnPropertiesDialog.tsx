import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  TABLE_COLUMN_TYPES,
  TABLE_OPTION_COLORS,
  type BaseBlock,
  type TableColumnType,
  type TableFilter,
  type TableOption,
  type TableProps,
} from '@inkbrick/document';

import { useEditor } from '../hooks/useEditor';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { isSelectType } from './columnTypes';
import { filterNeedsValue, filterOpsFor } from './tableFilter';

export interface ColumnPropertiesDialogProps {
  readonly block: BaseBlock;
  readonly column: number;
  readonly onClose: () => void;
}

/**
 * Свойства столбца: тип и, для выбора и мультивыбора, варианты списка с цветом. Изменения применяются кнопкой
 * «Готово» одним шагом отмены; Esc и «Отмена» закрывают без изменений.
 */
export function ColumnPropertiesDialog({ block, column, onClose }: ColumnPropertiesDialogProps) {
  const editor = useEditor();
  const t = useT();
  const props = block.props as TableProps;
  const [type, setType] = useState<TableColumnType>(props.columnTypes?.[column] ?? 'text');
  const [options, setOptions] = useState<TableOption[]>(
    () => props.columnOptions?.[column]?.map((option) => ({ ...option })) ?? [],
  );
  const [filter, setFilter] = useState<TableFilter | null>(props.columnFilters?.[column] ?? null);
  const first = useRef<HTMLSelectElement>(null);
  // Фильтры и скрытие недоступны в таблице с объединёнными ячейками.
  const canFilter = editor.can('setTableColumnFilter', {
    blockId: block.id,
    index: column,
    filter: null,
  } as never);
  const ops = filterOpsFor(type);
  // Условие, которого нет у нового типа столбца, не остаётся: «больше» для флажка было бы бессмысленно.
  const activeFilter = filter && ops.includes(filter.op) ? filter : null;

  useEffect(() => first.current?.focus(), []);

  const labels = options.map((option) => option.label.trim());
  const errors = options.map((option, index) =>
    option.label.trim() === ''
      ? 'empty'
      : option.label.includes(',')
        ? 'comma'
        : labels.indexOf(option.label.trim()) !== index
          ? 'duplicate'
          : null,
  );
  const withOptions = isSelectType(type);
  const invalid = withOptions && errors.some(Boolean);

  const apply = () => {
    if (invalid) return;

    editor.batch(() => {
      editor.dispatch({
        type: 'setTableColumnType',
        payload: { blockId: block.id, index: column, type },
      } as never);
      editor.dispatch({
        type: 'setTableColumnOptions',
        payload: {
          blockId: block.id,
          index: column,
          options: withOptions ? options.map((o) => ({ ...o, label: o.label.trim() })) : [],
        },
      } as never);

      if (canFilter) {
        editor.dispatch({
          type: 'setTableColumnFilter',
          payload: { blockId: block.id, index: column, filter: activeFilter },
        } as never);
      }
    });
    onClose();
  };

  const update = (index: number, change: Partial<TableOption>) =>
    setOptions((list) =>
      list.map((option, i) => (i === index ? { ...option, ...change } : option)),
    );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-inkbrick-ui="column-properties-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-inkbrick-ui="column-properties"
        data-testid="column-properties"
        role="dialog"
        aria-modal="true"
        aria-label={t('table.props.title', { column: column + 1 })}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
            event.preventDefault();
            apply();
          }
        }}
      >
        <h3 data-inkbrick-part="title">{t('table.props.title', { column: column + 1 })}</h3>
        <label data-inkbrick-part="field">
          <span>{t('table.props.type')}</span>
          <select
            ref={first}
            data-inkbrick-part="type"
            value={type}
            onChange={(event) => setType(event.target.value as TableColumnType)}
          >
            {TABLE_COLUMN_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`table.props.type.${value}`)}
              </option>
            ))}
          </select>
        </label>
        {withOptions && (
          <div data-inkbrick-part="options">
            <span>{t('table.props.options')}</span>
            {options.map((option, index) => (
              <div key={index} data-inkbrick-part="option-row">
                <select
                  data-inkbrick-part="color"
                  value={option.color ?? 'gray'}
                  aria-label={t('table.props.color')}
                  data-color={option.color ?? 'gray'}
                  onChange={(event) =>
                    update(index, { color: event.target.value as TableOption['color'] })
                  }
                >
                  {TABLE_OPTION_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {t(`table.props.color.${color}`)}
                    </option>
                  ))}
                </select>
                <input
                  data-inkbrick-part="label"
                  type="text"
                  value={option.label}
                  maxLength={100}
                  aria-label={t('table.props.optionName')}
                  aria-invalid={errors[index] ? true : undefined}
                  onChange={(event) => update(index, { label: event.target.value })}
                />
                <button
                  type="button"
                  data-inkbrick-part="remove"
                  aria-label={t('table.props.removeOption')}
                  title={t('table.props.removeOption')}
                  onClick={() => setOptions((list) => list.filter((_, i) => i !== index))}
                >
                  <Icon name="x" />
                </button>
                {errors[index] && (
                  <span data-inkbrick-part="error" role="alert">
                    {t(`table.props.error.${errors[index]!}`)}
                  </span>
                )}
              </div>
            ))}
            <button
              type="button"
              data-inkbrick-part="add"
              onClick={() => setOptions((list) => [...list, { label: '', color: 'gray' }])}
            >
              <Icon name="plus" /> {t('table.props.addOption')}
            </button>
          </div>
        )}
        {canFilter && (
          <div data-inkbrick-part="filter">
            <span>{t('table.filter.title')}</span>
            <div data-inkbrick-part="filter-row">
              <select
                data-inkbrick-part="filter-op"
                value={activeFilter?.op ?? ''}
                aria-label={t('table.filter.title')}
                onChange={(event) =>
                  setFilter(
                    event.target.value
                      ? { op: event.target.value as TableFilter['op'], value: filter?.value }
                      : null,
                  )
                }
              >
                <option value="">{t('table.filter.none')}</option>
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {t(`table.filter.op.${op}`)}
                  </option>
                ))}
              </select>
              {activeFilter && filterNeedsValue(activeFilter.op) && (
                <input
                  data-inkbrick-part="filter-value"
                  type="text"
                  value={activeFilter.value ?? ''}
                  maxLength={200}
                  aria-label={t('table.filter.value')}
                  onChange={(event) => setFilter({ ...activeFilter, value: event.target.value })}
                />
              )}
            </div>
          </div>
        )}
        <div data-inkbrick-part="actions">
          <button type="button" data-inkbrick-part="cancel" onClick={onClose}>
            {t('table.props.cancel')}
          </button>
          <button type="button" data-inkbrick-part="apply" disabled={invalid} onClick={apply}>
            {t('table.props.apply')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
