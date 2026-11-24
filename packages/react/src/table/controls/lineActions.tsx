import type { Alignment, BaseBlock, TableProps } from '@inkbrick/document';
import type { CaretResult, Editor } from '@inkbrick/engine';
import type { EditorView } from '@inkbrick/view';

import type { BlockMenuAction } from '../../block-handle/types';
import { Icon } from '../../icons/Icon';
import type { TFunction } from '@inkbrick/locales';
import { selectTableLine } from '../cellSelection';
import type { Position } from './geometry';

/** Что нужно меню строки и столбца таблицы: редактор, таблица, активная ячейка и действия компонента. */
export interface LineActionsContext {
  readonly editor: Editor;
  readonly view: EditorView;
  readonly block: BaseBlock;
  readonly t: TFunction;
  readonly props: TableProps;
  readonly size: { readonly rows: number; readonly columns: number };
  /** Ячейка, у которой открыто управление. */
  readonly active: Position;
  /** Дробный разделитель языка интерфейса: по нему сортировка читает «0,125» как дробь. */
  readonly decimal: ',' | '.';
  readonly canAddRow: boolean;
  readonly canAddColumn: boolean;
  /** Действие одним шагом undo; каретка — в ячейку, которую вернуло действие. */
  perform(action: () => CaretResult | undefined | void): void;
  /** Команда таблицы (`blockId` подставляется). */
  run(type: string, payload: Record<string, unknown>): CaretResult | undefined;
  can(type: string, payload: Record<string, unknown>): boolean;
  /** Каретка в начале ячейки. */
  cellAt(row: number, column: number): CaretResult;
  closeMenu(): void;
  /** Открыть ползунок ширины столбца (телефон). */
  startSizing(column: number): void;
}

export function rowActions(context: LineActionsContext, { row }: Position): BlockMenuAction[] {
  const { editor, view, block, t, props, active, perform, run, can, cellAt, canAddRow, closeMenu } =
    context;

  const actions: BlockMenuAction[] = [
    {
      id: 'row-select',
      title: t('table.row.select'),
      icon: <Icon name="select-all" />,
      run: () => {
        closeMenu();
        selectTableLine(editor, view, block.id, { row });
      },
    },
    {
      id: 'row-insert-above',
      title: t('table.row.insertAbove'),
      icon: <Icon name="plus" />,
      disabled: !canAddRow,
      run: () => perform(() => run('insertTableRow', { index: row })),
    },
    {
      id: 'row-insert-below',
      title: t('table.row.insertBelow'),
      icon: <Icon name="plus" />,
      disabled: !canAddRow,
      run: () => perform(() => run('insertTableRow', { index: row + 1 })),
    },
    {
      id: 'row-move-up',
      title: t('table.row.moveUp'),
      icon: <Icon name="arrow-up" />,
      disabled: !can('moveTableRow', { from: row, to: row - 1 }),
      run: () =>
        perform(() => {
          run('moveTableRow', { from: row, to: row - 1 });

          return cellAt(row - 1, 0);
        }),
    },
    {
      id: 'row-move-down',
      title: t('table.row.moveDown'),
      icon: <Icon name="arrow-down" />,
      disabled: !can('moveTableRow', { from: row, to: row + 1 }),
      run: () =>
        perform(() => {
          run('moveTableRow', { from: row, to: row + 1 });

          return cellAt(row + 1, 0);
        }),
    },
  ];

  if (row === 0) {
    actions.push({
      id: 'row-header',
      title: t('table.toggle.header'),
      icon: <Icon name="heading-1" />,
      toggle: props.header !== false,
      run: () =>
        perform(() => {
          editor.dispatch({
            type: 'setBlockProps',
            payload: { blockId: block.id, props: { header: props.header === false } },
          });

          return cellAt(0, active.column);
        }),
    });
  }

  if (row === 0) {
    actions.push({
      id: 'row-freeze',
      title: t('table.toggle.freezeRow'),
      icon: <Icon name="pin" />,
      toggle: props.freezeRow === true,
      run: () =>
        perform(() => {
          editor.dispatch({
            type: 'setBlockProps',
            payload: { blockId: block.id, props: { freezeRow: !props.freezeRow } },
          });

          return cellAt(0, active.column);
        }),
    });
  }

  actions.push({
    id: 'row-delete',
    title: t('table.row.delete'),
    icon: <Icon name="trash" />,
    danger: true,
    disabled: !can('deleteTableRow', { index: row }),
    run: () => perform(() => run('deleteTableRow', { index: row })),
  });

  return actions;
}

/** Выравнивает весь столбец одной командой движка (`alignTableCells` по диапазону столбца). */
function alignColumn(context: LineActionsContext, column: number, align: Alignment) {
  const { size, active, perform, run, cellAt } = context;

  perform(() => {
    run('alignTableCells', {
      range: { top: 0, left: column, bottom: size.rows - 1, right: column },
      align,
    });

    return cellAt(active.row, column);
  });
}

export function columnActions(
  context: LineActionsContext,
  { column }: Position,
): BlockMenuAction[] {
  const {
    editor,
    view,
    block,
    t,
    props,
    active,
    perform,
    run,
    can,
    cellAt,
    canAddColumn,
    closeMenu,
    decimal,
    startSizing,
  } = context;

  return [
    // На телефоне границу столбца под палец не поймать: ширину задаёт ползунок.
    ...(coarsePointer()
      ? [
          {
            id: 'column-width-slider',
            title: t('table.width.open'),
            icon: <Icon name="arrow-right" />,
            run: () => startSizing(column),
          } satisfies BlockMenuAction,
        ]
      : []),
    {
      id: 'column-select',
      title: t('table.column.select'),
      icon: <Icon name="select-all" />,
      run: () => {
        closeMenu();
        selectTableLine(editor, view, block.id, { column });
      },
    },
    {
      id: 'column-insert-left',
      title: t('table.column.insertLeft'),
      icon: <Icon name="plus" />,
      disabled: !canAddColumn,
      run: () => perform(() => run('insertTableColumn', { index: column })),
    },
    {
      id: 'column-insert-right',
      title: t('table.column.insertRight'),
      icon: <Icon name="plus" />,
      disabled: !canAddColumn,
      run: () => perform(() => run('insertTableColumn', { index: column + 1 })),
    },
    {
      id: 'column-move-left',
      title: t('table.column.moveLeft'),
      icon: <Icon name="arrow-left" />,
      disabled: !can('moveTableColumn', { from: column, to: column - 1 }),
      run: () =>
        perform(() => {
          run('moveTableColumn', { from: column, to: column - 1 });

          return cellAt(active.row, column - 1);
        }),
    },
    {
      id: 'column-move-right',
      title: t('table.column.moveRight'),
      icon: <Icon name="arrow-right" />,
      disabled: !can('moveTableColumn', { from: column, to: column + 1 }),
      run: () =>
        perform(() => {
          run('moveTableColumn', { from: column, to: column + 1 });

          return cellAt(active.row, column + 1);
        }),
    },
    {
      id: 'column-align-left',
      title: t('toolbar.align.left.label'),
      icon: <Icon name="align-left" />,
      run: () => alignColumn(context, column, 'left'),
    },
    {
      id: 'column-align-center',
      title: t('toolbar.align.center.label'),
      icon: <Icon name="align-center" />,
      run: () => alignColumn(context, column, 'center'),
    },
    {
      id: 'column-align-right',
      title: t('toolbar.align.right.label'),
      icon: <Icon name="align-right" />,
      run: () => alignColumn(context, column, 'right'),
    },
    ...(['text', 'number', 'date'] as const).map((type) => ({
      id: `column-type-${type}`,
      title: t(`table.column.type.${type}`),
      icon: <Icon name={(props.columnTypes?.[column] ?? 'text') === type ? 'check' : 'text'} />,
      run: () =>
        perform(() => {
          run('setTableColumnType', { index: column, type });

          return cellAt(active.row, column);
        }),
    })),
    {
      id: 'column-sort-asc',
      title: t('table.column.sortAsc'),
      icon: <Icon name="arrow-up" />,
      disabled: !can('sortTableRows', { column, direction: 'asc', decimal }),
      run: () => perform(() => void run('sortTableRows', { column, direction: 'asc', decimal })),
    },
    {
      id: 'column-sort-desc',
      title: t('table.column.sortDesc'),
      icon: <Icon name="arrow-down" />,
      disabled: !can('sortTableRows', { column, direction: 'desc', decimal }),
      run: () => perform(() => void run('sortTableRows', { column, direction: 'desc', decimal })),
    },
    {
      id: 'column-auto-width',
      title: t('table.column.autoWidth'),
      icon: <Icon name="refresh-cw" />,
      disabled: !props.widths?.[column],
      run: () =>
        perform(() => {
          run('setTableColumnWidth', { index: column, width: null });

          return cellAt(active.row, column);
        }),
    },
    ...(column === 0
      ? [
          {
            id: 'column-freeze',
            title: t('table.toggle.freezeColumn'),
            icon: <Icon name="pin" />,
            toggle: props.freezeColumn === true,
            run: () =>
              perform(() => {
                editor.dispatch({
                  type: 'setBlockProps',
                  payload: { blockId: block.id, props: { freezeColumn: !props.freezeColumn } },
                });

                return cellAt(active.row, 0);
              }),
          },
        ]
      : []),
    {
      id: 'column-delete',
      title: t('table.column.delete'),
      icon: <Icon name="trash" />,
      danger: true,
      disabled: !can('deleteTableColumn', { index: column }),
      run: () => perform(() => run('deleteTableColumn', { index: column })),
    },
  ];
}

/** Основной указатель — палец (нет наведения и правой кнопки). */
export const coarsePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Меню столбца по группам, как меню выбора блоков: сам столбец (ширина, выделение, вставка, перенос, закрепление,
 * удаление), затем выравнивание, тип и сортировка.
 */
export function groupColumnActions(actions: BlockMenuAction[], t: TFunction): BlockMenuAction[] {
  const groupOf = (id: string) =>
    id.startsWith('column-align-')
      ? 'align'
      : id.startsWith('column-type-')
        ? 'type'
        : id.startsWith('column-sort-')
          ? 'sort'
          : 'columns';
  const order = ['columns', 'align', 'type', 'sort'];

  return actions
    .map((action, index) => ({ action, index, group: groupOf(action.id) }))
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.index - b.index)
    .map(({ action, group }) => ({
      ...action,
      group: t(`table.group.${group}` as 'table.group.align'),
    }));
}

/** Дробный разделитель языка (`Intl`): «,» у русского, немецкого, французского…, «.» у английского. */
export function decimalSeparator(locale: string): ',' | '.' {
  try {
    return (1.5).toLocaleString(locale).includes(',') ? ',' : '.';
  } catch {
    return '.';
  }
}
