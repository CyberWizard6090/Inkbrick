import { type InlineNode, isSafeImageUrl, normalizeInlineNodes } from '@inkbrick/document';
import type { FragmentBlock } from '@inkbrick/engine';
import { cleanInline, inlineOf } from './inline';
import { isHidden, styleOf } from './style';
import { BLOCK_TAGS, MAX_DEPTH, SKIP_TAGS, type Style, tagOf } from './tags';

interface Item {
  block: FragmentBlock;
  level: number;
}

/** Адрес картинки из вставленного HTML: только абсолютные http(s) и data:-адреса (относительные пути чужого сайта бессмысленны). */
function pastedImageSrc(src: string | null): string | null {
  const value = (src ?? '').trim();

  return value !== '' && !value.startsWith('/') && isSafeImageUrl(value) ? value : null;
}

function imageBlock(img: Element, caption = ''): FragmentBlock | null {
  const src = pastedImageSrc(img.getAttribute('src'));

  if (!src) return null;

  return block('block:image', [], {
    src,
    alt: (img.getAttribute('alt') ?? '').slice(0, 1000),
    caption: caption.slice(0, 2000),
  });
}

const block = (
  flavour: string,
  content: InlineNode[],
  props: Record<string, unknown> = {},
): FragmentBlock => ({
  flavour,
  props,
  content,
  children: [],
});

/** Есть ли внутри блочный элемент. Обход в глубину с выходом на первом совпадении, без рекурсии. */
function hasBlockDescendant(element: Element): boolean {
  const stack: Element[] = [];

  for (let child = element.lastElementChild; child; child = child.previousElementSibling)
    stack.push(child);

  while (stack.length > 0) {
    const current = stack.pop()!;
    const tag = tagOf(current);

    if (BLOCK_TAGS.has(tag) && !SKIP_TAGS.has(tag)) return true;

    for (let child = current.lastElementChild; child; child = child.previousElementSibling)
      stack.push(child);
  }

  return false;
}

function wordListLevel(element: HTMLElement): number | null {
  const style = element.getAttribute('style') ?? '';
  const match = /mso-list:[^;]*level(\d+)/i.exec(style);

  if (match) return Number(match[1]);

  return /^MsoListParagraph/i.test(element.className) ? 1 : null;
}

function wordListMarker(element: HTMLElement): string {
  for (const span of element.querySelectorAll('span')) {
    if (/mso-list:\s*ignore/i.test(span.getAttribute('style') ?? '')) return span.textContent ?? '';
  }

  return '';
}

function listItems(
  list: HTMLElement,
  ordered: boolean,
  style: Style,
  depth: number,
): FragmentBlock[] {
  const result: FragmentBlock[] = [];

  for (const child of Array.from(list.children) as HTMLElement[]) {
    if (SKIP_TAGS.has(tagOf(child)) || isHidden(child)) continue;

    // <ul><ul>…</ul></ul> (Google Docs): вложенный список без пункта-родителя — потомок предыдущего пункта.
    if (tagOf(child) === 'UL' || tagOf(child) === 'OL') {
      const nested = listItems(child, tagOf(child) === 'OL', style, depth + 1);
      const parent = result[result.length - 1];

      if (parent) parent.children.push(...nested);
      else result.push(...nested);
      continue;
    }

    if (tagOf(child) !== 'LI') continue;

    const content: InlineNode[] = [];
    const children: FragmentBlock[] = [];
    const itemStyle = styleOf(child, style);

    const checkbox = child.querySelector(
      ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
    ) as HTMLInputElement | null;
    const todo = !!checkbox || /task-list-item/.test(child.className);

    child.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;

        if (tagOf(element) === 'UL' || tagOf(element) === 'OL') {
          children.push(...listItems(element, tagOf(element) === 'OL', itemStyle, depth + 1));
          return;
        }
      }

      inlineOf(node, itemStyle, content, depth + 1);
    });

    const props: Record<string, unknown> = { type: todo ? 'todo' : ordered ? 'ordered' : 'bullet' };

    if (todo) props.checked = !!checkbox?.checked || checkbox?.hasAttribute('checked') === true;

    const item = block('block:list', cleanInline(content), props);
    item.children = children;
    result.push(item);
  }

  return result;
}

function pushWordItem(
  out: FragmentBlock[],
  stack: Item[],
  item: FragmentBlock,
  level: number,
): void {
  while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();

  const parent = stack[stack.length - 1];

  if (parent) parent.block.children.push(item);
  else out.push(item);

  stack.push({ block: item, level });
}

export function collect(container: Node, style: Style, out: FragmentBlock[], depth: number): void {
  if (depth > MAX_DEPTH) return;

  let run: InlineNode[] = [];
  let wordStack: Item[] = [];

  const flush = () => {
    const content = cleanInline(run);

    if (content.length > 0) out.push(block('block:paragraph', content));

    run = [];
  };

  const endWordList = () => {
    wordStack = [];
  };

  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      inlineOf(node, style, run, depth + 1);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;

    if (SKIP_TAGS.has(tagOf(element)) || isHidden(element)) return;

    const tag = tagOf(element);
    const next = styleOf(element, style);

    const level = tag === 'P' ? wordListLevel(element) : null;

    if (level !== null) {
      flush();

      const marker = wordListMarker(element).trim();
      const content: InlineNode[] = [];

      element.childNodes.forEach((child) => inlineOf(child, next, content, depth + 1));

      pushWordItem(
        out,
        wordStack,
        block('block:list', cleanInline(content), {
          type: /^(\d+|[a-z]|[ivxlc]+)[.)]/i.test(marker) ? 'ordered' : 'bullet',
        }),
        level,
      );
      return;
    }

    endWordList();

    if (/^H[1-6]$/.test(tag)) {
      flush();

      const content: InlineNode[] = [];
      element.childNodes.forEach((child) => inlineOf(child, next, content, depth + 1));

      const cleaned = cleanInline(content);

      if (cleaned.length > 0) out.push(block('block:heading', cleaned, { level: Number(tag[1]) }));
      return;
    }

    if (tag === 'IMG') {
      flush();

      const image = imageBlock(element);

      if (image) out.push(image);
      return;
    }

    switch (tag) {
      case 'FIGURE': {
        const img = element.querySelector('img');

        if (img) {
          flush();

          const caption = (element.querySelector('figcaption')?.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim();
          const image = imageBlock(img, caption);

          if (image) out.push(image);
          return;
        }
        break;
      }

      case 'ASIDE': {
        const tone = element.getAttribute('data-callout');

        if (tone !== null) {
          flush();

          const content: InlineNode[] = [];
          element.childNodes.forEach((child) => inlineOf(child, next, content, depth + 1));
          const cleaned = cleanInline(content);

          if (cleaned.length > 0) {
            out.push(
              block(
                'block:callout',
                cleaned,
                /^(info|warning|success|danger)$/.test(tone) ? { tone } : {},
              ),
            );
          }
          return;
        }
        break;
      }

      case 'UL':
      case 'OL':
        flush();
        out.push(...listItems(element, tag === 'OL', next, depth + 1));
        return;

      case 'LI':
        flush();
        out.push(
          ...listItems(element.parentElement ?? element, false, next, depth + 1).slice(0, 1),
        );
        return;

      case 'PRE': {
        flush();

        const code = element.querySelector('code');
        const language =
          /language-([\w+#-]+)/.exec(code?.className ?? element.className)?.[1] ??
          element.getAttribute('data-language') ??
          'plain';
        const text = (element.textContent ?? '').replace(/\n$/, '');

        out.push(block('block:code', text ? [{ insert: text }] : [], { language }));
        return;
      }

      case 'HR':
        flush();
        out.push(block('block:divider', []));
        return;

      case 'BLOCKQUOTE': {
        flush();

        if (hasBlockDescendant(element)) {
          const inner: FragmentBlock[] = [];
          collect(element, next, inner, depth + 1);

          out.push(
            ...inner.map((b) =>
              b.flavour === 'block:paragraph' ? { ...b, flavour: 'block:quote' } : b,
            ),
          );
        } else {
          const content: InlineNode[] = [];
          element.childNodes.forEach((child) => inlineOf(child, next, content, depth + 1));
          const cleaned = cleanInline(content);

          if (cleaned.length > 0) out.push(block('block:quote', cleaned));
        }
        return;
      }

      case 'TABLE': {
        flush();

        // Таблиц в Inkbrick нет: каждая строка — абзац, ячейки через табуляцию.
        element.querySelectorAll('tr').forEach((row) => {
          const cells: InlineNode[] = [];

          row.querySelectorAll(':scope > td, :scope > th').forEach((cell, index) => {
            const content: InlineNode[] = [];

            if (index > 0) cells.push({ insert: '\t' });
            cell.childNodes.forEach((child) => inlineOf(child, next, content, depth + 1));
            cells.push(...cleanInline(content));
          });

          const cleaned = normalizeInlineNodes(cells);

          if (cleaned.length > 0) out.push(block('block:paragraph', cleaned));
        });
        return;
      }
    }

    /*
     * Любой контейнер с блочными потомками (в том числе обёртка Google Docs `<b style="font-weight:normal">`)
     * разбираем по блокам, сохраняя унаследованный стиль.
     */
    if (hasBlockDescendant(element)) {
      flush();
      collect(element, next, out, depth + 1);
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      flush();

      const content: InlineNode[] = [];
      element.childNodes.forEach((child) => inlineOf(child, next, content, depth + 1));
      const cleaned = cleanInline(content);

      if (cleaned.length > 0) out.push(block('block:paragraph', cleaned));

      element.querySelectorAll('img').forEach((img) => {
        const image = imageBlock(img);

        if (image) out.push(image);
      });
      return;
    }

    inlineOf(element, style, run, depth + 1);
  });

  flush();
}
