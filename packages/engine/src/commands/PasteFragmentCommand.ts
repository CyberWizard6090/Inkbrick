import type { BaseBlock, InlineNode } from '@inkbrick/document';

import type { FragmentBlock } from '../clipboard/types';
import type { Command, CommandContext } from './Command';
import type { CaretResult, PasteFragmentPayload } from '../dispatcher/Intents';
import { isTextBlock } from '../utils';

const PARAGRAPH = 'block:paragraph';

/**
 * Вставляет фрагмент (из буфера обмена) в позицию каретки одной транзакцией.
 *
 *  - Один текстовый блок встраивается в текущий блок как текст (форматирование сохраняется).
 *  - Несколько блоков: текущий делится по каретке — «голова» + первый блок остаются в текущем блоке,
 *    средние блоки вставляются следом, последний блок получает «хвост» разделённого текста.
 *  - Пустой блок перенимает тип целиком скопированного первого блока (заголовок, список, код…).
 *  - Типы, которых нет в схеме или которые нельзя положить в этот контейнер, превращаются
 *    в параграфы — содержимое не теряется.
 * Возвращает позицию каретки в конце вставленного текста.
 */
export const PasteFragmentCommand: Command<PasteFragmentPayload, CaretResult> = {
  type: 'pasteFragment',

  canExecute({ engine, transaction }, { at, fragment }) {
    const target = transaction.getBlock(at.blockId);
    const parent = target?.parentId ? transaction.getBlock(target.parentId) : undefined;

    return (
      !!target &&
      !!parent &&
      fragment.blocks.length > 0 &&
      isTextBlock(engine.schema, target) &&
      // В блок кода вставляется только простой текст (это делает слой интерфейса).
      target.flavour !== 'block:code'
    );
  },

  execute(context, { at, fragment }) {
    const { engine, transaction: tx } = context;
    const target = tx.getBlock(at.blockId)!;
    const parent = tx.getBlock(target.parentId!)!;
    const { inline } = engine;

    const [head, tail] = inline.split(target.content, at.offset);
    const targetIsEmpty = head.length === 0 && tail.length === 0;
    const originalChildren = [...target.children];

    const first = fragment.blocks[0];
    const firstIsText = isTextual(context, first);

    let bodyRoots: FragmentBlock[];
    let firstContent: InlineNode[] = [];

    if (firstIsText) {
      bodyRoots = fragment.blocks.slice(1);
      firstContent = first.content;

      if (targetIsEmpty && first.complete === true) adoptType(context, parent, target, first);
    } else if (targetIsEmpty) {
      adoptType(context, parent, target, first);
      bodyRoots = fragment.blocks.slice(1);
    } else {
      bodyRoots = fragment.blocks;
    }

    const current = () => tx.getBlock(target.id)!;
    const baseFlavour = isTextBlock(engine.schema, current()) ? current().flavour : PARAGRAPH;
    const ownContent = forTarget(context, current().flavour, firstContent);

    if (firstIsText && bodyRoots.length === 0) {
      engine.block.updateContent(tx, target.id, merge(inline, head, ownContent, tail));
      createChildren(context, current(), first.children, 0);

      return { blockId: target.id, offset: inline.length(head) + inline.length(ownContent) };
    }

    if (isTextBlock(engine.schema, current())) {
      engine.block.updateContent(tx, target.id, merge(inline, head, ownContent));
      if (firstIsText) createChildren(context, current(), first.children, 0);
    }

    const lastRoot = bodyRoots[bodyRoots.length - 1];
    const lastIsText = !!lastRoot && isTextual(context, lastRoot);
    const middle = lastIsText ? bodyRoots.slice(0, -1) : bodyRoots;

    let index = parent.children.indexOf(target.id) + 1;

    for (const root of middle) {
      if (createBlock(context, parent, root, index)) index++;
    }

    let tailBlock: BaseBlock | undefined;
    let caret: CaretResult | undefined;

    if (lastIsText) {
      tailBlock = createBlock(context, parent, { ...lastRoot, content: [] }, index);

      if (tailBlock) {
        const lastContent = forTarget(context, tailBlock.flavour, lastRoot.content);

        engine.block.updateContent(tx, tailBlock.id, merge(inline, lastContent, tail));
        caret = { blockId: tailBlock.id, offset: inline.length(lastContent) };
      }
    }

    if (!tailBlock) {
      tailBlock = engine.block.create({
        flavour: baseFlavour,
        parentId: parent.id,
        props: safeProps(
          context,
          baseFlavour,
          baseFlavour === current().flavour ? current().props : {},
        ),
        content: tail,
      });

      engine.block.insert(tx, parent.id, index, tailBlock);
      caret = { blockId: tailBlock.id, offset: 0 };
    }

    for (const childId of originalChildren) {
      const child = tx.getBlock(childId);

      if (child && engine.schema.validateRelation(tailBlock.flavour, child.flavour)) {
        engine.block.move(tx, childId, tailBlock.id, tx.getBlock(tailBlock.id)!.children.length);
      }
    }

    return caret!;
  },
};

function adoptType(
  context: CommandContext,
  parent: BaseBlock,
  target: BaseBlock,
  block: FragmentBlock,
): void {
  const { engine, transaction: tx } = context;
  const resolved = resolveFor(context, parent, block, true);

  if (!resolved) return;

  const current = tx.getBlock(target.id)!;

  if (resolved.flavour !== current.flavour || !sameProps(resolved.props, current.props)) {
    engine.block.morph(tx, target.id, resolved.flavour, resolved.props as never);
  }
}

type Inline = CommandContext['engine']['inline'];

function merge(inline: Inline, ...parts: InlineNode[][]): InlineNode[] {
  return parts.reduce((acc, part) => inline.merge(acc, part), [] as InlineNode[]);
}

function isTextual({ engine }: CommandContext, block: FragmentBlock): boolean {
  // Неизвестный тип деградирует в параграф — то есть текстовый блок.
  return engine.schema.getBlockSchema(block.flavour)?.inline !== false;
}

function sameProps(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function safeProps(context: CommandContext, flavour: string, props: Record<string, unknown>) {
  try {
    return context.engine.schema.createProps(flavour, props as never);
  } catch {
    return context.engine.schema.createProps(flavour);
  }
}

function resolveFor(
  context: CommandContext,
  parent: BaseBlock,
  block: FragmentBlock,
  allowDivider = false,
): { flavour: string; props: Record<string, unknown> } | undefined {
  const { schema } = context.engine;
  let flavour = block.flavour;
  let degraded = false;

  if (!schema.hasBlock(flavour) || !schema.validateRelation(parent.flavour, flavour)) {
    flavour = PARAGRAPH;
    degraded = true;
  }

  if (!schema.validateRelation(parent.flavour, flavour)) return undefined;
  if (!allowDivider && schema.getBlockSchema(flavour)?.inline === false && degraded)
    return undefined;

  return {
    flavour,
    props: degraded ? safeProps(context, flavour, {}) : safeProps(context, flavour, block.props),
  };
}

function forTarget(context: CommandContext, flavour: string, content: InlineNode[]): InlineNode[] {
  const definition = context.engine.schema.getBlockSchema(flavour);

  if (definition?.inline === false) return [];

  if (flavour === 'block:code') {
    const text = content.map((node) => node.insert).join('');

    return text ? [{ insert: text }] : [];
  }

  return content;
}

function createBlock(
  context: CommandContext,
  parent: BaseBlock,
  fb: FragmentBlock,
  index: number,
): BaseBlock | undefined {
  const { engine, transaction: tx } = context;
  const resolved = resolveFor(context, parent, fb, true);

  if (!resolved) return undefined;

  const block = engine.block.create({
    flavour: resolved.flavour,
    parentId: parent.id,
    props: resolved.props as never,
    content: forTarget(context, resolved.flavour, fb.content),
  });

  engine.block.insert(tx, parent.id, index, block);
  createChildren(context, tx.getBlock(block.id)!, fb.children, 0);

  return tx.getBlock(block.id)!;
}

function createChildren(
  context: CommandContext,
  parent: BaseBlock,
  children: FragmentBlock[],
  index: number,
): void {
  let at = index;

  for (const child of children) {
    if (createBlock(context, parent, child, at)) at++;
  }
}
