import { useLayoutEffect } from 'react';

import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { computeFolds } from './computeFolds';

const tracked = new WeakMap<EditorView, { count: number; stop: () => void }>();

function start(editor: Editor, view: EditorView): () => void {
  const apply = () => view.folds.set(computeFolds(editor));

  apply();

  const stopChanges = editor.store.subscribeChanges((ids) => {
    const relevant = ids.some((id) => {
      const block = editor.store.getBlock(id);

      return (
        !block ||
        block.flavour === 'block:heading' ||
        view.folds.isFolding(id) ||
        (view.folds.size > 0 && block.children.length > 0)
      );
    });

    if (relevant) apply();
  });

  return () => {
    stopChanges();
    view.folds.set(new Map());
  };
}

/**
 * Следит за свёрнутыми заголовками документа и сообщает `view.folds`, какие блоки скрыть. Вызывается из компонента
 * заголовка: пока в документе есть заголовки, отслеживание включено; один раз на редактор, сколько бы заголовков ни было.
 */
export function useFoldTracking(): void {
  const editor = useEditor();
  const view = useEditorView();

  useLayoutEffect(() => {
    let entry = tracked.get(view);

    if (!entry) {
      entry = { count: 0, stop: start(editor, view) };
      tracked.set(view, entry);
    }

    entry.count += 1;

    return () => {
      const current = tracked.get(view);

      if (!current) return;

      current.count -= 1;

      if (current.count === 0) {
        current.stop();
        tracked.delete(view);
      }
    };
  }, [editor, view]);
}
