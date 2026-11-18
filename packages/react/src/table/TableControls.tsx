import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal, flushSync } from 'react-dom';

import type { Alignment, BaseBlock, TableProps, TableView } from '@inkbrick/document';
import {
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  locateTableCell,
  tableCellAt,
  tableSize,
  type CaretResult,
} from '@inkbrick/engine';

import type { BlockMenuAction } from '../block-handle/types';
import { DefaultBlockMenu } from '../block-handle/DefaultBlockMenu';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { PortalPresence } from '../ui/Presence';
import { ColumnPropertiesDialog } from './ColumnPropertiesDialog';
import { canUpdateView, newViewId, setAt, updateView, updateViews } from './views';
import { Icon } from '../icons/Icon';
import { useEditorUI } from '../ui/EditorUIContext';
import { selectTableLine } from './cellSelection';

interface Position {
  readonly row: number;
  readonly column: number;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface Layout {
  readonly table: Box;
  readonly row: Box;
  readonly cell: Box;
  /** Правые края столбцов (по ячейкам первой строки). */
  readonly edges: readonly Edge[];
}

interface MenuState {
  readonly kind: 'row' | 'column';
  readonly position: Position;
  readonly x: number;
  readonly y: number;
}

export interface TableControlsProps {
  readonly block: BaseBlock;
  /** Открытый вид: «Скрыть столбец», сортировка вида и фильтры относятся к нему. */
  readonly activeView: TableView;
  readonly onSelectView: (id: string) => void;
  readonly tableRef: RefObject<HTMLTableElement | null>;
  /** Ширина столбца, которую тянут сейчас; `null` — не тянут. Таблица рисует её, пока модель не изменилась. */
  /** Ширины всех столбцов, пока границу тянут (рисуются поверх модели); `null` — перетаскивание закончено. */
  readonly onPreview: (widths: readonly number[] | null) => void;
}

/** На сколько пикселей за краем таблицы управление остаётся доступным: с каждой стороны своё (кнопки добавления). */
const REACH = { left: 24, top: 14, right: 40, bottom: 30 } as const;

const MIN_WIDTH = 40;
const MAX_WIDTH = 1200;
const KEY_STEP = 10;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Сортировка вида по столбцу: по возрастанию, по убыванию, снять. */
const nextSort = (view: TableView, column: number): TableView => {
  const current = view.sort;

  if (!current || current.column !== column) return { ...view, sort: { column, direction: 'asc' } };
  if (current.direction === 'asc') return { ...view, sort: { column, direction: 'desc' } };

  const { sort: _sort, ...rest } = view;

  return rest;
};

const prevent = (event: { preventDefault(): void }) => event.preventDefault();

function boxOf(element: Element): Box {
  const { left, top, width, height } = element.getBoundingClientRect();

  return { left, top, width, height };
}

interface Edge {
  readonly x: number;
  readonly top: number;
  readonly height: number;
}

/**
 * Правые границы столбцов и участок, где граница настоящая. Скрытые (перекрытые) ячейки остаются в `row.cells`, поэтому
 * номер ячейки — это столбец; объединённая ячейка даёт границу только своего последнего столбца. Участок — самая длинная
 * непрерывная цепочка строк с такой границей: ручка не лежит поверх текста объединённых ячеек.
 */
function columnEdges(table: HTMLTableElement): Edge[] {
  const columns = table.rows[0]?.cells.length ?? 0;
  const found: { x: number; top: number; bottom: number }[][] = Array.from(
    { length: columns },
    () => [],
  );

  for (const row of Array.from(table.rows)) {
    if (row.hidden) continue;

    Array.from(row.cells).forEach((cell, index) => {
      const last = index + Math.max(1, cell.colSpan) - 1;

      if (cell.hidden || last >= columns) return;

      const { right, top, bottom } = cell.getBoundingClientRect();

      found[last].push({ x: right, top, bottom });
    });
  }

  const bounds = table.getBoundingClientRect();
  let previous = bounds.left;

  return found.map((segments) => {
    const runs: { x: number; top: number; bottom: number }[] = [];

    for (const segment of segments.sort((a, b) => a.top - b.top)) {
      const run = runs[runs.length - 1];

      if (run && segment.top - run.bottom <= 2) run.bottom = Math.max(run.bottom, segment.bottom);
      else runs.push({ ...segment });
    }

    const best = runs.sort((a, b) => b.bottom - b.top - (a.bottom - a.top))[0];

    previous = best?.x ?? previous;

    return best
      ? { x: best.x, top: best.top, height: best.bottom - best.top }
      : { x: previous, top: bounds.top, height: bounds.height };
  });
}

function measure(table: HTMLTableElement, position: Position): Layout | null {
  const row = table.rows[position.row];
  const cell = row?.cells[position.column];
  const first = table.rows[0];

  // Скрытая строка или столбец (фильтр, скрытие столбца) не измеряются: управлять нечем.
  if (!row || !cell || !first || row.hidden || cell.hidden) return null;

  return {
    table: boxOf(table),
    row: boxOf(row),
    cell: boxOf(cell),
    edges: columnEdges(table),
  };
}

const sameLayout = (a: Layout | null, b: Layout | null) =>
  a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

/**
 * Управление таблицей мышью: полоски у строки и столбца под курсором (меню действий), кнопки «добавить строку/столбец»
 * и ручки ширины столбцов. Рисуется поверх документа (портал в `body`, `position: fixed`), а не внутри редактируемого
 * корня: так выделение и буфер обмена не видят этих элементов. Показывается, пока над таблицей мышь или в ней каретка;
 * в режиме только чтения не показывается.
 *
 * Окно свойств столбца живёт здесь, а не в самих элементах управления: когда фокус уходит в окно, каретка покидает
 * таблицу и они скрываются, а окно должно остаться.
 */
export function TableControls(props: TableControlsProps) {
  const [propertiesOf, setPropertiesOf] = useState<number | null>(null);
  const view = useEditorView();

  return (
    <>
      <TableControlsLayer {...props} onProperties={setPropertiesOf} />
      <PortalPresence
        open={propertiesOf !== null}
        render={() => (
          <ColumnPropertiesDialog
            block={props.block}
            view={props.activeView}
            column={propertiesOf!}
            onClose={() => {
              setPropertiesOf(null);
              view.getRoot()?.focus({ preventScroll: true });
            }}
          />
        )}
      />
    </>
  );
}

function TableControlsLayer({
  block,
  tableRef,
  activeView,
  onSelectView,
  onPreview,
  onProperties,
}: TableControlsProps & { readonly onProperties: (column: number) => void }) {
  const editor = useEditor();
  const view = useEditorView();
  const { slots, t } = useEditorUI();
  const [hover, setHover] = useState<Position | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [, refresh] = useState(0);
  const frozen = useRef(false);

  const getBlock = (id: string) => editor.store.getBlock(id);
  const props = block.props as TableProps;
  const size = tableSize(getBlock, block.id) ?? { rows: 0, columns: 0 };

  // Ячейка этой таблицы с кареткой: строкой, чтобы подписка перерисовывала компонент, только когда она сменилась.
  const caret = useSyncExternalStore(
    view.caret.subscribe,
    () => {
      const id = view.caret.current;
      const found = id ? locateTableCell(getBlock, id) : undefined;

      return found?.tableId === block.id ? `${found.row}:${found.column}` : '';
    },
    () => '',
  );
  const caretPosition: Position | null = caret
    ? { row: Number(caret.split(':')[0]), column: Number(caret.split(':')[1]) }
    : null;
  const position = menu?.position ?? hover ?? caretPosition;
  const active =
    position && position.row < size.rows && position.column < size.columns ? position : null;

  frozen.current = menu !== null;

  // Положение элементов берётся из раскладки после каждой отрисовки; размер таблицы и прокрутка вызывают её заново.
  useLayoutEffect(() => {
    const table = tableRef.current;
    const next = table && active ? measure(table, active) : null;

    setLayout((previous) => (sameLayout(previous, next) ? previous : next));
  });

  useEffect(() => {
    const table = tableRef.current;

    if (!table || !active) return;

    const update = () => refresh((n) => n + 1);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;

    observer?.observe(table);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [tableRef, !!active]);

  // Мышь над таблицей и в зоне вокруг неё: строка и столбец под курсором. Тач — только по каретке.
  useEffect(() => {
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || frozen.current) return;

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const table = tableRef.current;

        if (!table || frozen.current) return;

        const rect = table.getBoundingClientRect();
        const inside =
          event.clientX >= rect.left - REACH.left &&
          event.clientX <= rect.right + REACH.right &&
          event.clientY >= rect.top - REACH.top &&
          event.clientY <= rect.bottom + REACH.bottom;

        if (!inside) {
          setHover(null);
          return;
        }

        // Ячейка под точкой, прижатой к таблице: так строка и столбец находятся и у полосок за её краем.
        const x = clamp(event.clientX, rect.left + 2, rect.right - 2);
        const y = clamp(event.clientY, rect.top + 2, rect.bottom - 2);
        const cell = document
          .elementsFromPoint(x, y)
          .find((element) => element.matches('[data-inkbrick-block="table-cell"]'));
        const id = cell?.getAttribute('data-block-id');
        const found = id ? locateTableCell(getBlock, id) : undefined;
        const next = found?.tableId === block.id ? { row: found.row, column: found.column } : null;

        setHover((previous) =>
          previous?.row === next?.row && previous?.column === next?.column ? previous : next,
        );
      });
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget && !frozen.current) setHover(null);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerout', onOut);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
    };
  }, [tableRef, block.id, editor]);

  // Меню закрывается кликом снаружи (кнопки управления сами переключают его) и при пропаже таблицы.
  useEffect(() => {
    if (!menu) return;

    const onDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-inkbrick-ui="block-menu"], [data-inkbrick-ui="table-controls"]')
      )
        return;

      setMenu(null);
    };

    document.addEventListener('pointerdown', onDown, true);

    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [menu]);

  if (typeof document === 'undefined' || !active || !layout) return null;

  const rootFocus = () => view.getRoot()?.focus({ preventScroll: true });

  /** Действие над таблицей: один шаг undo, каретка — в ячейку, которую вернула команда (или остаётся в документе). */
  const perform = (action: () => CaretResult | undefined | void) => {
    let result: CaretResult | undefined | void;

    editor.sealHistory();
    flushSync(() => {
      result = action();
    });
    setMenu(null);

    if (result && view.getElement(result.blockId)) view.placeCaret(result.blockId, result.offset);
    else rootFocus();
  };

  const run = (type: string, payload: Record<string, unknown>) =>
    editor.dispatch({ type, payload: { blockId: block.id, ...payload } } as never) as
      CaretResult | undefined;
  const can = (type: string, payload: Record<string, unknown>) =>
    editor.can(type, { blockId: block.id, ...payload });
  const cellAt = (row: number, column: number): CaretResult => ({
    blockId: tableCellAt(getBlock, block.id, row, column)!,
    offset: 0,
  });

  const canAddRow = size.rows * Math.max(size.columns, 1) + size.columns <= MAX_TABLE_CELLS;
  const canAddColumn =
    size.columns < MAX_TABLE_COLUMNS && size.rows * (size.columns + 1) <= MAX_TABLE_CELLS;

  const rowActions = ({ row }: Position): BlockMenuAction[] => {
    const actions: BlockMenuAction[] = [
      {
        id: 'row-select',
        title: t('table.row.select'),
        icon: <Icon name="select-all" />,
        run: () => {
          setMenu(null);
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
        title: t(props.header === false ? 'table.row.headerOn' : 'table.row.headerOff'),
        icon: <Icon name="heading-1" />,
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
        title: t(props.freezeRow ? 'table.row.freezeOff' : 'table.row.freezeOn'),
        icon: <Icon name="pin" />,
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
  };

  const alignColumn = (column: number, align: Alignment) =>
    perform(() => {
      editor.batch(() => {
        for (let row = 0; row < size.rows; row++) {
          const point = { blockId: cellAt(row, column).blockId, offset: 0 };

          editor.dispatch({ type: 'setAlign', payload: { from: point, to: point, align } });
        }
      });

      return cellAt(active.row, column);
    });

  const columnActions = ({ column }: Position): BlockMenuAction[] => [
    {
      id: 'column-select',
      title: t('table.column.select'),
      icon: <Icon name="select-all" />,
      run: () => {
        setMenu(null);
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
      title: t('table.column.alignLeft'),
      icon: <Icon name="align-left" />,
      run: () => alignColumn(column, 'left'),
    },
    {
      id: 'column-align-center',
      title: t('table.column.alignCenter'),
      icon: <Icon name="align-center" />,
      run: () => alignColumn(column, 'center'),
    },
    {
      id: 'column-align-right',
      title: t('table.column.alignRight'),
      icon: <Icon name="align-right" />,
      run: () => alignColumn(column, 'right'),
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
      id: 'column-properties',
      title: t('table.column.properties'),
      icon: <Icon name="columns" />,
      run: () => {
        setMenu(null);
        onProperties(column);
      },
    },
    {
      id: 'column-hide',
      title: t('table.column.hide'),
      icon: <Icon name="x" />,
      disabled: !canUpdateView(editor, block, activeView.id, (view) => ({
        ...view,
        hidden: setAt(view.hidden, column, true, false),
      })),
      run: () =>
        perform(
          () =>
            void updateView(editor, block, activeView.id, (view) => ({
              ...view,
              hidden: setAt(view.hidden, column, true, false),
            })),
        ),
    },
    {
      id: 'column-view-sort',
      title: t(
        activeView.sort?.column !== column
          ? 'table.column.viewSortAsc'
          : activeView.sort.direction === 'asc'
            ? 'table.column.viewSortDesc'
            : 'table.column.viewSortOff',
      ),
      icon: <Icon name={activeView.sort?.column === column ? 'arrow-down' : 'arrow-up'} />,
      disabled: !canUpdateView(editor, block, activeView.id, (view) => nextSort(view, column)),
      run: () =>
        perform(
          () => void updateView(editor, block, activeView.id, (view) => nextSort(view, column)),
        ),
    },
    {
      id: 'view-add',
      title: t('table.view.add'),
      icon: <Icon name="plus" />,
      run: () =>
        perform(() => {
          const id = newViewId();

          if (updateViews(editor, block, (views) => [...views, { id }])) onSelectView(id);
        }),
    },
    {
      id: 'column-sort-asc',
      title: t('table.column.sortAsc'),
      icon: <Icon name="arrow-up" />,
      disabled: !can('sortTableRows', { column, direction: 'asc' }),
      run: () => perform(() => void run('sortTableRows', { column, direction: 'asc' })),
    },
    {
      id: 'column-sort-desc',
      title: t('table.column.sortDesc'),
      icon: <Icon name="arrow-down" />,
      disabled: !can('sortTableRows', { column, direction: 'desc' }),
      run: () => perform(() => void run('sortTableRows', { column, direction: 'desc' })),
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
            title: t(props.freezeColumn ? 'table.column.freezeOff' : 'table.column.freezeOn'),
            icon: <Icon name="pin" />,
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

  const open = (kind: MenuState['kind'], x: number, y: number) =>
    setMenu((current) =>
      current?.kind === kind &&
      current.position.row === active.row &&
      current.position.column === active.column
        ? null
        : { kind, position: active, x, y },
    );

  /**
   * Ширины всех столбцов в пикселях, как они сейчас на экране (по первой строке; объединённая ячейка делится поровну
   * между своими столбцами, скрытая берёт долю той, что её накрывает).
   */
  const widthsNow = (): number[] => {
    const cells = [...(tableRef.current?.rows[0]?.cells ?? [])];
    const result: number[] = [];
    let share = MIN_WIDTH;
    let left = 0;

    for (const cell of cells) {
      if (!cell.hidden) {
        left = Math.max(1, cell.colSpan);
        share = cell.getBoundingClientRect().width / left || MIN_WIDTH;
      }

      result.push(left > 0 ? share : MIN_WIDTH);
      left -= 1;
    }

    return result;
  };

  /**
   * Новые ширины при смещении правой границы столбца `column` на `delta`: у границы между столбцами меняются только два
   * соседних (сумма та же, остальные стоят), у правого края последнего столбца меняется он один, а с ним и таблица.
   */
  const resized = (start: readonly number[], column: number, delta: number): number[] => {
    const next = [...start];
    const neighbour = column + 1 < start.length ? column + 1 : -1;

    if (neighbour < 0) {
      next[column] = clamp(start[column] + delta, MIN_WIDTH, MAX_WIDTH);

      return next;
    }

    const total = start[column] + start[neighbour];

    next[column] = clamp(start[column] + delta, MIN_WIDTH, Math.max(MIN_WIDTH, total - MIN_WIDTH));
    next[neighbour] = total - next[column];

    return next;
  };

  /** Записывает все ширины одним шагом истории: столбцы, которых не тянули, фиксируются как есть. */
  const writeWidths = (widths: readonly number[]) =>
    editor.batch(() => {
      widths.forEach((width, index) =>
        run('setTableColumnWidth', { index, width: Math.round(width) }),
      );
    });

  const resize = (column: number, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const start = widthsNow();
    let widths = start;
    let frame = 0;

    frozen.current = true;

    const move = (moved: PointerEvent) => {
      widths = resized(start, column, moved.clientX - startX);

      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        onPreview(widths);
      });
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      frozen.current = false;

      const changed = widths.some((width, index) => Math.abs(width - start[index]) >= 1);

      // Предпросмотр снимается вместе с записью в модель: таблица не дёргается между двумя отрисовками.
      flushSync(() => {
        if (changed) {
          editor.sealHistory();
          writeWidths(widths);
        }

        onPreview(null);
      });
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  };

  const resizeByKey = (column: number, event: ReactKeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowLeft' ? -KEY_STEP : event.key === 'ArrowRight' ? KEY_STEP : 0;

    if (step === 0) return;

    event.preventDefault();
    perform(() => writeWidths(resized(widthsNow(), column, step)));
  };

  const { table, row, cell, edges } = layout;
  const Menu = slots.BlockMenu ?? DefaultBlockMenu;
  const control = {
    'data-inkbrick-ui': 'table-controls',
    'data-inkbrick-block-ui': '',
    onMouseDown: prevent,
  } as const;

  return createPortal(
    <>
      <button
        {...control}
        type="button"
        data-inkbrick-part="row-grip"
        aria-label={t('table.rowHandle', { row: active.row + 1 })}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'row'}
        style={{ left: table.left - 4, top: row.top + row.height / 2 - 12 }}
        onClick={() => open('row', table.left + 8, row.top + row.height / 2 + 14)}
      />
      <button
        {...control}
        type="button"
        data-inkbrick-part="column-grip"
        aria-label={t('table.columnHandle', { column: active.column + 1 })}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'column'}
        style={{ left: cell.left + cell.width / 2 - 12, top: table.top - 4 }}
        onClick={() => open('column', cell.left + cell.width / 2 - 12, table.top + 10)}
      />
      <button
        {...control}
        type="button"
        data-inkbrick-part="add-column"
        aria-label={t('table.addColumn')}
        title={t('table.addColumn')}
        disabled={!canAddColumn}
        style={{ left: table.left + table.width + 6, top: table.top + table.height / 2 - 10 }}
        onClick={() => perform(() => run('insertTableColumn', { index: size.columns }))}
      >
        <Icon name="plus" />
      </button>
      <button
        {...control}
        type="button"
        data-inkbrick-part="add-row"
        aria-label={t('table.addRow')}
        title={t('table.addRow')}
        disabled={!canAddRow}
        style={{ left: table.left + table.width / 2 - 10, top: table.top + table.height + 4 }}
        onClick={() => perform(() => run('insertTableRow', { index: size.rows }))}
      >
        <Icon name="plus" />
      </button>
      {edges.map((edge, column) =>
        activeView.hidden?.[column] ? null : (
          <div
            {...control}
            key={column}
            role="separator"
            aria-orientation="vertical"
            aria-label={t('table.resize', { column: column + 1 })}
            tabIndex={0}
            data-inkbrick-part="resize"
            style={{ left: edge.x - 3, top: edge.top, height: edge.height }}
            onPointerDown={(event) => resize(column, event)}
            onKeyDown={(event) => resizeByKey(column, event)}
            onDoubleClick={() => {
              if (
                can('setTableColumnWidth', { index: column, width: null }) &&
                props.widths?.[column]
              )
                perform(() => {
                  run('setTableColumnWidth', { index: column, width: null });
                });
            }}
          />
        ),
      )}
      {menu && (
        <Menu
          block={block}
          position={{ x: menu.x, y: menu.y }}
          actions={menu.kind === 'row' ? rowActions(menu.position) : columnActions(menu.position)}
          turnInto={[]}
          onClose={() => {
            setMenu(null);
            rootFocus();
          }}
        />
      )}
    </>,
    document.body,
  );
}
