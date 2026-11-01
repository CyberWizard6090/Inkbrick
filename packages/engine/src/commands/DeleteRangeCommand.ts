import type { BaseBlock, BlockId } from '@inkbrick/document';

import type { Command, CommandContext } from './Command';
import type { CaretResult, DeleteRangePayload } from '../dispatcher/Intents';
import { isTextBlock, orderRange } from '../utils';

/**
 * Удаляет выделение, которое может охватывать несколько блоков.
 *
 * Результат — как в обычных редакторах: первый блок сохраняет свой тип и получает
 * «хвост» последнего блока; блоки между ними удаляются; потомки последнего блока
 * переходят к первому. Блоки неизвестного типа внутри диапазона не удаляются —
 * в этом случае команда не выполняется.
 */
export const DeleteRangeCommand: Command<DeleteRangePayload, CaretResult> = {
  type: 'deleteRange',

  canExecute(context, payload) {
    return plan(context, payload) !== undefined;
  },

  execute(context, payload) {
    const { engine, transaction } = context;
    const p = plan(context, payload)!;

    const removed = removeBoundaries(context, p.remove);

    if (!p.text) return caretAfterRemoval(context, removed);

    const { start, end, between } = p.text;

    if (start.id === end.id) {
      engine.block.updateContent(
        transaction,
        start.id,
        engine.inline.deleteText(start.content, p.text.from.offset, p.text.to.offset),
      );

      return { blockId: start.id, offset: p.text.from.offset };
    }

    const [head] = engine.inline.split(start.content, p.text.from.offset);
    const [, tail] = engine.inline.split(end.content, p.text.to.offset);

    engine.block.updateContent(transaction, start.id, engine.inline.merge(head, tail));

    // Потомки последнего блока не теряются: переходят к первому (или встают после него).
    const startParentId = start.parentId;
    let placedAfter = 0;

    for (const childId of end.children) {
      const child = transaction.getBlock(childId)!;

      if (engine.schema.validateRelation(start.flavour, child.flavour)) {
        const target = transaction.getBlock(start.id)!;
        engine.block.move(transaction, childId, start.id, target.children.length);
      } else {
        const parent = transaction.getBlock(startParentId!)!;
        engine.block.move(
          transaction,
          childId,
          parent.id,
          parent.children.indexOf(start.id) + 1 + placedAfter++,
        );
      }
    }

    engine.block.remove(transaction, end.id);

    // Блоки между границами: с конца к началу, чтобы потомки обрабатывались раньше родителей.
    for (const block of [...between].reverse()) {
      const current = transaction.getBlock(block.id);
      if (!current) continue;

      if (current.children.length === 0) {
        engine.block.remove(transaction, current.id);
      } else {
        /*
         * Внутри остались блоки за пределами выделения (например, следующие дочерние элементы
         * родителя последнего блока): контейнер остаётся, его текст удалён.
         */
        engine.block.updateContent(transaction, current.id, []);
      }
    }

    return { blockId: start.id, offset: p.text.from.offset };
  },
};

interface TextRange {
  start: BaseBlock;
  end: BaseBlock;
  between: BaseBlock[];
  from: { blockId: BlockId; offset: number };
  to: { blockId: BlockId; offset: number };
}

interface Plan {
  remove: BaseBlock[];
  text?: TextRange;
}

function removeBoundaries(
  { engine, transaction }: CommandContext,
  blocks: BaseBlock[],
): { parentId: BlockId; index: number } | undefined {
  if (blocks.length === 0) return undefined;

  const first = blocks[0];
  const parent = first.parentId ? transaction.getBlock(first.parentId) : undefined;
  const position = parent
    ? { parentId: parent.id, index: parent.children.indexOf(first.id) }
    : undefined;

  for (const block of blocks) {
    if (transaction.getBlock(block.id)) engine.block.remove(transaction, block.id);
  }

  return position;
}

function caretAfterRemoval(
  { engine, transaction }: CommandContext,
  position: { parentId: BlockId; index: number } | undefined,
): CaretResult {
  const parent = transaction.getBlock(position!.parentId)!;
  const candidate = transaction.getBlock(
    parent.children[Math.min(position!.index, parent.children.length - 1)] ?? '',
  );

  if (candidate && isTextBlock(engine.schema, candidate))
    return { blockId: candidate.id, offset: 0 };

  const paragraph = engine.block.create({ flavour: 'block:paragraph', parentId: parent.id });

  engine.block.insert(
    transaction,
    parent.id,
    Math.min(position!.index, parent.children.length),
    paragraph,
  );

  return { blockId: paragraph.id, offset: 0 };
}

function plan(
  { engine, transaction }: CommandContext,
  payload: DeleteRangePayload,
): Plan | undefined {
  const range = orderRange(
    transaction.getBlock.bind(transaction),
    engine.store.document.rootId,
    payload.from,
    payload.to,
  );

  if (!range) return undefined;

  const blocks = [...range.blocks];
  const leading: BaseBlock[] = [];
  const trailing: BaseBlock[] = [];

  while (blocks.length > 0 && !isTextBlock(engine.schema, blocks[0])) leading.push(blocks.shift()!);
  while (blocks.length > 0 && !isTextBlock(engine.schema, blocks[blocks.length - 1]))
    trailing.unshift(blocks.pop()!);

  const remove = [...leading, ...trailing];

  // Неизвестные блоки и блоки без текста с потомками не удаляем: смысл их содержимого редактору неизвестен.
  if (remove.some((block) => !engine.schema.hasBlock(block.flavour) || block.children.length > 0))
    return undefined;
  if (blocks.length === 0) return remove.length > 0 ? { remove } : undefined;

  const start = blocks[0];
  const end = blocks[blocks.length - 1];
  const between = blocks.slice(1, -1);

  if (between.some((block) => !engine.schema.hasBlock(block.flavour))) return undefined;

  if (start.id !== end.id) {
    const parent = start.parentId ? transaction.getBlock(start.parentId) : undefined;

    for (const childId of end.children) {
      const child = transaction.getBlock(childId);
      if (!child) return undefined;

      const fitsStart = engine.schema.validateRelation(start.flavour, child.flavour);
      const fitsParent = !!parent && engine.schema.validateRelation(parent.flavour, child.flavour);

      if (!fitsStart && !fitsParent) return undefined;
    }
  }

  const length = (block: BaseBlock) => engine.inline.length(block.content);

  return {
    remove,
    text: {
      start,
      end,
      between,
      from: start.id === range.from.blockId ? range.from : { blockId: start.id, offset: 0 },
      to: end.id === range.to.blockId ? range.to : { blockId: end.id, offset: length(end) },
    },
  };
}
