import { useEffect, useState } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { readDocSelection } from '../editing/selection';
import {
  documentStats,
  EMPTY_STATS,
  selectionStats,
  type StatsOptions,
  type TextStats,
} from './count';

export interface WordCountOptions extends StatsOptions {
  /** Пауза после правки или выделения перед пересчётом, мс. На огромных документах не даёт считать на каждую букву. */
  readonly delay?: number;
}

export interface WordCountState {
  /** Весь документ. */
  readonly document: TextStats;
  /** Выделенное; `null`, когда выделения нет. */
  readonly selection: TextStats | null;
}

/**
 * Слова и символы документа и выделения; пересчитываются с задержкой (`delay`, по умолчанию 250 мс) после правок и
 * смены выделения.
 */
export function useWordCount({ code, delay = 250 }: WordCountOptions = {}): WordCountState {
  const editor = useEditor();
  const view = useEditorView();
  const [state, setState] = useState<WordCountState>(() => ({
    document: documentStats(editor, { code }),
    selection: null,
  }));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let documentStale = true;

    const measure = () => {
      timer = undefined;

      const root = view.getRoot();
      const range = root ? readDocSelection(root) : null;

      setState((previous) => {
        const next: WordCountState = {
          document: documentStale ? documentStats(editor, { code }) : previous.document,
          selection: selectionStats(editor, range, { code }),
        };

        documentStale = false;

        const same = (a: TextStats | null, b: TextStats | null) =>
          a === b ||
          (!!a &&
            !!b &&
            a.words === b.words &&
            a.characters === b.characters &&
            a.charactersNoSpaces === b.charactersNoSpaces);

        return same(previous.document, next.document) && same(previous.selection, next.selection)
          ? previous
          : next;
      });
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, delay);
    };
    const onChange = () => {
      documentStale = true;
      later();
    };

    const unsubscribe = editor.store.subscribe(onChange);

    document.addEventListener('selectionchange', later);
    onChange();

    return () => {
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('selectionchange', later);
    };
  }, [editor, view, code, delay]);

  return state;
}

export { EMPTY_STATS };
