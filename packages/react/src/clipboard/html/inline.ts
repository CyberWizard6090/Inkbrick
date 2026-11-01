import { type InlineNode, normalizeInlineNodes } from '@inkbrick/document';
import { attributesOf, isHidden, styleOf } from './style';
import { BLOCK_TAGS, MAX_DEPTH, SKIP_TAGS, type Style, tagOf } from './tags';

/** Приводит к виду, который показал бы браузер: сворачивает пробелы между узлами, обрезает края. */
export function cleanInline(nodes: InlineNode[], preserve = false): InlineNode[] {
  if (preserve) return normalizeInlineNodes(nodes.filter((n) => n.insert.length > 0));

  const cleaned: InlineNode[] = [];
  let previousSpace = true; // пробелы в начале блока отбрасываем

  for (const node of nodes) {
    let text = '';

    for (const ch of node.insert.replace(/\u00a0/g, ' ')) {
      if (ch === '\n') {
        text = text.replace(/ $/, '') + ch;
        previousSpace = true;
      } else if (/\s/.test(ch)) {
        if (!previousSpace) text += ' ';
        previousSpace = true;
      } else {
        text += ch;
        previousSpace = false;
      }
    }

    if (text)
      cleaned.push({ insert: text, ...(node.attributes ? { attributes: node.attributes } : {}) });
  }

  while (cleaned.length > 0) {
    const last = cleaned[cleaned.length - 1];
    const trimmed = last.insert.replace(/[ \n]+$/, '');

    if (trimmed === '') cleaned.pop();
    else {
      last.insert = trimmed;
      break;
    }
  }

  while (cleaned.length > 0 && /^\n+/.test(cleaned[0].insert)) {
    cleaned[0].insert = cleaned[0].insert.replace(/^\n+/, '');
    if (cleaned[0].insert === '') cleaned.shift();
  }

  return normalizeInlineNodes(cleaned);
}

export function inlineOf(
  node: Node,
  style: Style,
  out: InlineNode[],
  depth: number,
  preserve = false,
): void {
  if (depth > MAX_DEPTH) return;

  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? '';
    const text = preserve ? raw : raw.replace(/[\t\n\r\f ]+/g, ' ');
    const attributes = attributesOf(style);

    if (text) out.push({ insert: text, ...(attributes ? { attributes } : {}) });
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as HTMLElement;

  if (SKIP_TAGS.has(tagOf(element)) || isHidden(element)) return;

  // Номера/маркеры Word (`mso-list:Ignore`) — не текст.
  if (/mso-list:\s*ignore/i.test(element.getAttribute('style') ?? '')) return;

  if (tagOf(element) === 'BR') {
    out.push({ insert: '\n' });
    return;
  }

  const next = styleOf(element, style);
  const isBlock = BLOCK_TAGS.has(tagOf(element));

  // Блочный элемент внутри inline-контекста (абзацы внутри пункта списка) отделяется переводом строки.
  if (isBlock && out.length > 0) out.push({ insert: '\n' });

  element.childNodes.forEach((child) => inlineOf(child, next, out, depth + 1, preserve));

  if (isBlock) out.push({ insert: '\n' });
}
