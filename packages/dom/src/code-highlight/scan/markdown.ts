import { type Emit, lineEnd } from './shared';

const MARKDOWN_INLINE = /`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]*\]\([^)\n]*\)/g;

export function scanMarkdown(code: string, start: number, end: number, emit: Emit) {
  let inFence = false;
  let lineStart = start;

  while (lineStart <= end) {
    const stop = lineEnd(code, lineStart, end);
    const line = code.slice(lineStart, stop);

    if (/^\s*(```|~~~)/.test(line)) {
      emit(lineStart, stop, 'meta');
      inFence = !inFence;
    } else if (inFence) {
      emit(lineStart, stop, 'string');
    } else if (/^#{1,6}\s/.test(line)) {
      emit(lineStart, stop, 'keyword');
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      emit(lineStart, stop, 'meta');
    } else {
      let offset = 0;
      const marker = /^\s*(?:>|[-*+]\s|\d+[.)]\s)/.exec(line);

      if (marker) {
        const length = marker[0].trimEnd().length;

        emit(
          lineStart + marker[0].length - marker[0].trimStart().length,
          lineStart + length,
          'keyword',
        );
        offset = marker[0].length;
      }

      MARKDOWN_INLINE.lastIndex = offset;

      for (let match = MARKDOWN_INLINE.exec(line); match; match = MARKDOWN_INLINE.exec(line)) {
        const from = lineStart + match.index;
        const text = match[0];

        if (text.startsWith('[')) {
          const split = text.indexOf('](');

          emit(from, from + split + 1, 'function');
          emit(from + split + 1, from + text.length, 'string');
        } else {
          emit(from, from + text.length, text.startsWith('`') ? 'string' : 'keyword');
        }
      }
    }

    if (stop >= end) break;

    lineStart = stop + 1;
  }
}
