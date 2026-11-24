import type { HighlightTokenType } from '../types';

export type Emit = (from: number, to: number, type: HighlightTokenType) => void;

export const IDENT = /[A-Za-z_$À-￿][\w$À-￿]*/y;
export const NUMBER =
  /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]+)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;
export const CHAR_LITERAL = /'(?:\\.|[^'\\\n])'/y;
export const LIFETIME = /'[A-Za-z_]\w*/y;
export const STRING_PREFIX = /^[rRbBfFuU]{1,3}$/;
export const REGEX_AFTER_WORD = new Set(
  'return typeof case delete void throw in of new else do yield await'.split(' '),
);

export const matchAt = (re: RegExp, code: string, at: number): string | null => {
  re.lastIndex = at;

  const match = re.exec(code);

  return match ? match[0] : null;
};

export const isDigit = (char: string | undefined) =>
  char !== undefined && char >= '0' && char <= '9';
export const isSpace = (char: string | undefined) =>
  char === ' ' || char === '\t' || char === '\n' || char === '\r';

export function lineEnd(code: string, from: number, end: number): number {
  const index = code.indexOf('\n', from);

  return index < 0 || index > end ? end : index;
}

export function nextOnLine(code: string, from: number, end: number): number {
  let i = from;

  while (i < end && (code[i] === ' ' || code[i] === '\t')) i++;

  return i;
}

export function onlyWhitespaceBefore(code: string, at: number, start: number): boolean {
  for (let i = at - 1; i >= start && code[i] !== '\n'; i--) {
    if (code[i] !== ' ' && code[i] !== '\t') return false;
  }

  return true;
}

export function scanString(
  code: string,
  start: number,
  end: number,
  quote: string,
  triple: boolean,
  multiline: boolean,
): number {
  const closing = quote.repeat(3);
  let i = start + (triple ? 3 : 1);

  while (i < end) {
    const char = code[i];

    if (char === '\\') {
      i += 2;
      continue;
    }

    if (triple) {
      if (code.startsWith(closing, i)) return i + 3;
    } else if (char === quote) {
      return i + 1;
    } else if (char === '\n' && !multiline) {
      return i;
    }

    i++;
  }

  return end;
}
