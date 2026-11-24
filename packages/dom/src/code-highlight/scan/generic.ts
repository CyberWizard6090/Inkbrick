import type { LanguageDef } from '../languages';
import type { HighlightTokenType } from '../types';
import {
  CHAR_LITERAL,
  type Emit,
  IDENT,
  LIFETIME,
  NUMBER,
  REGEX_AFTER_WORD,
  STRING_PREFIX,
  isDigit,
  isSpace,
  lineEnd,
  matchAt,
  nextOnLine,
  onlyWhitespaceBefore,
  scanString,
} from './shared';

interface WordSets {
  keywords: ReadonlySet<string>;
  types: ReadonlySet<string>;
  builtins: ReadonlySet<string>;
  constants: ReadonlySet<string>;
}

const setsCache = new WeakMap<LanguageDef, WordSets>();

function wordSets(lang: LanguageDef): WordSets {
  let sets = setsCache.get(lang);

  if (!sets) {
    const make = (list = '') =>
      new Set(
        list
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => (lang.ignoreCase ? word.toLowerCase() : word)),
      );

    sets = {
      keywords: make(lang.keywords),
      types: make(lang.types),
      builtins: make(lang.builtins),
      constants: make(lang.constants),
    };
    setsCache.set(lang, sets);
  }

  return sets;
}

function classify(
  word: string,
  lang: LanguageDef,
  sets: WordSets,
  followedByCall: boolean,
  previousWord: string,
): HighlightTokenType | null {
  const key = lang.ignoreCase ? word.toLowerCase() : word;
  const declared = lang.declarations?.[previousWord];

  if (declared && !sets.keywords.has(key)) return declared;
  if (sets.keywords.has(key)) return 'keyword';
  if (sets.constants.has(key)) return 'constant';
  if (sets.types.has(key)) return 'type';
  if (sets.builtins.has(key)) return 'builtin';
  if (followedByCall) return 'function';
  if (lang.pascalTypes && /^[A-Z]/.test(word) && /[a-z]/.test(word)) return 'type';

  return null;
}

export function scanGeneric(
  code: string,
  lang: LanguageDef,
  start: number,
  end: number,
  emit: Emit,
) {
  const sets = wordSets(lang);
  const quotes = lang.strings ?? '';
  let i = start;
  let previousWord = '';
  /** Последний значимый токен: нужен, чтобы отличить регулярное выражение от деления. */
  let last = '';

  while (i < end) {
    const char = code[i];

    if (isSpace(char)) {
      i++;
      continue;
    }

    const lineMarker = lang.lineComment?.find(
      (marker) =>
        code.startsWith(marker, i) &&
        (!lang.commentAtWordStart || i === start || isSpace(code[i - 1])),
    );

    if (lineMarker) {
      const stop = lineEnd(code, i, end);

      emit(i, stop, 'comment');
      i = stop;
      previousWord = '';
      continue;
    }

    if (lang.blockComment && code.startsWith(lang.blockComment[0], i)) {
      const close = code.indexOf(lang.blockComment[1], i + lang.blockComment[0].length);
      const stop =
        close < 0 || close + lang.blockComment[1].length > end
          ? end
          : close + lang.blockComment[1].length;

      emit(i, stop, 'comment');
      i = stop;
      previousWord = '';
      continue;
    }

    if (lang.preprocessor && char === '#' && onlyWhitespaceBefore(code, i, start)) {
      const stop = lineEnd(code, i, end);

      emit(i, stop, 'meta');
      i = stop;
      previousWord = '';
      continue;
    }

    if (
      lang.rustAttributes &&
      char === '#' &&
      (code[i + 1] === '[' || code.startsWith('![', i + 1))
    ) {
      let depth = 0;
      let stop = i;

      for (; stop < end; stop++) {
        if (code[stop] === '[') depth++;
        else if (code[stop] === ']' && --depth <= 0) {
          stop++;
          break;
        } else if (code[stop] === '\n') break;
      }

      emit(i, stop, 'meta');
      i = stop;
      previousWord = '';
      continue;
    }

    if (lang.lifetimes && char === "'") {
      const literal = matchAt(CHAR_LITERAL, code, i);

      if (literal) {
        emit(i, i + literal.length, 'string');
        i += literal.length;
      } else {
        const lifetime = matchAt(LIFETIME, code, i);

        if (lifetime) emit(i, i + lifetime.length, 'type');
        i += lifetime ? lifetime.length : 1;
      }

      previousWord = '';
      last = 'value';
      continue;
    }

    if (quotes.includes(char)) {
      const triple = lang.triple === true && code.startsWith(char.repeat(3), i);
      const stop = scanString(
        code,
        i,
        end,
        char,
        triple,
        triple || (lang.multiline ?? '').includes(char),
      );
      let type: HighlightTokenType = 'string';

      if (lang.stringKeys && code[nextOnLine(code, stop, end)] === ':') type = 'property';

      emit(i, stop, type);
      i = stop;
      previousWord = '';
      last = 'value';
      continue;
    }

    if (isDigit(char) || (char === '.' && isDigit(code[i + 1]))) {
      const number = matchAt(NUMBER, code, i) ?? char;

      emit(i, i + number.length, 'number');
      i += number.length;
      previousWord = '';
      last = 'value';
      continue;
    }

    if (lang.dollar && char === '$') {
      let stop = i + 1;

      if (code[stop] === '{') {
        const close = code.indexOf('}', stop);

        stop = close < 0 || close >= end ? lineEnd(code, stop, end) : close + 1;
      } else if (/[\w@?#*!$-]/.test(code[stop] ?? '')) {
        const word = matchAt(/\w+|[@?#*!$-]/y, code, stop);

        stop += word ? word.length : 1;
      }

      if (stop > i + 1) emit(i, stop, 'variable');
      i = Math.max(stop, i + 1);
      previousWord = '';
      last = 'value';
      continue;
    }

    if (
      lang.flags &&
      char === '-' &&
      (i === start || isSpace(code[i - 1])) &&
      /[A-Za-z-]/.test(code[i + 1] ?? '')
    ) {
      let stop = i + 1;

      while (stop < end && !isSpace(code[stop]) && code[stop] !== '=') stop++;

      emit(i, stop, 'attribute');
      i = stop;
      previousWord = '';
      continue;
    }

    if (lang.at && char === '@') {
      const name = matchAt(/[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/y, code, i + 1);

      if (name) {
        emit(i, i + 1 + name.length, 'meta');
        i += 1 + name.length;
        previousWord = '';
        continue;
      }
    }

    const word = matchAt(IDENT, code, i);

    if (word) {
      const stop = i + word.length;

      if (
        lang.stringPrefixes &&
        STRING_PREFIX.test(word) &&
        stop < end &&
        quotes.includes(code[stop])
      ) {
        const quote = code[stop];
        const triple = lang.triple === true && code.startsWith(quote.repeat(3), stop);

        const close = scanString(code, stop, end, quote, triple, triple);

        emit(i, close, 'string');
        i = close;
        previousWord = '';
        last = 'value';
        continue;
      }

      if (lang.macros && code[stop] === '!' && code[stop + 1] !== '=') {
        emit(i, stop + 1, 'function');
        i = stop + 1;
        previousWord = '';
        last = 'value';
        continue;
      }

      const followedByCall = code[nextOnLine(code, stop, end)] === '(';
      const type = classify(word, lang, sets, followedByCall, previousWord);

      if (type) emit(i, stop, type);

      previousWord = word;
      last = `word:${word}`;
      i = stop;
      continue;
    }

    if (lang.regex && char === '/') {
      const afterWord = last.startsWith('word:') && REGEX_AFTER_WORD.has(last.slice(5));
      const allowed = last === '' || last.length === 1 || afterWord;

      if (allowed) {
        let stop = i + 1;
        let inClass = false;

        while (stop < end && code[stop] !== '\n') {
          if (code[stop] === '\\') stop++;
          else if (code[stop] === '[') inClass = true;
          else if (code[stop] === ']') inClass = false;
          else if (code[stop] === '/' && !inClass) break;

          stop++;
        }

        if (code[stop] === '/') {
          stop++;

          while (stop < end && /[a-z]/i.test(code[stop])) stop++;

          emit(i, stop, 'regex');
          i = stop;
          previousWord = '';
          last = 'value';
          continue;
        }
      }
    }

    previousWord = '';
    last = char === ')' || char === ']' || char === '}' ? 'value' : char;
    i++;
  }
}
