import { type Emit, isDigit, isSpace, matchAt, nextOnLine, scanString } from './shared';

export function scanCss(code: string, start: number, end: number, emit: Emit) {
  let i = start;
  let depth = 0;
  let expectProperty = false;

  while (i < end) {
    const char = code[i];

    if (isSpace(char)) {
      i++;
      continue;
    }

    if (code.startsWith('/*', i)) {
      const close = code.indexOf('*/', i + 2);
      const stop = close < 0 || close + 2 > end ? end : close + 2;

      emit(i, stop, 'comment');
      i = stop;
      continue;
    }

    if (char === '"' || char === "'") {
      const stop = scanString(code, i, end, char, false, false);

      emit(i, stop, 'string');
      i = stop;
      continue;
    }

    if (char === '{') {
      depth++;
      expectProperty = true;
      i++;
      continue;
    }

    if (char === '}') {
      depth = Math.max(0, depth - 1);
      expectProperty = depth > 0;
      i++;
      continue;
    }

    if (char === ';') {
      expectProperty = depth > 0;
      i++;
      continue;
    }

    if (char === '@') {
      const name = matchAt(/@[\w-]+/y, code, i);

      if (name) {
        emit(i, i + name.length, 'keyword');
        i += name.length;
        continue;
      }
    }

    const inValue = depth > 0 && !expectProperty;

    if (inValue) {
      const hex = matchAt(/#[\da-fA-F]{3,8}\b/y, code, i);

      if (hex) {
        emit(i, i + hex.length, 'number');
        i += hex.length;
        continue;
      }

      const number = matchAt(/-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/y, code, i);

      if (number && (isDigit(char) || char === '.' || char === '-')) {
        emit(i, i + number.length, 'number');
        i += number.length;
        continue;
      }

      if (code.startsWith('!important', i)) {
        emit(i, i + 10, 'keyword');
        i += 10;
        continue;
      }

      const word = matchAt(/[A-Za-z_-][\w-]*/y, code, i);

      if (word) {
        if (code[nextOnLine(code, i + word.length, end)] === '(')
          emit(i, i + word.length, 'function');
        i += word.length;
        continue;
      }

      i++;
      continue;
    }

    if (depth > 0 && expectProperty) {
      const property = matchAt(/-{0,2}[A-Za-z_][\w-]*(?=\s*:(?!:))/y, code, i);

      if (property && !isNestedSelector(code, i + property.length, end)) {
        emit(i, i + property.length, 'property');
        i += property.length;
        expectProperty = false;
        continue;
      }
    }

    const classOrId = matchAt(/[.#][\w-]+/y, code, i);

    if (classOrId) {
      emit(i, i + classOrId.length, 'function');
      i += classOrId.length;
      continue;
    }

    const pseudo = matchAt(/::?[\w-]+/y, code, i);

    if (pseudo) {
      emit(i, i + pseudo.length, 'keyword');
      i += pseudo.length;
      continue;
    }

    if (char === '[') {
      const close = code.indexOf(']', i);
      const stop = close < 0 || close >= end ? end : close + 1;

      emit(i, stop, 'attribute');
      i = stop;
      continue;
    }

    const tag = matchAt(/[A-Za-z][\w-]*/y, code, i);

    if (tag) {
      emit(i, i + tag.length, 'tag');
      i += tag.length;
      continue;
    }

    i++;
  }
}

function isNestedSelector(code: string, from: number, end: number): boolean {
  const colon = code.indexOf(':', from);

  if (colon < 0 || colon >= end) return false;

  const brace = code.indexOf('{', colon);
  const semicolon = code.indexOf(';', colon);
  const newline = code.indexOf('\n', colon);

  return (
    brace >= 0 &&
    brace < end &&
    (semicolon < 0 || brace < semicolon) &&
    (newline < 0 || brace < newline)
  );
}
