import type { Document } from '../document';
import {
  buildExportTree,
  groupSiblings,
  isOrdered,
  isTodo,
  plainOf,
  stringProp,
  type ExportNode,
  type ExportOptions,
} from './tree';

/**
 * Простой текст: без форматирования. Блоки разделены пустой строкой, пункты списков идут подряд
 * с маркерами (`-`, `1.`, `[ ]`/`[x]`), вложенность — отступ в два пробела.
 */
export function toPlainText(document: Document, options: ExportOptions = {}): string {
  const { nodes, title } = buildExportTree(document, options);
  const chunks: string[] = title ? [title] : [];

  const renderList = (items: readonly ExportNode[], depth: number): string[] => {
    const lines: string[] = [];
    let ordinal = 0;

    for (const { block, children } of items) {
      ordinal = isOrdered(block) ? ordinal + 1 : 0;

      const marker = isTodo(block)
        ? block.props.checked === true
          ? '[x] '
          : '[ ] '
        : isOrdered(block)
          ? `${ordinal}. `
          : '- ';
      const indent = '  '.repeat(depth);
      const [first = '', ...rest] = plainOf(block.content).split('\n');

      lines.push(`${indent}${marker}${first}`);
      for (const line of rest) lines.push(`${indent}${' '.repeat(marker.length)}${line}`);

      for (const group of groupSiblings(children)) {
        lines.push(
          ...(group.list
            ? renderList(group.nodes, depth + 1)
            : renderBlock(group.nodes[0], depth + 1)),
        );
      }
    }

    return lines;
  };

  const renderBlock = ({ block, children }: ExportNode, depth: number): string[] => {
    const indent = '  '.repeat(depth);
    let text: string;

    switch (block.flavour) {
      case 'block:divider':
        text = '---';
        break;
      case 'block:image':
        text = stringProp(block, 'caption') || stringProp(block, 'alt');
        break;
      case 'block:formula':
        text = stringProp(block, 'latex');
        break;
      default:
        text = plainOf(block.content);
    }

    const lines = text === '' ? [] : text.split('\n').map((line) => `${indent}${line}`);

    for (const child of children) lines.push(...renderBlock(child, depth + 1));

    return lines;
  };

  for (const group of groupSiblings(nodes)) {
    const lines = group.list ? renderList(group.nodes, 0) : renderBlock(group.nodes[0], 0);

    if (lines.length > 0) chunks.push(lines.join('\n'));
  }

  return chunks.join('\n\n');
}
