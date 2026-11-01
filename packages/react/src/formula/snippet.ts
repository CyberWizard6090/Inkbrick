import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Метка места курсора в шаблоне: удаляется при вставке; выделенный текст подставляется на её место. */
export const CARET = '⌖';

export interface SnippetResult {
  readonly value: string;
  readonly caret: number;
}

/**
 * Вставляет шаблон в текст поля на место выделения `[start, end)`. Выделенный текст подставляется на место метки `⌖`
 * (так `x` + «√» даёт `\sqrt{x}`), курсор встаёт на метку (после подставленного текста) или в конец шаблона.
 */
export function applySnippet(
  value: string,
  start: number,
  end: number,
  snippet: string,
): SnippetResult {
  const from = Math.max(0, Math.min(start, end, value.length));
  const to = Math.max(from, Math.min(Math.max(start, end), value.length));
  const selected = value.slice(from, to);
  const marker = snippet.indexOf(CARET);
  const body = snippet.split(CARET).join('');

  if (marker < 0) {
    return { value: value.slice(0, from) + body + value.slice(to), caret: from + body.length };
  }

  const before = snippet.slice(0, marker).split(CARET).join('');
  const after = snippet
    .slice(marker + 1)
    .split(CARET)
    .join('');
  const inserted = before + selected + after;

  return {
    value: value.slice(0, from) + inserted + value.slice(to),
    caret: from + before.length + selected.length,
  };
}

export function useSnippetInsert(
  field: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (value: string) => void,
) {
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = field.current;

    if (caret.current === null || !element) return;

    element.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [field, value]);

  return (snippet: string) => {
    const element = field.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const result = applySnippet(value, start, end, snippet);

    caret.current = result.caret;
    setValue(result.value);
    element?.focus();
  };
}
