import { useEffect, type RefObject } from 'react';

import type { SelectionState } from '@inkbrick/engine';
import { readDocSelection } from '@inkbrick/view';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { selectTableCells } from '../table/cellSelection';

/** Выделение браузера направлено назад (подвижный край — в начале): тянули справа налево или Shift+←. */
function isBackward(): boolean {
  const selection = globalThis.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

  const range = selection.getRangeAt(0);

  return (
    selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset
  );
}

/**
 * Связывает выделение на экране с `editor.selection` движка. Что выбрал пользователь — текст, блоки целиком, ячейки
 * таблицы — записывается туда (источник `view`); выделение, заданное кодом (`editor.selection.set`, источник `api`),
 * ставится на экране. Команды и undo/redo интерфейс ставит сам, поэтому их изменения он не повторяет.
 */
export function useSelectionSync(ref: RefObject<HTMLElement | null>): void {
  const editor = useEditor();
  const view = useEditorView();

  useEffect(() => {
    const root = ref.current;

    if (!root) return;

    // Экран → движок.
    const fromText = () => {
      if (view.picked.size > 0 || view.cells.get()) return;

      const selection = readDocSelection(root);

      // Фокус ушёл из документа (в меню, в поле приложения): выделение документа остаётся прежним.
      if (!selection) return;

      const backward = isBackward();

      editor.selection.set(
        {
          type: 'text',
          anchor: backward ? selection.to : selection.from,
          focus: backward ? selection.from : selection.to,
        },
        'view',
      );
    };
    const fromPicked = () => {
      const { ids } = view.picked.getState();

      if (ids.length > 0) editor.selection.selectBlocks(ids, 'view');
      else fromText();
    };
    const fromCells = () => {
      const cells = view.cells.get();

      if (cells) editor.selection.selectCells(cells.tableId, cells.anchor, cells.head, 'view');
      else fromText();
    };

    // Движок → экран: только выделение, заданное кодом.
    const toView = (selection: SelectionState, origin: string) => {
      if (origin !== 'api') return;

      if (selection === null) {
        view.picked.clear();
        view.cells.clear();
        globalThis.getSelection()?.removeAllRanges();
      } else if (selection.type === 'text') {
        view.picked.clear();
        view.cells.clear();
        view.placeSelection(selection.anchor, selection.focus);
      } else if (selection.type === 'blocks') {
        view.cells.clear();
        view.picked.set(selection.ids);
      } else {
        view.picked.clear();
        selectTableCells(editor, view, selection.tableId, selection.anchor, selection.head);
      }
    };

    const document = root.ownerDocument;
    const unsubscribe = [
      view.picked.subscribe(fromPicked),
      view.cells.subscribe(fromCells),
      editor.selection.subscribe(toView),
    ];

    document.addEventListener('selectionchange', fromText);

    return () => {
      document.removeEventListener('selectionchange', fromText);
      for (const stop of unsubscribe) stop();
    };
  }, [editor, view, ref]);
}
