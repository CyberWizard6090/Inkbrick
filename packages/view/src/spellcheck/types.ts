/**
 * Источник вариантов исправления для контекстного меню (например, `createSpellchecker` из `@inkbrick/spellcheck`).
 * Браузер не отдаёт свои подсказки страницам, поэтому редактор берёт их здесь.
 */
export interface Spellchecker {
  /** Варианты для слова; `null` — слово верное или его язык не проверяется. */
  suggest(word: string): Promise<readonly string[] | null>;
  /** Запомнить слово как верное. Без него в меню нет «Добавить в словарь». */
  add?(word: string): void;
}

/** Слово под правым кликом: где оно в документе и его текст. */
export interface SpellTarget {
  readonly blockId: string;
  readonly from: number;
  readonly to: number;
  readonly word: string;
}

const LETTER = /[\p{L}\p{M}]/u;
const JOINER = /['’-]/;

/**
 * Слово вокруг `offset` в тексте блока: буквы, а внутри — апостроф и дефис («don't», «из-за»). `null` — под точкой не
 * слово.
 */
export function wordAt(
  text: string,
  offset: number,
): { readonly from: number; readonly to: number; readonly word: string } | null {
  const inside = (index: number) =>
    LETTER.test(text[index] ?? '') ||
    (JOINER.test(text[index] ?? '') &&
      LETTER.test(text[index - 1] ?? '') &&
      LETTER.test(text[index + 1] ?? ''));

  let from = Math.min(offset, text.length);

  // Точка у правого края слова (после последней буквы) тоже относится к нему.
  if (!inside(from) && from > 0 && inside(from - 1)) from -= 1;
  if (!inside(from)) return null;

  while (from > 0 && inside(from - 1)) from -= 1;

  let to = from;

  while (to < text.length && inside(to)) to += 1;

  return { from, to, word: text.slice(from, to) };
}
