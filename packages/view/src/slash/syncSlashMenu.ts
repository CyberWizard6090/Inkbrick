import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { readDocSelection } from '../editing/selection';
import { visibleSlashItems } from './items';
import type { SlashMenuItem } from './types';

function caretPosition(view: EditorView, blockId: string): { x: number; y: number } | null {
  const selection = globalThis.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = range?.getClientRects()[0];

  if (rect && (rect.width > 0 || rect.height > 0)) return { x: rect.left, y: rect.bottom };

  const element = view.getElement(blockId);

  if (!element) return null;

  const box = element.getBoundingClientRect();

  return { x: box.left, y: box.bottom };
}

/**
 * Сверяет меню с текущим состоянием документа и выделением: обновляет запрос и позицию
 * или закрывает меню, если каретка ушла от «/» или «/» удалён.
 */
export function syncSlashMenu(
  editor: Editor,
  view: EditorView,
  items: readonly SlashMenuItem[],
): void {
  const state = view.slash.getState();

  if (!state.open || !state.blockId) return;

  const root = view.getRoot();
  const selection = root ? readDocSelection(root) : null;
  const block = editor.store.getBlock(state.blockId);
  const text = block ? editor.engine.inline.toPlainText(block.content) : '';

  if (
    !selection ||
    !selection.collapsed ||
    selection.from.blockId !== state.blockId ||
    selection.from.offset <= state.slashOffset ||
    text[state.slashOffset] !== '/'
  ) {
    view.slash.close();
    return;
  }

  const query = text.slice(state.slashOffset + 1, selection.from.offset);
  const visible = visibleSlashItems(editor, items, state.blockId, query);

  if (visible.length === 0 && /\s$/.test(query)) {
    view.slash.close();
    return;
  }

  view.slash.update({
    query,
    activeIndex:
      query !== state.query ? 0 : Math.min(state.activeIndex, Math.max(visible.length - 1, 0)),
    position: caretPosition(view, state.blockId),
  });
}
