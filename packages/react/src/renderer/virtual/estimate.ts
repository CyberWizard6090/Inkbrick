import type { BaseBlock, BlockId } from '@inkbrick/document';

export type BlockHeightEstimate = (block: BaseBlock) => number;

const CHARS_PER_LINE = 80;

function textLength(block: BaseBlock): number {
  let length = 0;

  for (const node of block.content) length += node.insert.length;
  return length;
}

/**
 * Оценка по умолчанию под стандартные стили: строки текста × высота строки + отступы блока.
 * Ошибка оценки сказывается только на длине полосы прокрутки: отрисованный блок измеряется точно.
 */
export const estimateBlockHeight: BlockHeightEstimate = (block) => {
  const lines = Math.max(1, Math.ceil(textLength(block) / CHARS_PER_LINE));

  switch (block.flavour) {
    case 'block:heading':
      return 20 + 34 * lines;
    case 'block:code': {
      let breaks = 0;

      for (const node of block.content)
        for (const char of node.insert) if (char === '\n') breaks += 1;

      return 40 + 21 * (breaks + 1);
    }
    case 'block:image':
      return 260;
    case 'block:divider':
      return 25;
    case 'block:formula':
      return 64;
    case 'block:callout':
      return 24 + 26 * lines;
    default:
      return 8 + 26 * lines;
  }
};

export function estimateSubtree(
  getBlock: (id: BlockId) => BaseBlock | undefined,
  id: BlockId,
  estimate: BlockHeightEstimate,
): number {
  let total = 0;
  const queue: BlockId[] = [id];

  for (let i = 0; i < queue.length; i++) {
    const block = getBlock(queue[i]);

    if (!block) continue;
    total += estimate(block);
    for (const child of block.children) queue.push(child);
  }

  return total;
}
