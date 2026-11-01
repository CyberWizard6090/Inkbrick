import { LANGUAGES } from '../languages';
import { scanCss } from './css';
import { scanGeneric } from './generic';
import { type Emit, isSpace, matchAt } from './shared';

const ENTITY = /&(?:#\d+|#x[\da-fA-F]+|[A-Za-z]\w*);/g;

function emitEntities(code: string, from: number, to: number, emit: Emit) {
  ENTITY.lastIndex = from;

  for (let match = ENTITY.exec(code); match && match.index < to; match = ENTITY.exec(code)) {
    if (match.index + match[0].length <= to)
      emit(match.index, match.index + match[0].length, 'constant');
  }
}

export function scanHtml(code: string, start: number, end: number, emit: Emit) {
  let i = start;

  while (i < end) {
    const open = code.indexOf('<', i);

    if (open < 0 || open >= end) {
      emitEntities(code, i, end, emit);
      return;
    }

    emitEntities(code, i, open, emit);

    if (code.startsWith('<!--', open)) {
      const close = code.indexOf('-->', open + 4);
      const stop = close < 0 || close + 3 > end ? end : close + 3;

      emit(open, stop, 'comment');
      i = stop;
      continue;
    }

    if (code.startsWith('<!', open) || code.startsWith('<?', open)) {
      const close = code.indexOf('>', open);
      const stop = close < 0 || close >= end ? end : close + 1;

      emit(open, stop, 'meta');
      i = stop;
      continue;
    }

    const name = matchAt(/<\/?[A-Za-z][\w:.-]*/y, code, open);

    if (!name) {
      i = open + 1;
      continue;
    }

    emit(open, open + name.length, 'tag');
    i = open + name.length;

    let selfClosing = false;

    while (i < end) {
      while (i < end && isSpace(code[i])) i++;

      if (code[i] === '>') {
        emit(i, i + 1, 'tag');
        i++;
        break;
      }

      if (code.startsWith('/>', i)) {
        emit(i, i + 2, 'tag');
        selfClosing = true;
        i += 2;
        break;
      }

      const attribute = matchAt(/[^\s=<>"'/]+/y, code, i);

      if (!attribute) {
        i++;
        continue;
      }

      emit(i, i + attribute.length, 'attribute');
      i += attribute.length;

      let after = i;

      while (after < end && isSpace(code[after])) after++;

      if (code[after] !== '=') continue;

      after++;

      while (after < end && isSpace(code[after])) after++;

      const quote = code[after];

      if (quote === '"' || quote === "'") {
        const close = code.indexOf(quote, after + 1);
        const stop = close < 0 || close >= end ? end : close + 1;

        emit(after, stop, 'string');
        i = stop;
      } else {
        const value = matchAt(/[^\s>]+/y, code, after);

        if (value) emit(after, after + value.length, 'string');
        i = after + (value ? value.length : 0);
      }
    }

    const tag = name.replace(/^<\/?/, '').toLowerCase();

    if (
      !selfClosing &&
      !name.startsWith('</') &&
      (tag === 'script' || tag === 'style') &&
      i < end
    ) {
      const close = code.toLowerCase().indexOf(`</${tag}`, i);
      const stop = close < 0 || close > end ? end : close;

      if (tag === 'script') scanGeneric(code, LANGUAGES.javascript, i, stop, emit);
      else scanCss(code, i, stop, emit);

      i = stop;
    }
  }
}
