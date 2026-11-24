import type { CodeHighlighter } from '@inkbrick/dom/code-highlight';

let loaded: CodeHighlighter | undefined;
let loading: Promise<CodeHighlighter> | undefined;

const listeners = new Set<() => void>();

/** Загружает встроенный подсветчик (отдельный чанк). Повторный вызов возвращает тот же промис. */
export function loadDefaultHighlighter(): Promise<CodeHighlighter> {
  return (loading ??= import('@inkbrick/dom/code-highlight').then((module) => {
    loaded = module.highlightCode;

    for (const listener of [...listeners]) listener();

    return loaded;
  }));
}

export const isDefaultHighlighterLoaded = (): boolean => loaded !== undefined;

export function subscribeDefaultHighlighter(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Встроенный подсветчик по умолчанию, но без места в основном бандле: первый блок кода запускает загрузку, до её
 * окончания код показывается без раскраски, потом перерисовывается. Свой `highlighter` работает как раньше.
 */
export const lazyHighlightCode: CodeHighlighter = (code, language) => {
  if (loaded) return loaded(code, language);

  void loadDefaultHighlighter();

  return [];
};
