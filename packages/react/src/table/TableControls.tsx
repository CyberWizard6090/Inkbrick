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

import type { Alignment, BaseBlock, TableProps } from '@inkbrick/document';
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
import type { TFunction } from '../i18n/translate';
import { Icon } from '../icons/Icon';
import { useEditorUI } from '../ui/EditorUIContext';
import { selectTableCells, selectTableLine } from './cellSelection';
import { fitWidths } from './fitWidths';
import { tableDesignPanels } from './TableDesignPanels';
import { cellsBackgroundMenu, tableFormatActions } from './tableFormatActions';

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
  /** Видимая часть сетки: при прокрутке внутри блока таблицы (широкая, закреплённая строка) она меньше сетки. */
  readonly table: Box;
  /** Вся сетка, в том числе прокрученная за край блока. */
  readonly grid: Box;
  readonly row: Box;
  readonly cell: Box;
  /** Правые края столбцов (по ячейкам первой строки). */
  readonly edges: readonly Edge[];
}

interface MenuState {
  readonly kind: 'row' | 'column' | 'table';
  readonly position: Position;
  readonly x: number;
  readonly y: number;
}

export interface TableControlsProps {
  readonly block: BaseBlock;
  readonly tableRef: RefObject<HTMLTableElement | null>;
  /** Ширина столбца, которую тянут сейчас; `null` — не тянут. Таблица рисует её, пока модель не изменилась. */
  /** Ширины всех столбцов, пока границу тянут (рисуются поверх модели); `null` — перетаскивание закончено. */
  readonly onPreview: (widths: readonly number[] | null) => void;
}

/** На сколько пикселей за краем таблицы управление остаётся доступным: с каждой стороны своё (кнопки добавления). */
const REACH = { left: 28, top: 30, right: 40, bottom: 30 } as const;

const MIN_WIDTH = 40;
/** Внешняя граница таблицы с border-collapse: один пиксель сверх ширин столбцов. */
const BORDER_PIXEL = 1;
const MAX_WIDTH = 1200;
const KEY_STEP = 10;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Верх ручки не уходит за верхний край окна: когда таблица почти у верха, ручки остаются доступны. */
const edgeTop = (top: number) => Math.max(4, top);

const prevent = (event: { preventDefault(): void }) => event.preventDefault();

function boxOf(element: Element): Box {
  const { left, top, width, height } = element.getBoundingClientRect();

  return { left, top, width, height };
}

/**
 * Сетка, обрезанная рамкой блока таблицы, который прокручивается сам: ручки строки, столбца и угла стоят у видимого
 * края, а не у края сетки, уехавшего за рамку.
 */
function visibleBox(grid: Element): Box {
  const own = grid.getBoundingClientRect();
  const frame = grid.closest('[data-inkbrick-block="table"]')?.getBoundingClientRect() ?? own;
  const left = Math.max(own.left, frame.left);
  const top = Math.max(own.top, frame.top);
  const right = Math.min(own.right, frame.right);
  const bottom = Math.min(own.bottom, frame.bottom);

  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
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

  if (!row || !cell || !first) return null;

  return {
    table: visibleBox(table),
    grid: boxOf(table),
    row: boxOf(row),
    cell: boxOf(cell),
    edges: columnEdges(table),
  };
}

const sameLayout = (a: Layout | null, b: Layout | null) =>
  a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

/**
 * Какая таблица сейчас под указателем. Ручки есть у таблицы под мышью и у таблицы с кареткой; когда мышь над другой
 * таблицей, ручки той, где стоит каретка, прячутся: иначе две соседние таблицы рисуют их друг поверх друга.
 */
let hoveredTable: string | null = null;
const hoverListeners = new Set<() => void>();

function setHoveredTable(id: string | null) {
  if (hoveredTable === id) return;

  hoveredTable = id;
  hoverListeners.forEach((listener) => listener());
}

const subscribeHovered = (listener: () => void) => {
  hoverListeners.add(listener);

  return () => void hoverListeners.delete(listener);
};

/** Расстояние от точки до прямоугольника: 0, если точка внутри. */
function distanceTo(rect: DOMRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);

  return Math.hypot(dx, dy);
}

/** Ближайшая к точке таблица документа: между двумя таблицами ручки показывает только она. */
function nearestTable(x: number, y: number): Element | null {
  let best: Element | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const element of document.querySelectorAll('[data-inkbrick-block="table"]')) {
    const distance = distanceTo(element.getBoundingClientRect(), x, y);

    if (distance < bestDistance) {
      best = element;
      bestDistance = distance;
    }
  }

  return best;
}

/** Подсказка у ручки: «Нажмите, чтобы открыть меню». Видна при наведении мыши и фокусе с клавиатуры (стили в ui.css). */
function GripTip({ t }: { t: TFunction }) {
  return (
    <>
      <span data-inkbrick-part="dots" aria-hidden="true" />
      <span data-inkbrick-part="tip" aria-hidden="true">
        <strong>{t('table.tip.click')}</strong> {t('table.tip.select')}
      </span>
    </>
  );
}

/**
 * Управление таблицей мышью: полоски у строки и столбца под курсором (меню действий), кнопки «добавить строку/столбец»
 * и ручки ширины столбцов. Рисуется поверх документа (портал в `body`, `position: fixed`), а не внутри редактируемого
 * корня: так выделение и буфер обмена не видят этих элементов. Показывается, пока над таблицей мышь или в ней каретка;
 * в режиме только чтения не показывается.
 */
export function TableControls({ block, tableRef, onPreview }: TableControlsProps) {
  const editor = useEditor();
  const view = useEditorView();
  const { slots, t, locale } = useEditorUI();
  // Дробная часть числа в языке интерфейса: по ней сортировка читает «0,125» как дробь, а не как тысячи.
  const decimal: ',' | '.' = locale.startsWith('ru') ? ',' : '.';
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
  const otherHovered = useSyncExternalStore(
    subscribeHovered,
    () => hoveredTable !== null && hoveredTable !== block.id,
    () => false,
  );
  const position = menu?.position ?? hover ?? (otherHovered ? null : caretPosition);
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
    // Ручки стоят по `position: fixed`, поэтому при прокрутке их положение пересчитывается сразу, до отрисовки кадра:
    // обычное (отложенное) обновление приходило бы на кадр позже, и ручки отставали бы от таблицы, дёргаясь.
    const follow = () => flushSync(update);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;

    observer?.observe(table);
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', update);

    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', update);
    };
  }, [tableRef, !!active]);

  // Мышь над таблицей и в зоне вокруг неё: строка и столбец под курсором. Тач — только по каретке.
  useEffect(() => {
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || frozen.current) return;

      cancelAnimationFrame(frame);

      // Указатель над самими ручками (плашка, круглый маркер на границе): активные строка и столбец не меняются. Маркер
      // лежит на границе, и без этого шаг мыши вверх по нему сразу переключал бы ручки на соседнюю строку.
      if (
        event.target instanceof Element &&
        event.target.closest('[data-inkbrick-ui="table-controls"]')
      )
        return;

      frame = requestAnimationFrame(() => {
        const table = tableRef.current;

        if (!table || frozen.current) return;

        const rect = table.getBoundingClientRect();
        const inside =
          event.clientX >= rect.left - REACH.left &&
          event.clientX <= rect.right + REACH.right &&
          event.clientY >= rect.top - REACH.top &&
          event.clientY <= rect.bottom + REACH.bottom;

        // Между двумя таблицами указатель в зоне обеих: ручки показывает та, что ближе.
        const ownBlock = table.closest('[data-inkbrick-block="table"]');
        const nearest = inside ? nearestTable(event.clientX, event.clientY) : null;

        if (!inside || (nearest && ownBlock && nearest !== ownBlock)) {
          setHover(null);
          if (hoveredTable === block.id) setHoveredTable(null);
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

        if (next) setHoveredTable(block.id);

        setHover((previous) =>
          previous?.row === next?.row && previous?.column === next?.column ? previous : next,
        );
      });
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget && !frozen.current) {
        setHover(null);
        if (hoveredTable === block.id) setHoveredTable(null);
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerout', onOut);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
    };
  }, [tableRef, block.id, editor]);

  // Меню закрывается кликом снаружи (кнопки управления сами переключают его), прокруткой страницы или таблицы (меню стоит на
  // экране, а не в документе: после прокрутки оно осталось бы висеть далеко от своей таблицы) и при пропаже таблицы.
  useEffect(() => {
    if (!menu) return;

    const onScroll = (event: Event) => {
      // Длинное меню само прокручивается: это не повод его закрывать.
      if (
        event.target instanceof Element &&
        event.target.closest('[data-inkbrick-ui="block-menu"]')
      )
        return;

      setMenu(null);
    };

    const onDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-inkbrick-ui="block-menu"], [data-inkbrick-ui="table-controls"]')
      )
        return;

      setMenu(null);
    };

    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
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

  /** Меню таблицы: форматирование таблицы целиком и фон выделенных ячеек (без выделения — всех). */
  const tableActions = (): BlockMenuAction[] =>
    tableFormatActions(editor, block, t, (action) =>
      perform(() => {
        action();

        return cellAt(active.row, active.column);
      }),
    );

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

    // Перетаскивание считается по сохранённым ширинам: отрисованные уже подогнаны под страницу, и записать их — потерять
    // пользовательские значения. Измеряются только столбцы без ширины.
    return result.map((width, index) => {
      const saved = props.widths?.[index];

      return typeof saved === 'number' && saved > 0 ? saved : width;
    });
  };

  /** Индексы столбцов, ширина которых изменилась (с округлением до пикселя). */
  const changedColumns = (before: readonly number[], after: readonly number[]): number[] =>
    after.flatMap((width, index) =>
      Math.abs(width - (before[index] ?? width)) >= 1 ? [index] : [],
    );

  /**
   * Что записывать после перетаскивания. Пока таблица помещается на страницу, отрисованные ширины — настоящие, и все
   * столбцы фиксируются как есть (таблица становится ровно своей ширины). Когда страница уже таблицы, отрисованные ширины
   * подогнаны, и записываются только изменённые столбцы: подогнанные значения в модель не попадают.
   */
  const columnsToWrite = (start: readonly number[], after: readonly number[]): number[] => {
    const changed = changedColumns(start, after);

    if (changed.length === 0) return [];

    return fitWidths(start, availableWidth()) === start ? after.map((_, index) => index) : changed;
  };

  /** Сколько места под таблицу на странице: видимая ширина самого блока таблицы (у него `max-width: 100%`). */
  const availableWidth = (): number => {
    const width =
      tableRef.current?.closest<HTMLElement>('[data-inkbrick-block="table"]')?.clientWidth ?? 0;

    // Без раскладки (скрытый блок, тестовое окружение) предела нет. Внешняя граница таблицы (border-collapse) добавляет
    // ещё пиксель сверх суммы ширин столбцов, поэтому места под столбцы на пиксель меньше.
    return width > 0 ? width - BORDER_PIXEL : Number.POSITIVE_INFINITY;
  };

  /**
   * Новые ширины при смещении правой границы столбца `column` на `delta`: у границы между столбцами меняются только два
   * соседних (сумма та же, остальные стоят), у правого края последнего столбца меняется он один, а с ним и таблица.
   */
  const resized = (start: readonly number[], column: number, delta: number): number[] => {
    const next = [...start];
    const neighbour = column + 1 < start.length ? column + 1 : -1;

    if (neighbour < 0) {
      // Таблица не шире страницы: последний столбец тянется, пока сумма ширин помещается в видимую область.
      const others = start.reduce((sum, width, index) => (index === column ? sum : sum + width), 0);
      const room = Math.floor(availableWidth()) - Math.ceil(others);
      // Растянуть дальше места нельзя, а сжать можно всегда: верхняя граница не ниже текущей ширины.
      const upper = Math.max(start[column], Math.min(MAX_WIDTH, room));

      next[column] = clamp(start[column] + delta, MIN_WIDTH, upper);

      return next;
    }

    const total = start[column] + start[neighbour];

    next[column] = clamp(start[column] + delta, MIN_WIDTH, Math.max(MIN_WIDTH, total - MIN_WIDTH));
    next[neighbour] = total - next[column];

    return next;
  };

  /**
   * Округляет ширины до целых пикселей так, чтобы их сумма осталась прежней (до целого): каждая ширина округляется вниз, а
   * недостающие пиксели отдаются столбцам с наибольшей дробной частью. Иначе таблица теряла бы по пикселю на каждый столбец.
   */
  const roundWidths = (widths: readonly number[]): number[] => {
    const floors = widths.map((width) => Math.floor(width));
    const total = Math.round(widths.reduce((sum, width) => sum + width, 0));
    let rest = total - floors.reduce((sum, width) => sum + width, 0);

    const order = widths.map((_, index) => index).sort((a, b) => (widths[b] % 1) - (widths[a] % 1));

    for (const index of order) {
      if (rest <= 0) break;

      floors[index] += 1;
      rest -= 1;
    }

    return floors;
  };

  /** Записывает ширины только изменённых столбцов одним шагом истории: остальные остаются как были в модели. */
  const writeWidths = (widths: readonly number[], indexes: readonly number[]) =>
    editor.batch(() => {
      // Сумма округлённых ширин совпадает с суммой настоящих: таблица не сужается и не выходит за блок.
      const rounded = roundWidths(widths);

      for (const index of indexes)
        run('setTableColumnWidth', { index, width: rounded[index] ?? 0 });
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

      const indexes = columnsToWrite(start, widths);

      // Предпросмотр снимается вместе с записью в модель: таблица не дёргается между двумя отрисовками.
      flushSync(() => {
        if (indexes.length > 0) {
          editor.sealHistory();
          writeWidths(widths, indexes);
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
    const start = widthsNow();
    const next = resized(start, column, step);
    const indexes = columnsToWrite(start, next);

    // Фокус остаётся на ручке: иначе следующая стрелка уже уходила бы в документ.
    if (indexes.length === 0) return;

    editor.sealHistory();
    flushSync(() => {
      writeWidths(next, indexes);
    });
  };

  const { table, row, cell, edges } = layout;
  // Угловая ручка стоит справа от таблицы, но не правее окна.
  const cornerLeft = Math.min(table.left + table.width + 6, window.innerWidth - 24);
  // Палец: плашки крупнее (см. ui.css), а маркеры вставки (18 px вместо 10) остаются на одной оси с ними:
  // у строки — по горизонтали, у столбца — по вертикали. Плашка столбца отступает от маркеров по краям ячейки.
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const gripInset = coarse ? 12 : 6;
  const rowInsertGap = coarse ? 15 : 19;
  const columnInsertRise = coarse ? 17 : 20;
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
        data-inkbrick-part="table-grip"
        aria-label={t('table.handle')}
        // Меню таблицы открыто: подсказка над ручкой не показывается поверх него.
        data-open={menu?.kind === 'table' || undefined}
        style={{ left: cornerLeft, top: edgeTop(table.top - 22) }}
        // Нажатие выделяет все ячейки, меню таблицы — правая кнопка (или клавиша меню с клавиатуры).
        onClick={() => {
          setMenu(null);
          selectTableCells(
            editor,
            view,
            block.id,
            { row: 0, column: 0 },
            { row: Math.max(0, size.rows - 1), column: Math.max(0, size.columns - 1) },
          );
          rootFocus();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          open('table', table.left + table.width - 8, table.top + 4);
        }}
      >
        <GripTip t={t} />
      </button>
      <button
        {...control}
        type="button"
        data-inkbrick-part="row-grip"
        aria-label={t('table.rowHandle', { row: active.row + 1 })}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'row'}
        style={{
          // Прокрутка таблицы в сторону уводит её левый край за экран: плашка строки остаётся у края окна.
          left: Math.max(2, table.left - 20),
          top: row.top + 6,
          height: Math.max(16, row.height - 12),
        }}
        onClick={() => open('row', table.left + 8, row.top + row.height / 2 + 14)}
      >
        <span data-inkbrick-part="dots" aria-hidden="true" />
      </button>
      <button
        {...control}
        type="button"
        data-inkbrick-part="row-insert"
        data-edge="start"
        aria-label={t('table.row.insertAbove')}
        title={t('table.row.insertAbove')}
        disabled={!canAddRow}
        style={{ left: Math.max(2, table.left - rowInsertGap), top: row.top - 5 }}
        onClick={() => perform(() => run('insertTableRow', { index: active.row }))}
      />
      <button
        {...control}
        type="button"
        data-inkbrick-part="row-insert"
        data-edge="end"
        aria-label={t('table.row.insertBelow')}
        title={t('table.row.insertBelow')}
        disabled={!canAddRow}
        style={{ left: Math.max(2, table.left - rowInsertGap), top: row.top + row.height - 5 }}
        onClick={() => perform(() => run('insertTableRow', { index: active.row + 1 }))}
      />
      <button
        {...control}
        type="button"
        data-inkbrick-part="column-grip"
        aria-label={t('table.columnHandle', { column: active.column + 1 })}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'column'}
        style={{
          left: cell.left + gripInset,
          top: edgeTop(table.top - 22),
          // Угловая ручка может прижиматься к правому краю окна: плашка столбца не заходит на неё.
          width: Math.max(
            14,
            Math.min(cell.width - 2 * gripInset, cornerLeft - 6 - (cell.left + gripInset)),
          ),
        }}
        onClick={() => open('column', cell.left + 6, table.top + 10)}
      >
        <span data-inkbrick-part="dots" aria-hidden="true" />
      </button>
      <button
        {...control}
        type="button"
        data-inkbrick-part="column-insert"
        data-edge="start"
        aria-label={t('table.column.insertLeft')}
        title={t('table.column.insertLeft')}
        disabled={!canAddColumn}
        style={{ left: cell.left - 5, top: edgeTop(table.top - columnInsertRise) }}
        onClick={() => perform(() => run('insertTableColumn', { index: active.column }))}
      />
      <button
        {...control}
        type="button"
        data-inkbrick-part="column-insert"
        data-edge="end"
        aria-label={t('table.column.insertRight')}
        title={t('table.column.insertRight')}
        disabled={!canAddColumn}
        style={{ left: cell.left + cell.width - 5, top: edgeTop(table.top - columnInsertRise) }}
        onClick={() => perform(() => run('insertTableColumn', { index: active.column + 1 }))}
      />
      {edges.map((edge, column) => (
        <div
          {...control}
          key={column}
          role="separator"
          aria-orientation="vertical"
          // Фокусируемому разделителю нужно текущее значение: ширина столбца по раскладке.
          aria-valuenow={Math.round(
            edge.x - (column === 0 ? layout.grid.left : edges[column - 1].x),
          )}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
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
      ))}
      {menu && (
        <Menu
          block={block}
          position={{ x: menu.x, y: menu.y }}
          actions={
            menu.kind === 'row'
              ? rowActions(menu.position)
              : menu.kind === 'column'
                ? columnActions(menu.position)
                : tableActions()
          }
          background={
            menu.kind === 'table'
              ? cellsBackgroundMenu(editor, block, view.cells.get(), (action) =>
                  perform(() => {
                    action();
                  }),
                )
              : undefined
          }
          panels={
            menu.kind === 'table'
              ? // Толщина, начертание, цвет линий и стиль меняются при открытом меню: результат виден сразу. Кнопка
                // расположения линий (все, внешние, нет…) — разовое действие: после неё меню закрывается.
                tableDesignPanels(
                  editor,
                  block,
                  t,
                  view.cells.get(),
                  (action) => {
                    editor.sealHistory();
                    flushSync(() => {
                      action();
                    });
                  },
                  () => {
                    setMenu(null);
                    rootFocus();
                  },
                )
              : undefined
          }
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
