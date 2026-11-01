import { InlineNode, TextAttributes } from '../model/InlineNode';

export function isEqualAttributes(a?: TextAttributes, b?: TextAttributes): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

export function normalizeInlineNodes(nodes: InlineNode[]): InlineNode[] {
  if (nodes.length === 0) return [];

  const result: InlineNode[] = [];

  for (const current of nodes) {
    if (current.insert.length === 0) continue;

    const last = result.at(-1);

    if (last && isEqualAttributes(last.attributes, current.attributes)) {
      last.insert += current.insert;
    } else {
      result.push({
        insert: current.insert,
        ...(current.attributes ? { attributes: { ...current.attributes } } : {}),
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
