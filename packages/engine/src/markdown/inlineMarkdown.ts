import { FORMULA_CHAR, isSafeUrl, type TextAttributes } from '@inkbrick/document';

export interface InlineMarkdownMatch {
  /** Смещение первого символа открывающей разметки. */
  readonly start: number;
  /** Длина открывающей разметки (`**`, `[`). */
  readonly open: number;
  /** Сколько символов закрывающей разметки уже набрано и нужно удалить (без только что набранного). */
  readonly close: number;
  /** Длина текста между разметкой. */
  readonly length: number;
  readonly attributes: Partial<TextAttributes>;
}

const MARKERS: readonly { marker: string; attributes: Partial<TextAttributes> }[] = [
  { marker: '**', attributes: { bold: true } },
  { marker: '__', attributes: { bold: true } },
  { marker: '~~', attributes: { strike: true } },
  { marker: '*', attributes: { italic: true } },
  { marker: '_', attributes: { italic: true } },
  { marker: '`', attributes: { code: true } },
];

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);
const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

function matchMarker(text: string, typed: string): InlineMarkdownMatch | null {
  const full = text + typed;

  for (const { marker, attributes } of MARKERS) {
    if (typed !== marker[marker.length - 1] || !full.endsWith(marker)) continue;

    const closeAt = full.length - marker.length;
    const start = full.lastIndexOf(marker, closeAt - 1);

    if (start < 0) continue;

    const inner = full.slice(start + marker.length, closeAt);
    const code = marker === '`';

    if (inner === '' || inner.includes(FORMULA_CHAR)) continue;
    if (!code && (isSpace(inner[0]) || isSpace(inner[inner.length - 1]))) continue;
    if (!code && inner.includes(marker[0])) continue;
    if (code && inner.includes('`')) continue;

    const before = full[start - 1];
    const after = full[closeAt + marker.length];

    if (before === marker[0] || inner[0] === marker[0]) continue;
    if (marker[0] === '_' && isWord(before)) continue;
    if (marker[0] === '_' && isWord(after)) continue;

    return {
      start,
      open: marker.length,
      close: marker.length - 1,
      length: inner.length,
      attributes,
    };
  }

  return null;
}

function matchLink(text: string, typed: string): InlineMarkdownMatch | null {
  if (typed !== ')') return null;

  const found = /\[([^[\]]+)\]\(([^()\s]+)$/.exec(text);

  if (!found || !isSafeUrl(found[2]) || found[1].includes(FORMULA_CHAR)) return null;

  return {
    start: found.index,
    open: 1,
    close: text.length - (found.index + 1 + found[1].length),
    length: found[1].length,
    attributes: { link: found[2] },
  };
}

/**
 * Строчная Markdown-разметка, которая закрылась только что набранным символом: `**жирный**`, `__жирный__`,
 * `*курсив*`, `_курсив_`, `~~зачёркнутый~~`, `` `код` `` и `[текст](адрес)`. `text` — текст блока до курсора,
 * `typed` — набранный символ (он ещё не вставлен). Разметка срабатывает, если внутри есть текст и нет пробела по краям
 * (кроме кода), поэтому `2 * 3 * 4` и `snake_case_name` остаются как есть.
 */
export function matchInlineMarkdown(text: string, typed: string): InlineMarkdownMatch | null {
  return matchLink(text, typed) ?? matchMarker(text, typed);
}
