import { useCallback, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

import type { HistoryResult } from '@inkbrick/engine';

import { useEditor } from './useEditor';
import { useEditorView } from './useEditorView';

export interface HistoryControls {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): boolean;
  redo(): boolean;
}

export function useHistory(): HistoryControls {
  const editor = useEditor();
  const view = useEditorView();
  const { store } = editor;

  useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getHistoryVersion(),
    () => store.getHistoryVersion(),
  );

  const apply = useCallback(
    (action: () => HistoryResult | undefined) => {
      let result: HistoryResult | undefined;

      flushSync(() => {
        result = action();
      });

      if (result?.caret) view.placeCaret(result.caret.blockId, result.caret.offset);

      return result !== undefined;
    },
    [view],
  );

  const undo = useCallback(() => apply(() => editor.undo()), [apply, editor]);
  const redo = useCallback(() => apply(() => editor.redo()), [apply, editor]);

  return { canUndo: editor.canUndo, canRedo: editor.canRedo, undo, redo };
}
