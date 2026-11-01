import type { BaseBlock, BlockId, SchemaRegistry } from '@inkbrick/document';

type GetBlock = (id: BlockId) => BaseBlock | undefined;

export function preorder(getBlock: GetBlock, rootId: BlockId): BaseBlock[] {
  const result: BaseBlock[] = [];
  const stack: BlockId[] = [rootId];

  while (stack.length > 0) {
    const block = getBlock(stack.pop()!);
    if (!block) continue;

    result.push(block);

    for (let i = block.children.length - 1; i >= 0; i--) stack.push(block.children[i]);
  }

  return result;
}

export function isTextBlock(schema: SchemaRegistry, block: BaseBlock): boolean {
  const definition = schema.getBlockSchema(block.flavour);

  return definition !== undefined && definition.inline !== false;
}

export interface BlockPoint {
  blockId: BlockId;
  offset: number;
}

export interface OrderedRange {
  blocks: BaseBlock[];
  from: BlockPoint;
  to: BlockPoint;
}

/**
 * Упорядочивает границы по порядку документа и возвращает блоки между ними.
 * undefined — если какого-то блока нет в документе.
 */
export function orderRange(
  getBlock: GetBlock,
  rootId: BlockId,
  a: BlockPoint,
  b: BlockPoint,
): OrderedRange | undefined {
  const all = preorder(getBlock, rootId);
  const indexA = all.findIndex((block) => block.id === a.blockId);
  const indexB = all.findIndex((block) => block.id === b.blockId);

  if (indexA === -1 || indexB === -1) return undefined;

  const forward = indexA < indexB || (indexA === indexB && a.offset <= b.offset);
  const [from, to] = forward ? [a, b] : [b, a];
  const [i, j] = indexA <= indexB ? [indexA, indexB] : [indexB, indexA];

  return { blocks: all.slice(i, j + 1), from, to };
}

export interface TextSegment {
  block: BaseBlock;
  start: number;
  end: number;
}

export function textSegments(
  getBlock: GetBlock,
  rootId: BlockId,
  schema: SchemaRegistry,
  from: BlockPoint,
  to: BlockPoint,
): TextSegment[] {
  const range = orderRange(getBlock, rootId, from, to);

  if (!range) return [];

  return range.blocks
    .filter((block) => isTextBlock(schema, block))
    .map((block) => {
      const length = block.content.reduce((sum, node) => sum + node.insert.length, 0);
      const start = block.id === range.from.blockId ? range.from.offset : 0;
      const end = block.id === range.to.blockId ? range.to.offset : length;

      return { block, start: Math.max(0, start), end: Math.min(length, end) };
    })
    .filter((segment) => segment.start < segment.end);
}
