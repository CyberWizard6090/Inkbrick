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

import type { BaseBlock, TableProps } from '@inkbrick/document';
import {
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  locateTableCell,
  tableCellAt,
  tableSize,
  type CaretResult,
} from '@inkbrick/engine';

import { DefaultBlockMenu } from '../block-handle/DefaultBlockMenu';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useEditorUI } from '../ui/EditorUIContext';
import { PortalPresence } from '../ui/Presence';
import { selectTableCells } from './cellSelection';
import { ColumnWidthBar } from './ColumnWidthBar';
import {
  MAX_WIDTH,
  MIN_WIDTH,
  availableWidth,
  columnsToWrite,
  resized,
  roundWidths,
  widthRange,
  widthsOnScreen,
} from './controls/columnWidths';
import {
  clamp,
  edgeTop,
  measure,
  sameLayout,
  type Layout,
  type Position,
} from './controls/geometry';
import {
  getHoveredTable,
  nearestTable,
  setHoveredTable,
  subscribeHovered,
} from './controls/hoveredTable';
import {
  columnActions,
  decimalSeparator,
  groupColumnActions,
  rowActions,
  type LineActionsContext,
} from './controls/lineActions';

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

/** Насколько выше и левее точки рамки берётся ячейка под пальцем (палец закрывает саму точку). */
const KNOB_REACH = 14;
const KEY_STEP = 10;

const prevent = (event: { preventDefault(): void }) => event.preventDefault();

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
    () => getHoveredTable() !== null && getHoveredTable() !== block.id,
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
          if (getHoveredTable() === block.id) setHoveredTable(null);
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
        if (getHoveredTable() === block.id) setHoveredTable(null);
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

  const lineContext: LineActionsContext = {
    editor,
    view,
    block,
    t,
    props,
    size,
    active,
    decimal,
    canAddRow,
    canAddColumn,
    perform,
    run,
    can,
    cellAt,
    closeMenu: () => setMenu(null),
    startSizing: (column) => startSizing(column),
  };

  /** Меню таблицы: форматирование таблицы целиком и фон выделенных ячеек (без выделения — всех). */
  const open = (kind: MenuState['kind'], x: number, y: number) =>
    setMenu((current) =>
      current?.kind === kind &&
      current.position.row === active.row &&
      current.position.column === active.column
        ? null
        : { kind, position: active, x, y },
    );

  const widthsNow = () => widthsOnScreen(tableRef.current, props.widths);
  const available = () => availableWidth(tableRef.current);

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
      widths = resized(start, column, moved.clientX - startX, available());

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

      const indexes = columnsToWrite(start, widths, available());

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
    const next = resized(start, column, step, available());
    const indexes = columnsToWrite(start, next, available());

    // Фокус остаётся на ручке: иначе следующая стрелка уже уходила бы в документ.
    if (indexes.length === 0) return;

    editor.sealHistory();
    flushSync(() => {
      writeWidths(next, indexes);
    });
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
    const next = resized(base, sizing.column, width - base[sizing.column], available());

    onPreview(next);
    setSizing({ ...sizing, value: next[sizing.column] });
  };

  /** Палец отпущен или нажата кнопка «−» / «+»: ширина записывается одним шагом отмены. */
  const commitWidth = (width: number) => {
    if (!sizing) return;

    const base = sizingBase.current;
    const next = resized(base, sizing.column, width - base[sizing.column], available());
    const indexes = columnsToWrite(base, next, available());

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
  // Верхний левый угол: кружок «строка выше» у первой строки и «столбец слева» у первого столбца легли бы друг на друга
  // и выглядели бы общими. Они разведены: первый — на левой границе чуть ниже угла, второй — на верхней чуть правее.
  const cornerShift = coarse ? 22 : 14;
  const rowStart = row.top + (active.row === 0 ? cornerShift : 0);
  const columnStart = cell.left + (active.column === 0 ? cornerShift : 0);
  const rowPill = Math.max(10, row.top + row.height - gripInset - (rowStart + gripInset));
  const rowPillTop = rowStart + gripInset;
  const columnPill = Math.max(10, cell.left + cell.width - gripInset - (columnStart + gripInset));
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
          <button
            {...control}
            type="button"
            data-inkbrick-part="row-insert"
            data-edge="start"
            aria-label={t('table.row.insertAbove')}
            title={t('table.row.insertAbove')}
            disabled={!canAddRow}
            style={{ left: Math.max(2, table.left - rowInsertGap), top: rowStart - markerHalf }}
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
              left: columnStart + gripInset,
              top: edgeTop(table.top - rowAxis - pillHalf),
              width: columnPill,
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
                style={{
                  left: columnStart - markerHalf,
                  top: edgeTop(table.top - columnInsertRise),
                }}
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
              min={widthRange(sizingBase.current, sizing.column, available()).min}
              max={widthRange(sizingBase.current, sizing.column, available()).max}
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
                  ? rowActions(lineContext, menu.position)
                  : groupColumnActions(columnActions(lineContext, menu.position), t)
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
