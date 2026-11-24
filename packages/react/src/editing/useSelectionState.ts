import { useEffect, type RefObject } from 'react';
import { readDocSelection } from '@inkbrick/view';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';

/** Блоки на краях текущего выделения в DOM: каретка — один блок, выделение — начало и конец. */
export function selectionEdges(root: HTMLElement): readonly string[] {
  const selection = readDocSelection(root);

  return !selection
    ? []
    : selection.collapsed
      ? [selection.from.blockId]
      : [selection.from.blockId, selection.to.blockId];
}

export function useSelectionState(ref: RefObject<HTMLElement | null>) {
  const editor = useEditor();
  const view = useEditorView();

  useEffect(() => {
    const root = ref.current;

    if (!root) return;

    const update = () => {
      const selection = readDocSelection(root);

      view.selection.set(
        selection && !selection.collapsed ? editor.blocksBetween(selection.from, selection.to) : [],
      );
      const caret = selection?.collapsed ? selection.from.blockId : null;

      view.caret.set(caret);
      editor.controllers.setFocusedBlock(caret);
      view.viewport.setEdges(selectionEdges(root));
    };

    document.addEventListener('selectionchange', update);
    update();

    return () => {
      document.removeEventListener('selectionchange', update);
      view.selection.set([]);
      view.caret.set(null);
      view.viewport.setEdges([]);
      editor.controllers.setFocusedBlock(null);
    };
  }, [editor, view, ref]);
}
