import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import {
  FRAGMENT_MIME,
  fragmentToHtml,
  fragmentToPlainText,
  locateTableCell,
  tableSize,
  type TableCellRef,
  tableRangeFragment,
} from '@inkbrick/engine';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { cellShortcut } from './cellFormatting';
import { cellOfRange, clearTableCells, selectTableCells, visibleCell } from './cellSelection';

/** Сколько палец держится на ячейке, чтобы начать выделение, и на сколько можно сдвинуться, не отменив его (прокрутка). */
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 10;

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * Выделение ячеек таблицы: протягивание мышью от ячейки к другой, Shift+клик и Shift+стрелки расширяют его.
 * Пока оно есть: Delete и Backspace очищают ячейки, Ctrl/Cmd+C и X кладут в буфер таблицу из выделенных ячеек,
 * вставка идёт от верхней левой ячейки, Esc и обычная стрелка возвращают курсор в ячейку, набор символа — тоже.
 */
export function useCellSelection(
  tableId: string,
  table: RefObject<HTMLTableElement | null>,
  enabled: boolean,
) {
  const editor = useEditor();
  const view = useEditorView();
  const active = useSyncExternalStore(
    view.cells.subscribe,
    () => view.cells.get()?.tableId === tableId,
    () => false,
  );

  useEffect(() => {
    const element = table.current;

    if (!element || !enabled) return;

    const getBlock = (id: string) => editor.store.getBlock(id);
    const cellAt = (target: EventTarget | null): TableCellRef | null => {
      const td =
        target instanceof Element ? target.closest<HTMLElement>('td[data-block-id]') : null;
      const position =
        td && element.contains(td) ? locateTableCell(getBlock, td.dataset.blockId!) : undefined;

      return position?.tableId === tableId ? { row: position.row, column: position.column } : null;
    };

    /** Ячейка этой таблицы, в которой стоит каретка, или `null`. */
    const caretCell = (): TableCellRef | null => {
      const id = view.caret.current;
      const position = id ? locateTableCell((cell) => editor.store.getBlock(cell), id) : undefined;

      return position?.tableId === tableId ? { row: position.row, column: position.column } : null;
    };

    /**
     * Палец: долгое нажатие выделяет ячейку, протяжка пальцем расширяет выделение, а после отпускания открывается меню
     * ячеек (форматирование, фон, границы, вставка и удаление строк). Быстрое касание и прокрутка остаются обычными.
     */
    const touchStart = (event: PointerEvent, anchor: TableCellRef) => {
      const { pointerId, clientX: startX, clientY: startY } = event;
      const picked = view.cells.get();
      const id =
        event.target instanceof Element
          ? event.target.closest('td[data-block-id]')?.getAttribute('data-block-id')
          : null;
      // Долгое удержание на уже выделенной ячейке открывает меню, а на невыделенной выделяет её: меню не открывается
      // при отпускании пальца, чтобы выделение можно было подправить (точкой или протяжкой) и продолжить.
      const onSelection = !!picked && picked.tableId === tableId && !!id && picked.ids.has(id);
      const origin = onSelection ? picked.anchor : anchor;
      let timer = 0;
      let selecting = false;
      let held = false;

      if (!onSelection) view.cells.clear();

      const stopScroll = (touch: TouchEvent) => {
        if (selecting && touch.cancelable) touch.preventDefault();
      };
      // Долгое нажатие браузер заканчивает меню или выделением текста: пока мы выделяем ячейки, их не показываем.
      const noNativeMenu = (menu: Event) => {
        if (selecting || timer) menu.preventDefault();
      };

      const finish = (ended: PointerEvent | null) => {
        clearTimeout(timer);
        timer = 0;
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        document.removeEventListener('touchmove', stopScroll);
        // Контекстное меню браузера приходит уже после отпускания: ещё мгновение его гасим.
        setTimeout(() => document.removeEventListener('contextmenu', noNativeMenu, true), 600);
        delete element.dataset.cellSelecting;

        // Короткое касание выделенной ячейки снимает выделение (каретка встаёт в неё, как обычно); сдвиг пальца — это
        // прокрутка, выделение остаётся.
        if (!selecting && onSelection && ended) view.cells.clear();

        if (!selecting) return;

        // После отпускания браузер досылает «мышиные» mousedown и click: редактор поставил бы по ним каретку и снял
        // выделение. Гасим их на короткое время: синтетические события приходят сразу за отпусканием.
        const eat = (mouse: Event) => {
          mouse.preventDefault();
          mouse.stopPropagation();
        };
        const kinds = ['mousedown', 'mouseup', 'click'] as const;

        for (const kind of kinds) document.addEventListener(kind, eat, true);
        setTimeout(() => {
          for (const kind of kinds) document.removeEventListener(kind, eat, true);
        }, 250);
      };
      const move = (moved: PointerEvent) => {
        if (moved.pointerId !== pointerId) return;

        if (!selecting) {
          if (Math.hypot(moved.clientX - startX, moved.clientY - startY) > LONG_PRESS_SLOP)
            finish(null);

          return;
        }

        // Меню уже открыто под пальцем: движение до отпускания выделение не трогает.
        if (held) return;

        const head = cellAt(document.elementFromPoint(moved.clientX, moved.clientY));

        if (head) selectTableCells(editor, view, tableId, origin, head);
      };
      const up = (ended: PointerEvent) => {
        if (ended.pointerId === pointerId) finish(ended);
      };
      const cancel = (ended: PointerEvent) => {
        if (ended.pointerId === pointerId) finish(null);
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
      document.addEventListener('contextmenu', noNativeMenu, true);
      document.addEventListener('touchmove', stopScroll, { passive: false });

      timer = window.setTimeout(() => {
        timer = 0;
        selecting = true;
        element.dataset.cellSelecting = '';
        globalThis.getSelection()?.removeAllRanges();
        // Короткий отклик пальцу: ячейка «взята» или открывается меню.
        navigator.vibrate?.(12);

        if (onSelection) {
          held = true;
          view.contextMenu.open(Math.round(startX), Math.round(startY));
        } else selectTableCells(editor, view, tableId, anchor, anchor);
      }, LONG_PRESS_MS);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const anchor = cellAt(event.target);

      if (!anchor) return;

      if (event.pointerType === 'touch') {
        if (!editor.readOnly) touchStart(event, anchor);
        return;
      }

      const current = view.cells.get();

      if (event.shiftKey) {
        // Без выделения начало — ячейка с кареткой: Shift+клик протягивает выделение от неё, а не текстовое выделение.
        const origin = current?.tableId === tableId ? current.anchor : caretCell();

        if (origin) {
          event.preventDefault();
          selectTableCells(editor, view, tableId, origin, anchor);
          return;
        }
      }

      view.cells.clear();

      let dragging = false;

      const move = (moved: PointerEvent) => {
        if ((moved.buttons & 1) === 0) return finish();

        const head = cellAt(document.elementFromPoint(moved.clientX, moved.clientY));

        if (!head || (!dragging && head.row === anchor.row && head.column === anchor.column))
          return;

        if (!dragging) {
          dragging = true;
          element.dataset.cellSelecting = '';
        }

        selectTableCells(editor, view, tableId, anchor, head);
        globalThis.getSelection()?.removeAllRanges();
      };

      const finish = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        delete element.dataset.cellSelecting;

        if (dragging) view.getRoot()?.focus({ preventScroll: true });
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    };

    element.addEventListener('pointerdown', onPointerDown);

    return () => element.removeEventListener('pointerdown', onPointerDown);
  }, [editor, view, table, tableId, enabled]);

  useEffect(() => {
    if (!active || !enabled) return;

    const getBlock = (id: string) => editor.store.getBlock(id);
    const place = (row: number, column: number) => {
      const { id } = visibleCell(editor, tableId, row, column);

      view.cells.clear();

      if (id) view.placeCaret(id, editor.engine.inline.length(getBlock(id)?.content ?? []));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const selection = view.cells.get();

      if (!selection || selection.tableId !== tableId || event.isComposing) return;

      // Ввод в меню, палитре и других окнах редактора не относится к ячейкам: выделение остаётся.
      if (event.target instanceof Element && event.target.closest('[data-inkbrick-ui]')) return;

      const mod = event.ctrlKey || event.metaKey;
      const size = tableSize(getBlock, tableId);

      if (!size) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        place(selection.head.row, selection.head.column);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        flushSync(() => clearTableCells(editor, selection.ids));
      } else if (mod && !editor.readOnly && cellShortcut(editor, selection, event)) {
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key in ARROWS && !mod && !event.altKey) {
        const [dRow, dColumn] = ARROWS[event.key];
        const head = {
          row: Math.min(size.rows - 1, Math.max(0, selection.head.row + dRow)),
          column: Math.min(size.columns - 1, Math.max(0, selection.head.column + dColumn)),
        };

        event.preventDefault();

        if (event.shiftKey) selectTableCells(editor, view, tableId, selection.anchor, head);
        else place(head.row, head.column);
      } else if (event.key.length === 1 && !mod) {
        // Как в таблицах: символ заменяет содержимое ячейки-якоря, остальные ячейки выделения не трогаются.
        const { id } = visibleCell(editor, tableId, selection.anchor.row, selection.anchor.column);

        view.cells.clear();

        if (id && !editor.readOnly) {
          // Очистка и сам символ — один шаг undo: одна отмена возвращает и текст ячейки, и её содержимое до ввода.
          event.preventDefault();
          flushSync(() => {
            editor.sealHistory();
            editor.batch(() => {
              const length = editor.engine.inline.length(editor.store.getBlock(id)?.content ?? []);

              if (length > 0)
                editor.dispatch({
                  type: 'deleteText',
                  payload: { blockId: id, from: 0, to: length },
                });
              editor.dispatch({
                type: 'insertText',
                payload: { text: event.key, selection: { anchor: { blockId: id, offset: 0 } } },
              } as never);
            });
          });
          view.placeCaret(id, event.key.length);
        }
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        place(selection.anchor.row, selection.anchor.column);
      }
    };

    const write = (event: ClipboardEvent, cut: boolean) => {
      const selection = view.cells.get();

      if (!selection || selection.tableId !== tableId || !event.clipboardData) return;

      const fragment = tableRangeFragment(getBlock, tableId, selection.range);

      if (fragment.blocks.length === 0) return;

      const json = JSON.stringify(fragment);

      event.clipboardData.setData('text/plain', fragmentToPlainText(fragment));
      event.clipboardData.setData('text/html', fragmentToHtml(fragment, encodeURIComponent(json)));
      event.clipboardData.setData(FRAGMENT_MIME, json);
      event.preventDefault();
      event.stopPropagation();

      if (cut && !editor.readOnly) flushSync(() => clearTableCells(editor, selection.ids));
    };

    const onCopy = (event: ClipboardEvent) => write(event, false);
    const onCut = (event: ClipboardEvent) => write(event, true);

    /* Вставка идёт от верхней левой ячейки: курсор ставим туда, остальное делает обычная вставка. */
    const onPaste = () => {
      const selection = view.cells.get();

      if (!selection || selection.tableId !== tableId) return;

      const id = cellOfRange(editor, tableId, selection.range, 'start');

      view.cells.clear();

      if (id) view.placeCaret(id, 0);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (event.button !== 0) return;

      if (target instanceof Element && target.closest('[data-inkbrick-ui]')) return;
      if (event.shiftKey && target instanceof Element && target.closest('td[data-block-id]'))
        return;
      // Палец на выделенной ячейке: быстрое касание снимет выделение, долгое удержание откроет меню (см. `touchStart`).
      if (
        event.pointerType === 'touch' &&
        target instanceof Element &&
        target.closest('td[data-cell-selected]')
      )
        return;

      view.cells.clear();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [active, enabled, editor, view, tableId]);

  useEffect(
    () => () => {
      if (view.cells.get()?.tableId === tableId) view.cells.clear();
    },
    [view, tableId],
  );
}
