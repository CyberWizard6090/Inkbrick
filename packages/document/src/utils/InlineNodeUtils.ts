import { InlineNode, TextAttributes } from '../model/InlineNode';

export function isEqualAttributes(a?: TextAttributes, b?: TextAttributes): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

/**
 * Атрибуты, несовместимые с inline-кодом. Код — дословный фрагмент программы: у него свой шрифт, цвет и фон, и
 * оформлять его (целиком или частично) нельзя. С кодом остаётся только ссылка (и атрибуты расширений).
 */
export const CODE_EXCLUDED_ATTRIBUTES = [
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'backgroundColor',
] as const;

/** Атрибуты без того, что несовместимо с кодом (`CODE_EXCLUDED_ATTRIBUTES`); у текста не-кода — как есть. */
export function withoutCodeExcluded(attributes?: TextAttributes): TextAttributes | undefined {
  if (!attributes?.code) return attributes;

  const cleaned = { ...attributes };

  for (const key of CODE_EXCLUDED_ATTRIBUTES) delete cleaned[key];

  return cleaned;
}

/**
 * Приводит содержимое к каноническому виду: пустые узлы убраны, соседние с одинаковыми атрибутами слиты, у кода снято
 * несовместимое с ним оформление (`CODE_EXCLUDED_ATTRIBUTES`).
 */
export function normalizeInlineNodes(nodes: InlineNode[]): InlineNode[] {
  if (nodes.length === 0) return [];

  const result: InlineNode[] = [];

  for (const node of nodes) {
    if (node.insert.length === 0) continue;

    const attributes = withoutCodeExcluded(node.attributes);
    const last = result.at(-1);

    if (last && isEqualAttributes(last.attributes, attributes)) {
      last.insert += node.insert;
    } else {
      result.push({
        insert: node.insert,
        ...(attributes ? { attributes: { ...attributes } } : {}),
      });
    }
  }

  return result;
}

function splitSingleNode(node: InlineNode, offset: number): InlineNode[] {
  const { insert, attributes } = node;

  return [
    { insert: insert.substring(0, offset), ...(attributes && { attributes }) },
    { insert: insert.substring(offset), ...(attributes && { attributes }) },
  ];
}

export function splitNodesAt(nodes: InlineNode[], ...offsets: number[]): InlineNode[] {
  let currentNodes = [...nodes];
  const sortedOffsets = [...new Set(offsets)].sort((a, b) => b - a);

  for (const offset of sortedOffsets) {
    let currentOffset = 0;
    const nextNodes: InlineNode[] = [];

    for (const node of currentNodes) {
      const nodeLength = node.insert.length;
      const isInside = offset > currentOffset && offset < currentOffset + nodeLength;

      if (isInside) {
        nextNodes.push(...splitSingleNode(node, offset - currentOffset));
      } else {
        nextNodes.push(node);
      }
      currentOffset += nodeLength;
    }
    currentNodes = nextNodes;
  }
  return currentNodes;
}
