import type { InlineNode, TextAttributes } from '../../model';
import { FORMULA_CHAR, MAX_FORMULA_LENGTH } from '../../utils/formula';
import { normalizeLinkUrl } from '../../utils/url';

import {
  MAX_DESTINATION,
  MAX_EMPHASIS_DEPTH,
  MAX_INLINE_LEVEL,
  PUNCTUATION,
  unescapeMarkdown,
  type Ctx,
} from './context';
/** Разбор inline-разметки Markdown: `**`, `*`, `~~`, `` ` ``, ссылки, `<u>`, формулы `$…$`, сноски `[^1]`. */

export const BOLD = 1;
export const ITALIC = 2;
export const STRIKE = 4;

/** Текст, готовые узлы (код, ссылка, формула…) или серия `*`/`_`/`~~`, которая ещё может стать выделением. */
export type Token =
  | { k: 't'; s: string; m: number }
  | { k: 'n'; nodes: InlineNode[]; m: number }
  | { k: 'd'; ch: string; n: number; open: boolean; close: boolean; m: number };

export const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);
export const isPunct = (char: string | undefined) =>
  char !== undefined && /[\p{P}\p{S}]/u.test(char);

/** Положение серии `*`, `_`, `~~` между символами `prev` и `next` (правила CommonMark о «флангах»). */
export function flanking(ch: string, prev: string | undefined, next: string | undefined) {
  const left = !isSpace(next) && (!isPunct(next) || isSpace(prev) || isPunct(prev));
  const right = !isSpace(prev) && (!isPunct(prev) || isSpace(next) || isPunct(next));

  return ch === '_'
    ? { open: left && (!right || isPunct(prev)), close: right && (!left || isPunct(next)) }
    : { open: left, close: right };
}

/** Адрес ссылки в `(...)` начиная с `from`: сам адрес и позиция после `)`; `null` — это не ссылка. */
/** Строка, для которой посчитаны `stops`, и для каждой позиции — первый пробельный символ или `)` не раньше неё. */
let stopsOf: string | undefined;
let stops: Int32Array | undefined;

/**
 * Конец адреса без угловых скобок, начатого в `start`: первый пробел или `)`, но не дальше `MAX_DESTINATION`. Позиции
 * считаются один раз на строку: иначе абзац из тысяч `[a](` без закрывающей скобки просматривался бы заново от каждой
 * (по `MAX_DESTINATION` символов на скобку).
 */
function bareDestinationEnd(s: string, start: number): number {
  if (stopsOf !== s || !stops) {
    stops = new Int32Array(s.length + 1);
    stops[s.length] = s.length;
    for (let i = s.length - 1; i >= 0; i--) stops[i] = /[\s)]/.test(s[i]) ? i : stops[i + 1];
    stopsOf = s;
  }

  return Math.min(stops[start], start + MAX_DESTINATION + 1, s.length);
}

export function destination(s: string, from: number): { url: string; end: number } | null {
  let p = from;

  while (s[p] === ' ') p++;

  let url: string;

  if (s[p] === '<') {
    const close = s.indexOf('>', p);

    if (close < 0 || close - p > MAX_DESTINATION) return null;

    url = s.slice(p + 1, close);
    p = close + 1;
  } else {
    const start = p;

    p = bareDestinationEnd(s, start);
    url = s.slice(start, p);
  }

  while (s[p] === ' ') p++;

  if (s[p] === '"' || s[p] === "'") {
    const close = s.indexOf(s[p], p + 1);

    if (close < 0 || close - p > MAX_DESTINATION) return null;

    p = close + 1;

    while (s[p] === ' ') p++;
  }

  return s[p] === ')' ? { url: unescapeMarkdown(url), end: p + 1 } : null;
}

export function tokenize(ctx: Ctx, s: string, level: number): Token[] {
  const out: Token[] = [];
  let buffer = '';
  let brackets: Map<number, number> | undefined;

  const flush = () => {
    if (buffer !== '') out.push({ k: 't', s: buffer, m: 0 });
    buffer = '';
  };
  const push = (nodes: InlineNode[]) => {
    flush();
    out.push({ k: 'n', nodes, m: 0 });
  };
  // Позиции закрывающих разделителей считаются один раз; запрашиваются они по возрастанию, поэтому разбор линеен.
  const cursor = (pattern: RegExp) => {
    let list: number[] | undefined;
    let p = 0;

    return (from: number) => {
      list ??= Array.from(s.matchAll(pattern), (match) => match.index);

      while (p < list.length && list[p] < from) p++;

      return list[p] ?? -1;
    };
  };
  const nextUnderlineEnd = cursor(/<\/u>/gi);
  const nextParenEnd = cursor(/\\\)/g);
  const closingBracket = (open: number) => {
    if (!brackets) {
      brackets = new Map();

      const stack: number[] = [];

      for (let p = 0; p < s.length; p++) {
        if (s[p] === '\\') p++;
        else if (s[p] === '[') stack.push(p);
        else if (s[p] === ']' && stack.length > 0) brackets.set(stack.pop()!, p);
      }
    }

    return brackets.get(open) ?? -1;
  };
  const formula = (latex: string): InlineNode[] =>
    latex !== '' && latex.length <= MAX_FORMULA_LENGTH
      ? [{ insert: FORMULA_CHAR, attributes: { formula: latex } }]
      : [];

  for (let i = 0; i < s.length;) {
    const c = s[i];

    if (c === '\\') {
      const x = s[i + 1];
      const end = x === '(' && ctx.formulas ? nextParenEnd(i + 2) : -1;
      const math = end < 0 ? [] : formula(s.slice(i + 2, end).trim());

      if (math.length > 0) {
        push(math);
        i = end + 2;
      } else if (x === '\n') {
        buffer += '\n';
        i += 2;
      } else if (x !== undefined && PUNCTUATION.test(x)) {
        buffer += x;
        i += 2;
      } else {
        buffer += c;
        i++;
      }
    } else if (c === '`') {
      let n = 1;

      while (s[i + n] === '`') n++;

      // Закрывает код серия ровно такой же длины.
      let close = -1;

      for (let from = i + n; close < 0;) {
        const found = s.indexOf('`', from);

        if (found < 0) break;

        let end = found;

        while (s[end] === '`') end++;

        if (end - found === n) close = found;
        else from = end;
      }

      if (close < 0) {
        buffer += s.slice(i, i + n);
        i += n;
      } else {
        let code = s.slice(i + n, close);

        // Один пробел с каждой стороны — отступ от ограничителя (`` `a` `` → «`a`»), если код не из одних пробелов.
        if (/^ .* $/s.test(code) && code.trim() !== '') code = code.slice(1, -1);

        push([{ insert: code, attributes: { code: true } }]);
        i = close + n;
      }
    } else if (c === '[') {
      const close = closingBracket(i);
      const reference = ctx.footnotes ? /^\[\^([\w-]{1,64})\]/.exec(s.slice(i, i + 70)) : null;
      const target = close > 0 && s[close + 1] === '(' ? destination(s, close + 2) : null;
      const url = target && level < MAX_INLINE_LEVEL ? normalizeLinkUrl(target.url) : null;
      const nodes = url ? inlineNodes(ctx, s.slice(i + 1, close), level + 1) : [];

      if (reference) {
        push([{ insert: FORMULA_CHAR, attributes: { footnote: reference[1] } }]);
        i += reference[0].length;
      } else if (target && url && nodes.length > 0) {
        push(
          nodes.map((node) => ({
            insert: node.insert,
            attributes: { ...node.attributes, link: node.attributes?.link ?? url },
          })),
        );
        i = target.end;
      } else {
        buffer += c;
        i++;
      }
    } else if (c === '$' && ctx.formulas) {
      const close = s.indexOf('$', i + 1);
      const math =
        close > i + 1 &&
        !isSpace(s[i + 1]) &&
        !isSpace(s[close - 1]) &&
        !/\d/.test(s[close + 1] ?? '')
          ? formula(s.slice(i + 1, close))
          : [];

      if (math.length > 0) {
        push(math);
        i = close + 1;
      } else {
        buffer += c;
        i++;
      }
    } else if (c === '<') {
      const end =
        /^<u>/i.test(s.slice(i, i + 3)) && level < MAX_INLINE_LEVEL ? nextUnderlineEnd(i + 3) : -1;
      const br = /^<br\s{0,3}\/?>/i.exec(s.slice(i, i + 9));

      if (end >= 0) {
        push(
          inlineNodes(ctx, s.slice(i + 3, end), level + 1).map((node) => ({
            insert: node.insert,
            attributes: { ...node.attributes, underline: true },
          })),
        );
        i = end + 4;
      } else if (br) {
        buffer += '\n';
        i += br[0].length;
      } else {
        buffer += c;
        i++;
      }
    } else if (c === '*' || c === '_' || c === '~') {
      let j = i;

      while (s[j] === c) j++;

      if (c === '~' && j - i !== 2) {
        buffer += s.slice(i, j);
      } else {
        flush();
        out.push({ k: 'd', ch: c, n: j - i, ...flanking(c, s[i - 1], s[j]), m: 0 });
      }

      i = j;
    } else {
      buffer += c;
      i++;
    }
  }

  flush();

  return out;
}

/** Выделение по CommonMark: пары серий `*`/`_`/`~~` помечают токены между собой (жирный, курсив, зачёркнутый). */
export function emphasize(tokens: Token[]): void {
  const openers: number[] = [];
  let budget = 64 * tokens.length + 10_000;

  tokens.forEach((token, index) => {
    if (token.k !== 'd') return;

    while (token.close && token.n > 0) {
      let found = -1;

      // Просматриваются только ближайшие серии: в обычном тексте их единицы, а входу из тысяч `*` это не даст замедлиться.
      for (let o = openers.length - 1; o >= 0 && openers.length - o <= MAX_EMPHASIS_DEPTH; o--) {
        const opener = tokens[openers[o]] as Extract<Token, { k: 'd' }>;

        if (opener.ch !== token.ch || opener.n === 0) continue;

        // Правило «кратности трёх»: серия, которая может и открывать, и закрывать, не парна неподходящей по длине.
        if (
          token.ch !== '~' &&
          (token.open || opener.close) &&
          (opener.n + token.n) % 3 === 0 &&
          !(opener.n % 3 === 0 && token.n % 3 === 0)
        )
          continue;

        found = o;
        break;
      }

      // Бюджет на разметку токенов: длинная серия `*`, закрываемая много раз, иначе давала бы квадратичное время.
      if (found < 0) break;

      budget -= index - openers[found];

      if (budget < 0) break;

      const opener = tokens[openers[found]] as Extract<Token, { k: 'd' }>;
      const use = token.ch === '~' ? 2 : token.n >= 2 && opener.n >= 2 ? 2 : 1;
      const mark = token.ch === '~' ? STRIKE : use === 2 ? BOLD : ITALIC;

      for (let t = openers[found] + 1; t < index; t++) tokens[t].m |= mark;

      opener.n -= use;
      token.n -= use;
      openers.length = opener.n > 0 ? found + 1 : found;
    }

    if (token.n > 0 && token.open && openers.length < MAX_EMPHASIS_DEPTH) openers.push(index);
  });
}

export const sameAttributes = (a?: TextAttributes, b?: TextAttributes) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Склеивает токены в узлы; соседние узлы с одинаковым форматированием сливаются (формулы и сноски — нет). */
export function flatten(tokens: Token[]): InlineNode[] {
  const out: InlineNode[] = [];

  for (const token of tokens) {
    const parts: InlineNode[] =
      token.k === 'n'
        ? token.nodes
        : [{ insert: token.k === 't' ? token.s : token.ch.repeat(token.n) }];

    for (const part of parts) {
      if (part.insert === '') continue;

      const { bold, italic, strike, underline, code, link, formula, footnote } =
        part.attributes ?? {};
      const attributes: TextAttributes = {};

      // Код не оформляется (`CODE_EXCLUDED_ATTRIBUTES`): `**`x`**` — просто код.
      if (code) attributes.code = true;
      else {
        if (token.m & BOLD || bold) attributes.bold = true;
        if (token.m & ITALIC || italic) attributes.italic = true;
        if (token.m & STRIKE || strike) attributes.strike = true;
        if (underline) attributes.underline = true;
      }
      if (link !== undefined) attributes.link = link;
      if (formula !== undefined) attributes.formula = formula;
      if (footnote !== undefined) attributes.footnote = footnote;

      const merged = Object.keys(attributes).length > 0 ? attributes : undefined;
      const previous = out[out.length - 1];

      if (
        previous &&
        formula === undefined &&
        footnote === undefined &&
        sameAttributes(previous.attributes, merged)
      )
        previous.insert += part.insert;
      else out.push(merged ? { insert: part.insert, attributes: merged } : { insert: part.insert });
    }
  }

  return out;
}

export function inlineNodes(ctx: Ctx, text: string, level: number): InlineNode[] {
  const tokens = tokenize(ctx, text, level);

  emphasize(tokens);

  return flatten(tokens);
}

export const inline = (ctx: Ctx, text: string) => inlineNodes(ctx, text, 0);
