import type { Document } from '../document';
import type { BaseBlock, InlineNode } from '../model';
import { isFormulaNode } from '../utils/formula';
import { isSafeImageUrl, isSafeUrl } from '../utils/url';
import {
  buildExportTree,
  groupSiblings,
  headingLevel,
  isOrdered,
  isTodo,
  plainOf,
  stringProp,
  type ExportNode,
  type ExportOptions,
} from './tree';

const escapeText = (text: string) => text.replace(/[\\`*_[\]<>~|]/g, '\\$&');

/** Адрес для `(...)` в Markdown: пробелы и скобки кодируются, чтобы не обрывать ссылку. */
const encodeDestination = (url: string) =>
  url.replace(
    /[\s()<>]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );

const escapeLineStart = (line: string) => line.replace(/^(\s*)([#+\->]|\d+[.)])/, '$1\\$2');

/** Оборачивает только «ядро» текста: пробелы по краям ломают разметку (`** жирный **` не работает). */
function wrap(text: string, open: string, close = open): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;

  return match[2] === '' ? text : `${match[1]}${open}${match[2]}${close}${match[3]}`;
}

function inlineToMarkdown(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      const { insert, attributes } = node;

      if (insert === '') return '';

      if (isFormulaNode(node)) {
        const latex = String(attributes!.formula).trim();
        const wrapped = latex.includes('$') ? `\\(${latex}\\)` : `$${latex}$`;

        return latex === '' ? '' : wrapped.repeat(insert.length);
      }

      let out: string;

      if (attributes?.code) {
        // Код не экранируется; обратные кавычки внутри — более длинным ограничителем.
        const longest = Math.max(0, ...(insert.match(/`+/g) ?? []).map((run) => run.length));
        const fence = '`'.repeat(longest + 1);

        // Пробелы внутри ограничителей нужны, только если код сам начинается/кончается обратной кавычкой.
        const pad = /^`|`$/.test(insert) ? ' ' : '';

        out = wrap(insert, `${fence}${pad}`, `${pad}${fence}`);
      } else {
        out = escapeText(insert).replace(/\n/g, '  \n');
      }

      if (!attributes) return out;

      if (attributes.bold) out = wrap(out, '**');
      if (attributes.italic) out = wrap(out, '*');
      if (attributes.strike) out = wrap(out, '~~');
      if (attributes.underline) out = wrap(out, '<u>', '</u>');

      if (typeof attributes.link === 'string' && isSafeUrl(attributes.link)) {
        out = wrap(out, '[', `](${encodeDestination(attributes.link)})`);
      }

      return out;
    })
    .join('');
}

const TONE_LABEL: Record<string, string> = {
  info: 'NOTE',
  warning: 'WARNING',
  success: 'TIP',
  danger: 'CAUTION',
};

const prefixLines = (text: string, prefix: string) =>
  text
    .split('\n')
    .map((line) => (line === '' ? prefix.trimEnd() : `${prefix}${line}`))
    .join('\n');

const softBreaks = (text: string) => text.replace(/ {2}\n/g, '\n');

/**
 * Markdown (CommonMark + `~~зачёркнутое~~`, чекбоксы `- [ ]` и блоки-предупреждения `> [!NOTE]` как в GitHub).
 * Подчёркивание выводится тегом `<u>`, цвета отбрасываются, небезопасные ссылки и картинки — только текстом.
 */
export function toMarkdown(document: Document, options: ExportOptions = {}): string {
  const { nodes, title } = buildExportTree(document, options);
  const chunks: string[] = title ? [`# ${escapeText(title).replace(/\s*\n\s*/g, ' ')}`] : [];

  const renderBlock = (block: BaseBlock): string => {
    const text = inlineToMarkdown(block.content);

    switch (block.flavour) {
      case 'block:heading':
        return `${'#'.repeat(headingLevel(block))} ${text.replace(/\s*\n\s*/g, ' ')}`;
      case 'block:quote':
        return prefixLines(softBreaks(text), '> ');
      case 'block:callout': {
        const label = TONE_LABEL[stringProp(block, 'tone', 'info')] ?? 'NOTE';

        return prefixLines(`[!${label}]\n${softBreaks(text)}`, '> ');
      }
      case 'block:code': {
        const code = plainOf(block.content);
        const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length));
        const fence = '`'.repeat(longest + 1);
        const language = stringProp(block, 'language', 'plain');
        const info = language === 'plain' ? '' : language.replace(/[^\w+#.-]/g, '');

        return `${fence}${info}\n${code}\n${fence}`;
      }
      case 'block:divider':
        return '---';
      case 'block:formula': {
        const latex = stringProp(block, 'latex').trim();

        return latex === '' ? '' : `$$\n${latex}\n$$`;
      }
      case 'block:image': {
        const src = stringProp(block, 'src');
        const alt = escapeText(stringProp(block, 'alt'));
        const caption = escapeText(stringProp(block, 'caption'));
        const image = isSafeImageUrl(src) ? `![${alt}](${encodeDestination(src)})` : alt;

        return caption ? `${image}\n\n*${caption}*` : image;
      }
      default:
        return text
          .split('\n')
          .map((line, index) => (index === 0 ? escapeLineStart(line) : line))
          .join('\n');
    }
  };

  const renderList = (items: readonly ExportNode[], depth: number): string => {
    const lines: string[] = [];
    let ordinal = 0;

    for (const { block, children } of items) {
      ordinal = isOrdered(block) ? ordinal + 1 : 0;

      const marker = isTodo(block)
        ? `- [${block.props.checked === true ? 'x' : ' '}] `
        : isOrdered(block)
          ? `${ordinal}. `
          : '- ';
      const indent = '   '.repeat(depth);
      const [first = '', ...rest] = inlineToMarkdown(block.content).split('\n');

      lines.push(`${indent}${marker}${first}`);
      for (const line of rest) lines.push(`${indent}${' '.repeat(marker.length)}${line}`);

      for (const group of groupSiblings(children)) {
        lines.push(
          group.list
            ? renderList(group.nodes, depth + 1)
            : prefixLines(renderBlock(group.nodes[0].block), '   '.repeat(depth + 1)),
        );
      }
    }

    return lines.join('\n');
  };

  for (const group of groupSiblings(nodes)) {
    if (group.list) {
      chunks.push(renderList(group.nodes, 0));
      continue;
    }

    const { block, children } = group.nodes[0];

    chunks.push(renderBlock(block));

    // Потомки обычного блока бывают только у пользовательских типов: выводим их следом.
    for (const child of children) chunks.push(renderBlock(child.block));
  }

  const result = chunks.filter((chunk) => chunk !== '').join('\n\n');

  return result === '' ? '' : `${result}\n`;
}
