import { useT } from '../hooks/useT';
import { useWordCount, type WordCountOptions } from './useWordCount';

export interface WordCountProps extends WordCountOptions {
  readonly className?: string;
}

/**
 * Счётчик слов и символов: «Слов: 120 · Символов: 780». Когда есть выделение, показывает и его: «Слов: 12 из 120».
 * В подсказке (title) — символы без пробелов. Кладётся в `<EditorProvider>` рядом с документом.
 *
 * ```tsx
 * <EditorProvider editor={editor}>
 *   <DocumentView />
 *   <WordCount />
 * </EditorProvider>
 * ```
 */
export function WordCount({ className, ...options }: WordCountProps) {
  const t = useT();
  const { document, selection } = useWordCount(options);

  const words = selection
    ? t('stats.wordsOf', { count: selection.words, total: document.words })
    : t('stats.words', { count: document.words });
  const characters = selection
    ? t('stats.charactersOf', { count: selection.characters, total: document.characters })
    : t('stats.characters', { count: document.characters });
  const noSpaces = selection ? selection.charactersNoSpaces : document.charactersNoSpaces;

  return (
    <output
      className={className ? `inkbrick-word-count ${className}` : 'inkbrick-word-count'}
      data-inkbrick-ui="word-count"
      data-testid="word-count"
      data-selection={selection ? '' : undefined}
      title={t('stats.charactersNoSpaces', { count: noSpaces })}
      aria-live="off"
    >
      <span data-inkbrick-part="words">{words}</span>
      <span data-inkbrick-part="characters">{characters}</span>
    </output>
  );
}
