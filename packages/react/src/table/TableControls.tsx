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
  type TableRange,
} from '@inkbrick/engine';

import type { BlockMenuAction } from '../block-handle/types';
import { DefaultBlockMenu } from '../block-handle/DefaultBlockMenu';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { Icon } from '../icons/Icon';
import type { TFunction } from '../i18n/translate';
import { useEditorUI } from '../ui/EditorUIContext';
import { PortalPresence } from '../ui/Presence';
import { selectTableCells, selectTableLine } from './cellSelection';
import { ColumnWidthBar } from './ColumnWidthBar';
import { fitWidths } from './fitWidths';

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
  /** Все участки границ столбцов: у объединённых ячеек граница лежит кусками, и у каждого куска своя ручка. */
  readonly segments: readonly (Edge & { column: number })[];
  /** Рамка выделения (телефон): прямоугольник выделенных ячеек, а без выделения — ячейка с кареткой. */
  readonly frame: Box;
}

interface MenuState {
  readonly kind: 'row' | 'column';
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
/** Насколько выше и левее точки рамки берётся ячейка под пальцем (палец закрывает саму точку). */
const KNOB_REACH = 14;
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
function columnEdges(table: HTMLTableElement): {
  edges: Edge[];
  segments: (Edge & { column: number })[];
} {
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
  const all: (Edge & { column: number })[] = [];
  let previous = bounds.left;

  const edges = found.map((segments, column) => {
    const runs: { x: number; top: number; bottom: number }[] = [];

    for (const segment of segments.sort((a, b) => a.top - b.top)) {
      const run = runs[runs.length - 1];

      if (run && segment.top - run.bottom <= 2) run.bottom = Math.max(run.bottom, segment.bottom);
      else runs.push({ ...segment });
    }

    const best = [...runs].sort((a, b) => b.bottom - b.top - (a.bottom - a.top))[0];

    previous = best?.x ?? previous;

    const edge = best
      ? { x: best.x, top: best.top, height: best.bottom - best.top }
      : { x: previous, top: bounds.top, height: bounds.height };

    // Ручка на каждом участке границы: объединение внизу не должно оставлять без ручки верхние строки. У столбца всегда
    // есть хотя бы одна: основная, даже если все участки короче порога.
    const long = runs.filter((run) => run.bottom - run.top >= MIN_SEGMENT);

    if (long.length === 0) all.push({ column, ...edge });
    else
      for (const run of long)
        all.push({ column, x: run.x, top: run.top, height: run.bottom - run.top });

    return edge;
  });

  return { edges, segments: all };
}

/** Участок границы короче этого не получает ручки: под палец он слишком мал. */
const MIN_SEGMENT = 16;

/**
 * Прямоугольник выделенных ячеек: хватает ячеек по периметру диапазона (скрытые ячейки объединений пропускаются, а их
 * видимая верхняя левая ячейка занимает всю площадь объединения).
 */
function rangeBox(table: HTMLTableElement, range: TableRange): Box | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const add = (cell: HTMLTableCellElement | undefined) => {
    if (!cell || cell.hidden) return;

    const box = cell.getBoundingClientRect();

    if (box.width === 0) return;

    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  };

  for (let column = range.left; column <= range.right; column++) {
    add(table.rows[range.top]?.cells[column]);
    add(table.rows[range.bottom]?.cells[column]);
  }

  for (let row = range.top; row <= range.bottom; row++) {
    add(table.rows[row]?.cells[range.left]);
    add(table.rows[row]?.cells[range.right]);
  }

  return Number.isFinite(left) ? { left, top, width: right - left, height: bottom - top } : null;
}

function measure(table: HTMLTableElement, position: Position, range?: TableRange): Layout | null {
  const row = table.rows[position.row];
  const cell = row?.cells[position.column];
  const first = table.rows[0];

  if (!row || !cell || !first) return null;

  return {
    table: visibleBox(table),
    grid: boxOf(table),
    row: boxOf(row),
    cell: boxOf(cell),
    ...columnEdges(table),
    frame: (range && rangeBox(table, range)) || boxOf(cell),
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

/** Дробный разделитель языка (`Intl`): «,» у русского, немецкого, французского…, «.» у английского. */
function decimalSeparator(locale: string): ',' | '.' {
  try {
    return (1.5).toLocaleString(locale).includes(',') ? ',' : '.';
  } catch {
    return '.';
  }
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
  const decimal = decimalSeparator(locale);
  const [hover, setHover] = useState<Position | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Панель ширины столбца (телефон): ползунок вместо тонкой границы под палец.
  const [sizing, setSizing] = useState<{
    column: number;
    position: Position;
    value: number;
  } | null>(null);
  const sizingBase = useRef<number[]>([]);
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
  // Выделенные ячейки этой таблицы: рамка с точкой (телефон) обводит их и позволяет расширить протяжкой.
  const picked = useSyncExternalStore(
    view.cells.subscribe,
    () => {
      const current = view.cells.get();

      return current?.tableId === block.id ? current : null;
    },
    () => null,
  );
  const otherHovered = useSyncExternalStore(
    subscribeHovered,
    () => hoveredTable !== null && hoveredTable !== block.id,
    () => false,
  );
  // Выделенные ячейки без каретки (долгое нажатие): рамка и точка стоят у головы выделения.
  const pickedPosition: Position | null = picked
    ? { row: picked.head.row, column: picked.head.column }
    : null;
  const position =
    menu?.position ??
    sizing?.position ??
    hover ??
    pickedPosition ??
    (otherHovered ? null : caretPosition);
  const active =
    position && position.row < size.rows && position.column < size.columns ? position : null;

  frozen.current = menu !== null || sizing !== null;

  // Положение элементов берётся из раскладки после каждой отрисовки; размер таблицы и прокрутка вызывают её заново.
  useLayoutEffect(() => {
    const table = tableRef.current;
    const next = table && active ? measure(table, active, picked?.range) : null;

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
    // Ширина столбца меняется, а таблица остаётся прежнего размера (сумма та же, меняются два соседних столбца): плашки
    // и маркеры следили бы за размером таблицы и отставали. Поэтому смотрим и за ячейками первой строки.
    for (const cell of table.rows[0]?.cells ?? []) observer?.observe(cell);
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', update);

    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', update);
    };
  }, [tableRef, !!active, size.columns]);

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
      // Затемнение листа закрывает меню само, по клику: закрой его меню здесь, затемнение уже не ловило бы
      // нажатие мыши, которое браузер шлёт после касания, и оно ставило бы курсор в документ под ним.
      if (
        event.target instanceof Element &&
        event.target.closest(
          '[data-inkbrick-ui="block-menu"], [data-inkbrick-ui="table-controls"], [data-inkbrick-part="sheet-backdrop"]',
        )
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

  if (typeof document === 'undefined') return null;

  // Ручек нет (каретка ушла из таблицы), а меню ещё уходит: его `PortalPresence` стоит на том же месте, что и в полной
  // отрисовке ниже, и доигрывает анимацию закрытия, а не пропадает вместе с ручками.
  if (!active || !layout)
    return (
      <>
        {null}
        <PortalPresence open={false} render={() => null} />
      </>
    );

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
      title: t('toolbar.align.left.label'),
      icon: <Icon name="align-left" />,
      run: () => alignColumn(column, 'left'),
    },
    {
      id: 'column-align-center',
      title: t('toolbar.align.center.label'),
      icon: <Icon name="align-center" />,
      run: () => alignColumn(column, 'center'),
    },
    {
      id: 'column-align-right',
      title: t('toolbar.align.right.label'),
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

  /** Меню таблицы: форматирование таблицы целиком и фон выделенных ячеек (без выделения — всех). */
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

  /** Пределы ползунка: как далеко можно сдвинуть правую границу столбца, пока соседи не уже минимума. */
  const widthRange = (start: readonly number[], column: number) => {
    const neighbour = column + 1 < start.length ? column + 1 : -1;

    if (neighbour >= 0)
      return { min: MIN_WIDTH, max: start[column] + start[neighbour] - MIN_WIDTH };

    const others = start.reduce((sum, width, index) => (index === column ? sum : sum + width), 0);

    return {
      min: MIN_WIDTH,
      max: Math.max(
        start[column],
        Math.min(MAX_WIDTH, Math.floor(availableWidth()) - Math.ceil(others)),
      ),
    };
  };

  const startSizing = (column: number) => {
    const base = widthsNow();

    sizingBase.current = base;
    setMenu(null);
    setSizing({ column, position: active, value: base[column] ?? MIN_WIDTH });
  };

  const stopSizing = () => {
    onPreview(null);
    setSizing(null);
  };

  /** Ползунок ведёт столбец вживую (предпросмотр, документ не меняется). */
  const slideWidth = (width: number) => {
    if (!sizing) return;

    const base = sizingBase.current;
    const next = resized(base, sizing.column, width - base[sizing.column]);

    onPreview(next);
    setSizing({ ...sizing, value: next[sizing.column] });
  };

  /** Палец отпущен или нажата кнопка «−» / «+»: ширина записывается одним шагом отмены. */
  const commitWidth = (width: number) => {
    if (!sizing) return;

    const base = sizingBase.current;
    const next = resized(base, sizing.column, width - base[sizing.column]);
    const indexes = columnsToWrite(base, next);

    flushSync(() => {
      if (indexes.length > 0) {
        editor.sealHistory();
        writeWidths(next, indexes);
      }

      onPreview(null);
    });

    // Записанные ширины (целые): следующая подвижка считается от них, а не от раскладки, которая ещё не обновилась.
    sizingBase.current = roundWidths(next);
    setSizing({ ...sizing, value: sizingBase.current[sizing.column] ?? width });
  };

  const fitWidth = () => {
    if (!sizing) return;

    editor.sealHistory();
    flushSync(() => {
      run('setTableColumnWidth', { index: sizing.column, width: null });
      onPreview(null);
    });
    sizingBase.current = widthsNow();
    setSizing({ ...sizing, value: sizingBase.current[sizing.column] ?? sizing.value });
  };

  /**
   * Телефон: точка на углу рамки. Её тянут пальцем — выделение расширяется до ячейки под пальцем (начало — ячейка с
   * кареткой или якорь выделения). Меню ячеек не открывается: палец отпускают, чтобы подправить рамку, а меню открывает
   * долгое удержание на выделенной ячейке.
   */
  const dragKnob = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const { pointerId } = event;
    const anchor = picked ? picked.anchor : { row: active.row, column: active.column };

    frozen.current = true;
    selectTableCells(editor, view, block.id, anchor, picked ? picked.head : anchor);

    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointerId) return;

      // Палец закрывает ячейку под точкой: голова — ячейка чуть выше и левее неё, внутри рамки.
      const under = document
        .elementsFromPoint(moved.clientX - KNOB_REACH, moved.clientY - KNOB_REACH)
        .find((element) => element.matches('[data-inkbrick-block="table-cell"]'));
      const id = under?.getAttribute('data-block-id');
      const found = id ? locateTableCell(getBlock, id) : undefined;

      if (found?.tableId === block.id)
        selectTableCells(editor, view, block.id, anchor, { row: found.row, column: found.column });
    };
    const finish = (ended: PointerEvent) => {
      if (ended.pointerId !== pointerId) return;

      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      frozen.current = false;
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  };

  const { table, row, cell, edges, segments } = layout;
  // Палец: плашки крупнее (см. ui.css), а маркеры вставки (18 px вместо 10) остаются на одной оси с ними:
  // у строки — по горизонтали, у столбца — по вертикали. Плашка столбца отступает от маркеров по краям ячейки.
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const gripInset = coarse ? 12 : 6;
  // Таблица стоит вровень с текстом, как остальные блоки. Плашки и маркеры лежат на её левой и верхней границе: их ось —
  // в 1 px снаружи от линии, внутрь они заходят на 4 px (в поле ячейки, не на текст), а слева остаётся место ручке блока.
  const pillHalf = coarse ? 8 : 5;
  const markerHalf = coarse ? 9 : 5;
  const rowAxis = 1;
  const rowInsertGap = rowAxis + markerHalf;
  const columnInsertRise = rowAxis + markerHalf;
  // Плашка строки — по высоте строки, как плашка столбца по ширине: отступы по краям оставляют место маркерам вставки.
  const rowPill = Math.max(coarse ? 20 : 14, row.height - 2 * gripInset);
  const rowPillTop = row.top + (row.height - rowPill) / 2;
  // Палец, узкий столбец: крупные маркеры вставки по краям налезли бы на плашку столбца. Их нет, вставка — из меню столбца.
  const columnInserts = !coarse || cell.width >= 2 * gripInset + 40;
  const Menu = slots.BlockMenu ?? DefaultBlockMenu;
  const control = {
    'data-inkbrick-ui': 'table-controls',
    'data-inkbrick-block-ui': '',
    onMouseDown: prevent,
  } as const;

  return (
    <>
      {createPortal(
        <>
          <button
            {...control}
            type="button"
            data-inkbrick-part="row-grip"
            aria-label={t('table.rowHandle', { row: active.row + 1 })}
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'row'}
            style={{
              // Прокрутка таблицы в сторону уводит её левый край за экран: плашка строки остаётся у края окна.
              left: Math.max(2, table.left - rowAxis - pillHalf),
              // Между маркерами вставки на границах строки (крупные под палец) и не касаясь их.
              top: rowPillTop,
              height: rowPill,
            }}
            onClick={() => open('row', table.left + 8, row.top + row.height / 2 + 14)}
          >
            <span data-inkbrick-part="dots" aria-hidden="true" />
          </button>
          {/* Верхний левый угол: маркер «строка выше» лёг бы на маркер «столбец слева» (оба на углу таблицы). Вставка
              выше остаётся в меню строки. */}
          {!(active.row === 0 && active.column === 0) && (
            <button
              {...control}
              type="button"
              data-inkbrick-part="row-insert"
              data-edge="start"
              aria-label={t('table.row.insertAbove')}
              title={t('table.row.insertAbove')}
              disabled={!canAddRow}
              style={{ left: Math.max(2, table.left - rowInsertGap), top: row.top - markerHalf }}
              onClick={() => perform(() => run('insertTableRow', { index: active.row }))}
            />
          )}
          <button
            {...control}
            type="button"
            data-inkbrick-part="row-insert"
            data-edge="end"
            aria-label={t('table.row.insertBelow')}
            title={t('table.row.insertBelow')}
            disabled={!canAddRow}
            style={{
              left: Math.max(2, table.left - rowInsertGap),
              top: row.top + row.height - markerHalf,
            }}
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
              top: edgeTop(table.top - rowAxis - pillHalf),
              width: Math.max(14, cell.width - 2 * gripInset),
            }}
            onClick={() => open('column', cell.left + 6, table.top + 10)}
          >
            <span data-inkbrick-part="dots" aria-hidden="true" />
          </button>
          {columnInserts && (
            <>
              <button
                {...control}
                type="button"
                data-inkbrick-part="column-insert"
                data-edge="start"
                aria-label={t('table.column.insertLeft')}
                title={t('table.column.insertLeft')}
                disabled={!canAddColumn}
                style={{ left: cell.left - markerHalf, top: edgeTop(table.top - columnInsertRise) }}
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
                style={{
                  left: cell.left + cell.width - markerHalf,
                  top: edgeTop(table.top - columnInsertRise),
                }}
                onClick={() =>
                  perform(() => run('insertTableColumn', { index: active.column + 1 }))
                }
              />
            </>
          )}
          {segments.map(({ column, x, top, height }, order) => {
            const edge = edges[column];
            // Первый участок границы — фокусируемый разделитель, остальные только для мыши и пальца.
            const first = order === 0 || segments[order - 1].column !== column;

            return (
              <div
                {...control}
                key={`${column}:${Math.round(top)}`}
                role="separator"
                aria-orientation="vertical"
                // Фокусируемому разделителю нужно текущее значение: ширина столбца по раскладке.
                aria-valuenow={Math.round(
                  edge.x - (column === 0 ? layout.grid.left : edges[column - 1].x),
                )}
                aria-valuemin={MIN_WIDTH}
                aria-valuemax={MAX_WIDTH}
                aria-label={t('table.resize', { column: column + 1 })}
                tabIndex={first ? 0 : -1}
                aria-hidden={first ? undefined : true}
                data-inkbrick-part="resize"
                style={{ left: x - 3, top, height }}
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
            );
          })}
          {coarse && !menu && !sizing && (picked || caretPosition) && (
            <>
              {/* Рамка выделения и точка на её углу (как в Notion на телефоне): точку тянут, чтобы выделить несколько ячеек. */}
              <div
                {...control}
                aria-hidden="true"
                data-inkbrick-part="cell-frame"
                style={{
                  left: layout.frame.left - 1,
                  top: layout.frame.top - 1,
                  width: layout.frame.width + 2,
                  height: layout.frame.height + 2,
                }}
              />
              <button
                {...control}
                type="button"
                data-inkbrick-part="cell-knob"
                aria-label={t('table.selection.extend')}
                style={{
                  left: layout.frame.left + layout.frame.width - 11,
                  top: layout.frame.top + layout.frame.height - 11,
                }}
                onPointerDown={dragKnob}
              />
            </>
          )}
          {sizing && (
            <ColumnWidthBar
              column={sizing.column + 1}
              min={widthRange(sizingBase.current, sizing.column).min}
              max={widthRange(sizingBase.current, sizing.column).max}
              value={sizing.value}
              auto={!props.widths?.[sizing.column]}
              onInput={slideWidth}
              onCommit={commitWidth}
              onAuto={fitWidth}
              onClose={stopSizing}
            />
          )}
        </>,
        document.body,
      )}
      {/* Меню уходит плавно (на телефоне лист съезжает вниз), даже если ручки уже скрылись. */}
      <PortalPresence
        open={menu !== null}
        render={() =>
          menu && (
            <Menu
              block={block}
              position={{ x: menu.x, y: menu.y }}
              actions={
                menu.kind === 'row'
                  ? rowActions(menu.position)
                  : groupColumnActions(columnActions(menu.position), t)
              }
              turnInto={[]}
              onClose={() => {
                setMenu(null);
                rootFocus();
              }}
              onDismiss={() => setMenu(null)}
            />
          )
        }
      />
    </>
  );
}

/** Основной указатель — палец (нет наведения и правой кнопки). */
const coarsePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Меню столбца по группам, как меню выбора блоков: сам столбец (ширина, выделение, вставка, перенос, закрепление,
 * удаление), затем выравнивание, тип и сортировка.
 */
function groupColumnActions(actions: BlockMenuAction[], t: TFunction): BlockMenuAction[] {
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
