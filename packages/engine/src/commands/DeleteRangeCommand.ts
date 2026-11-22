import type { BaseBlock, BlockId } from '@inkbrick/document';

import type { Transaction } from '@inkbrick/store';

import type { Command, CommandContext } from './Command';
import type { CaretResult, DeleteRangePayload } from '../dispatcher/Intents';
import { isIsolating, isTextBlock, orderRange } from '../utils';

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

    if (p.text.clear) return clearRange(context, p.text);

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

    // Блоки между границами: с конца к началу, чтобы потомки решались раньше родителей. Блок уходит, если все его
    // дети уходят тоже; иначе внутри остались блоки за пределами выделения (например, следующие дочерние элементы
    // родителя последнего блока) — контейнер остаётся, его текст удалён. Удаление — одной пачкой (`removeMany`).
    const removing = new Set<BlockId>([end.id]);

    for (const block of [...between].reverse()) {
      const current = transaction.getBlock(block.id);
      if (!current) continue;

      if (current.children.every((child) => removing.has(child))) removing.add(current.id);
      else engine.block.updateContent(transaction, current.id, []);
    }

    engine.block.removeMany(transaction, [...removing]);

    return { blockId: start.id, offset: p.text.from.offset };
  },
};

interface TextRange {
  start: BaseBlock;
  end: BaseBlock;
  between: BaseBlock[];
  from: { blockId: BlockId; offset: number };
  to: { blockId: BlockId; offset: number };
  /** Граница выделения — в ячейке таблицы: блоки не склеиваются, текст очищается на месте. */
  clear: boolean;
}

interface Plan {
  remove: BaseBlock[];
  text?: TextRange;
}

/**
 * Удаление, у которого хотя бы одна граница в ячейке таблицы. Ячейки и строки остаются на месте —
 * очищается только их текст; обычные блоки, попавшие в выделение целиком (в том числе таблица вместе
 * со всеми ячейками), удаляются. Первый и последний блок не склеиваются.
 */
function clearRange(
  { engine, transaction }: CommandContext,
  { start, end, between, from, to }: TextRange,
): CaretResult {
  const holdsEnd = (block: BaseBlock) => {
    for (let current = transaction.getBlock(end.id); current?.parentId;) {
      if (current.parentId === block.id) return true;
      current = transaction.getBlock(current.parentId);
    }

    return false;
  };

  engine.block.updateContent(
    transaction,
    start.id,
    engine.inline.split(start.content, from.offset)[0],
  );
  engine.block.updateContent(transaction, end.id, engine.inline.split(end.content, to.offset)[1]);

  for (const block of between) {
    if (!transaction.getBlock(block.id)) continue;

    if (!isIsolating(engine.schema, block) && !holdsEnd(block)) {
      engine.block.remove(transaction, block.id);
    } else if (isTextBlock(engine.schema, block)) {
      engine.block.updateContent(transaction, block.id, []);
    }
  }

  return { blockId: start.id, offset: from.offset };
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

  engine.block.removeMany(
    transaction,
    blocks.map((block) => block.id),
  );

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

  /* Колонки не склеиваются: выделение, которое начинается в одной колонке, а кончается вне её, не удаляется. */
  if (start.id !== end.id && columnOf(transaction, start) !== columnOf(transaction, end)) {
    return undefined;
  }

  if (between.some((block) => !engine.schema.hasBlock(block.flavour))) return undefined;

  const clear =
    start.id !== end.id && (isIsolating(engine.schema, start) || isIsolating(engine.schema, end));

  if (start.id !== end.id && !clear) {
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
      clear,
    },
  };
}

/** Колонка, в которой лежит блок (на любой глубине), или `undefined`, если блок вне колонок. */
function columnOf(transaction: Transaction, block: BaseBlock): BlockId | undefined {
  for (
    let current = block.parentId ? transaction.getBlock(block.parentId) : undefined;
    current;
    current = current.parentId ? transaction.getBlock(current.parentId) : undefined
  ) {
    if (current.flavour === 'block:column') return current.id;
  }

  return undefined;
}
