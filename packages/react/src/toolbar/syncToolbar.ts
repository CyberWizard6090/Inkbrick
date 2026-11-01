import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { readDocSelection } from '../editing/selection';
import { isFormattable } from './formatting';

export function syncToolbar(editor: Editor, view: EditorView): void {
  const state = view.toolbar.getState();

  if (state.linkOpen) return;

  const root = view.getRoot();
  const selection = root ? readDocSelection(root) : null;
  const native = globalThis.getSelection();

  if (
    view.pointerDown ||
    !selection ||
    selection.collapsed ||
    !isFormattable(editor, selection) ||
    !native ||
    native.rangeCount === 0
  ) {
    view.toolbar.hide();
    return;
  }

  const rect = native.getRangeAt(0).getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) {
    view.toolbar.hide();
    return;
  }

  view.toolbar.show(selection, editor.formatsAt(selection.from, selection.to), {
    x: rect.left + rect.width / 2,
    y: rect.top,
  });
}
