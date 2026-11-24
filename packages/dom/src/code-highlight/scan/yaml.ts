import { LANGUAGES } from '../languages';
import { scanGeneric } from './generic';
import { type Emit, lineEnd } from './shared';

const YAML_KEY = /^(\s*(?:-\s+)*)("[^"]*"|'[^']*'|[^\s#:'"[\]{},&*!|>-][^#:]*?)\s*:(?=\s|$)/;

export function scanYaml(code: string, start: number, end: number, emit: Emit) {
  let lineStart = start;

  while (lineStart <= end) {
    const stop = lineEnd(code, lineStart, end);
    const line = code.slice(lineStart, stop);

    if (/^(---|\.\.\.)\s*$/.test(line)) {
      emit(lineStart, stop, 'meta');
    } else {
      const key = YAML_KEY.exec(line);
      let restStart = lineStart;

      if (key) {
        const keyFrom = lineStart + key[1].length;

        emit(keyFrom, keyFrom + key[2].length, 'property');
        restStart = lineStart + key[0].length;
      }

      scanGeneric(code, LANGUAGES.yaml, restStart, stop, emit);
    }

    if (stop >= end) break;

    lineStart = stop + 1;
  }
}
