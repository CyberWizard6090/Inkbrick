import { flushSync } from 'react-dom';

import type { Alignment } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import type { DocSelection } from '../editing/selection';
import { isFormattable } from './formatting';

/**
 * Ставит или снимает цвет текста (`color`) или подсветки (`backgroundColor`) на выделении. Значение — имя цвета
 * палитры; `null` снимает цвет. Возвращает false, если применять не к чему (свёрнутое выделение, код).
 */
export function setColorInSelection(
  editor: Editor,
  view: EditorView,
  selection: DocSelection,
  kind: 'color' | 'backgroundColor',
  value: string | null,
): boolean {
  if (selection.collapsed || !isFormattable(editor, selection)) return false;

  const payload = {
    from: selection.from,
    to: selection.to,
    attributes: { [kind]: value ?? undefined },
  };

  if (!editor.can('setInlineAttributes', payload)) return false;

  flushSync(() => {
    editor.dispatch({ type: 'setInlineAttributes', payload });
  });

  view.placeSelection(selection.from, selection.to);

  return true;
}

export function setAlignInSelection(
  editor: Editor,
  view: EditorView,
  selection: DocSelection,
  align: Alignment,
): boolean {
  if (!editor.can('setAlign', { from: selection.from, to: selection.to, align })) return false;

  flushSync(() => {
    editor.dispatch({
      type: 'setAlign',
      payload: { from: selection.from, to: selection.to, align },
    });
  });

  view.placeSelection(selection.from, selection.to);

  return true;
}
