import { useEffect, type RefObject } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { readDocSelection } from './selection';

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
      view.viewport.setEdges(
        !selection
          ? []
          : selection.collapsed
            ? [selection.from.blockId]
            : [selection.from.blockId, selection.to.blockId],
      );
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
