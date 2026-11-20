import { TABLE, type BaseBlock, type InlineNode, type TableMerge } from '@inkbrick/document';

import type { Fragment, FragmentBlock } from '../clipboard/types';
import { addTableColumn, addTableRow } from '../table/tableOps';
import { locateTableCell, tableCellAt, tableSize } from '../table/tableGrid';
import { mergeAt, normalizeMerges } from '../table/tableMerge';
import {
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  degradeTables,
  readTable,
} from '../table/tableFragment';
import type { Command, CommandContext } from './Command';
import type { CaretResult, PasteFragmentPayload } from '../dispatcher/Intents';
import { isIsolating, isTextBlock } from '../utils';

const PARAGRAPH = 'block:paragraph';

/**
 * Вставляет фрагмент (из буфера обмена) в позицию каретки одной транзакцией.
 *
 *  - Один текстовый блок встраивается в текущий блок как текст (форматирование сохраняется).
 *  - Несколько блоков: текущий делится по каретке — «голова» + первый блок остаются в текущем блоке,
 *    средние блоки вставляются следом, последний блок получает «хвост» разделённого текста.
 *  - Пустой блок перенимает тип целиком скопированного первого блока (заголовок, список, код…).
 *  - Типы, которых нет в схеме или которые нельзя положить в этот контейнер, превращаются
 *    в параграфы — содержимое не теряется. Таблица в редакторе без таблиц — абзацы по строкам, ячейки через табуляцию.
 *  - Таблица в ячейку таблицы: ячейки заполняются от каретки (при нехватке добавляются строки и столбцы);
 *    любой другой фрагмент в ячейку — текстом, блоки разделяются переводом строки.
 *  - Таблица в пустой абзац или в начало абзаца занимает его место: пустого абзаца перед ней не остаётся.
 * Возвращает позицию каретки в конце вставленного текста.
 */
export const PasteFragmentCommand: Command<PasteFragmentPayload, CaretResult> = {
  type: 'pasteFragment',

  canExecute({ engine, transaction }, { at, fragment: pasted }) {
    const fragment = supported(engine.schema.hasBlock(TABLE), pasted);
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

  execute(context, { at, fragment: pasted }) {
    const { engine, transaction: tx } = context;
    const fragment = supported(engine.schema.hasBlock(TABLE), pasted);
    const target = tx.getBlock(at.blockId)!;
    const parent = tx.getBlock(target.parentId!)!;
    const { inline } = engine;

    const [head, tail] = inline.split(target.content, at.offset);

    if (isIsolating(engine.schema, target)) {
      const filled =
        fragment.blocks.length === 1 ? fillTable(context, target, fragment.blocks[0]) : undefined;

      if (filled) return filled;

      const text = flatten(inline, fragment.blocks);

      engine.block.updateContent(tx, target.id, merge(inline, head, text, tail));

      return { blockId: target.id, offset: inline.length(head) + inline.length(text) };
    }

    const targetIsEmpty = head.length === 0 && tail.length === 0;
    const originalChildren = [...target.children];

    const first = fragment.blocks[0];
    const firstIsText = isTextual(context, first);
    // Блок с потомками (таблица) создаётся заново: превратить в него пустой абзац нельзя, потомков не появится.
    const compositeFirst = !firstIsText && first.children.length > 0;

    let bodyRoots: FragmentBlock[];
    let firstContent: InlineNode[] = [];

    if (firstIsText) {
      bodyRoots = fragment.blocks.slice(1);
      firstContent = first.content;

      if (targetIsEmpty && first.complete === true) adoptType(context, parent, target, first);
    } else if (targetIsEmpty && !compositeFirst) {
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

    // Таблица заняла место пустой «головы»: пустой абзац перед ней не нужен (если в нём не остались потомки).
    if (compositeFirst && head.length === 0 && current().children.length === 0) {
      engine.block.remove(tx, target.id);
    }

    return caret!;
  },
};

/** Редактор без таблиц: таблицы фрагмента — абзацы с текстом строк. */
function supported(hasTables: boolean, fragment: Fragment): Fragment {
  return hasTables ? fragment : { ...fragment, blocks: degradeTables(fragment.blocks) };
}

/**
 * Таблица, вставленная в ячейку: ячейки заполняются от каретки, недостающие строки и столбцы добавляются.
 * Как в Excel, содержимое занятых ячеек заменяется (текст ячейки с курсором тоже). Объединения вставленной таблицы
 * переносятся; если прямоугольник накрывает скрытые ячейки объединения, таблица не вставляется.
 * `undefined` — это не таблица или она не поместится в пределы размера: тогда фрагмент идёт текстом.
 */
function fillTable(
  context: CommandContext,
  cell: BaseBlock,
  source: FragmentBlock,
): CaretResult | undefined {
  const { engine, transaction: tx } = context;
  const getBlock = (id: string) => tx.getBlock(id);
  const position = source.flavour === TABLE ? locateTableCell(getBlock, cell.id) : undefined;

  if (!position) return undefined;

  const { rows, cellProps } = readTable(source);
  const columns = rows[0]?.length ?? 0;
  const needRows = position.row + rows.length;
  const needColumns = position.column + columns;

  if (columns === 0 || needColumns > MAX_TABLE_COLUMNS || needRows * needColumns > MAX_TABLE_CELLS)
    return undefined;

  const before = tableSize(getBlock, position.tableId)!;
  const existing = normalizeMerges(
    getBlock(position.tableId)?.props.merges,
    before.rows,
    before.columns,
  );

  // Скрытые ячейки объединения не видны: писать в них значит потерять текст. Такая таблица идёт текстом.
  for (let r = position.row; r < Math.min(needRows, before.rows); r++)
    for (let c = position.column; c < Math.min(needColumns, before.columns); c++) {
      const found = mergeAt(existing, r, c);

      if (found && !found.origin) return undefined;
    }

  let size = before;

  for (; size.rows < needRows; size = tableSize(getBlock, position.tableId)!)
    addTableRow(engine, tx, position.tableId, size.rows);

  for (; size.columns < needColumns; size = tableSize(getBlock, position.tableId)!)
    addTableColumn(engine, tx, position.tableId, size.columns);

  let last: CaretResult | undefined;

  rows.forEach((row, r) =>
    row.forEach((content, c) => {
      const id = tableCellAt(getBlock, position.tableId, position.row + r, position.column + c)!;

      engine.block.updateContent(tx, id, structuredClone(content));
      // Фон, границы и выравнивание ячеек переносятся вместе с текстом (как при копировании внутри таблицы).
      // Одна ячейка без своего оформления (простой текст) оформления получателя не стирает.
      const props = structuredClone(cellProps[r]?.[c] ?? {});
      const plainSingle = rows.length === 1 && columns === 1 && Object.keys(props).length === 0;

      if (!plainSingle) engine.block.update(tx, id, (cell) => ({ ...cell, props }));
      last = { blockId: id, offset: engine.inline.length(content) };
    }),
  );

  // Объединения вставленной таблицы переезжают на место вставки. Пересекающиеся с существующими пропускаются.
  const moved = normalizeMerges(source.props.merges, rows.length, columns)
    .map((merge) => ({
      ...merge,
      row: merge.row + position.row,
      column: merge.column + position.column,
    }))
    .filter((merge) => !existing.some((other) => overlaps(merge, other)));

  if (moved.length > 0) {
    engine.block.update(tx, position.tableId, (table) => ({
      ...table,
      props: { ...table.props, merges: [...existing, ...moved] },
    }));
  }

  return last;
}

const overlaps = (a: TableMerge, b: TableMerge) =>
  a.row < b.row + b.rows &&
  b.row < a.row + a.rows &&
  a.column < b.column + b.columns &&
  b.column < a.column + a.columns;

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

function flatten(inline: Inline, blocks: FragmentBlock[]): InlineNode[] {
  const lines: InlineNode[][] = [];
  const visit = (block: FragmentBlock) => {
    if (block.content.length > 0) lines.push(block.content);
    block.children.forEach(visit);
  };

  blocks.forEach(visit);

  return lines.reduce(
    (acc, line, index) => merge(inline, acc, index > 0 ? [{ insert: '\n' }] : [], line),
    [] as InlineNode[],
  );
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
