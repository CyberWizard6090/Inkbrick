import type { InlineNode } from '../model/InlineNode';

/**
 * Ссылка на сноску в тексте — как и формула, «объект» в один символ U+FFFC с атрибутом `footnote` (код сноски). Номер в
 * документе не хранится: он считается по порядку ссылок, поэтому не расходится при правках и совместной работе.
 */
export const FOOTNOTE_ID = /^[\w-]{1,64}$/;

export const isFootnoteNode = (node: { attributes?: Record<string, unknown> }): boolean =>
  typeof node.attributes?.footnote === 'string';

/** Номера сносок по порядку первой ссылки в обходе блоков (код сноски → номер с единицы). */
export function footnoteNumbers(
  blocks: Iterable<{ readonly content: readonly InlineNode[] }>,
): Map<string, number> {
  const numbers = new Map<string, number>();

  for (const { content } of blocks) {
    for (const node of content) {
      const id = node.attributes?.footnote;

      if (typeof id === 'string' && !numbers.has(id)) numbers.set(id, numbers.size + 1);
    }
  }

  return numbers;
}
