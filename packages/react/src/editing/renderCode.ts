import type { HighlightToken } from '../code/types';

const TOKEN_TYPE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Приводит токены подсветчика к безопасному виду: границы внутри текста, без пересечений и пустых токенов,
 * тип — короткое имя из строчных букв, цифр и дефисов (он попадает в атрибут разметки). Порядок не важен.
 */
export function normalizeTokens(
  tokens: readonly HighlightToken[],
  length: number,
): HighlightToken[] {
  const valid = tokens
    .filter(
      (token) =>
        Number.isInteger(token.from) &&
        Number.isInteger(token.to) &&
        token.from >= 0 &&
        token.to <= length &&
        token.from < token.to &&
        TOKEN_TYPE.test(token.type),
    )
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const result: HighlightToken[] = [];
  let end = 0;

  for (const token of valid) {
    if (token.from >= end) {
      result.push(token);
      end = token.to;
    }
  }

  return result;
}

/**
 * Рисует текст блока кода с подсветкой: токены становятся `<span data-inkbrick-token="тип">`, остальное — текстовые узлы.
 * Текст в DOM всегда равен тексту модели (подсветка только оборачивает его), поэтому смещения курсора и выделения
 * считаются как обычно. Как и в `renderInline`, пустой блок и завершающий перевод строки получают `<br>`.
 */
export function renderCode(
  root: HTMLElement,
  text: string,
  tokens: readonly HighlightToken[],
): void {
  const doc = globalThis.document;
  const fragment = doc.createDocumentFragment();
  let position = 0;

  for (const token of normalizeTokens(tokens, text.length)) {
    if (token.from > position)
      fragment.appendChild(doc.createTextNode(text.slice(position, token.from)));

    const span = doc.createElement('span');

    span.setAttribute('data-inkbrick-token', token.type);
    span.textContent = text.slice(token.from, token.to);
    fragment.appendChild(span);
    position = token.to;
  }

  if (position < text.length) fragment.appendChild(doc.createTextNode(text.slice(position)));

  if (text === '' || text.endsWith('\n')) fragment.appendChild(doc.createElement('br'));

  root.replaceChildren(fragment);
}
