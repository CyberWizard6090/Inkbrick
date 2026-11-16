import { COLUMN, MAX_COLUMNS, type ColumnsProps } from '@inkbrick/document';

import { defineBlockCommand, type BlockCommandContext } from '../controller/BlockController';
import type { CaretResult } from '../dispatcher/Intents';

type Context = BlockCommandContext<ColumnsProps>;

const countOf = ({ block }: Context) => block.children.length;

const isIndex = (value: unknown, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

/** Доли ширины колонок: недостающие — поровну (среднее по заданным). */
function ratiosOf(context: Context): number[] {
  const { ratios } = context.block.props;
  const count = countOf(context);
  const known = (ratios ?? []).filter((value) => value > 0);
  const fill = known.length > 0 ? known.reduce((sum, value) => sum + value, 0) / known.length : 1;

  return Array.from({ length: count }, (_, index) => ratios?.[index] ?? fill);
}

function firstTextOf(context: Context, id: string): CaretResult {
  const stack = [id];

  while (stack.length > 0) {
    const block = context.transaction.getBlock(stack.shift()!);

    if (!block) continue;
    if (context.engine.schema.getBlockSchema(block.flavour)?.inline !== false) {
      return { blockId: block.id, offset: 0 };
    }

    stack.unshift(...block.children);
  }

  return { blockId: id, offset: 0 };
}

/** Колонки превращаются в обычные блоки: блоки всех колонок по порядку встают на место блока колонок. */
function unwrap(context: Context): CaretResult {
  const { engine, transaction, block } = context;
  const parentId = block.parentId!;
  const moved: string[] = [];

  for (const columnId of [...block.children]) {
    for (const childId of [...(transaction.getBlock(columnId)?.children ?? [])])
      moved.push(childId);
  }

  moved.forEach((id) => {
    const parent = transaction.getBlock(parentId)!;

    engine.block.move(transaction, id, parentId, parent.children.indexOf(block.id));
  });

  engine.block.remove(transaction, block.id);

  return firstTextOf(context, moved[0] ?? parentId);
}

/**
 * Добавляет пустую колонку на место `index` (0 — первой, число колонок — последней); колонок не больше шести.
 * Возвращает позицию курсора в ней.
 */
export const AddColumnCommand = defineBlockCommand<ColumnsProps, { index: number }>({
  type: 'addColumn',

  canExecute: (context, { index }) =>
    isIndex(index, countOf(context)) && countOf(context) < MAX_COLUMNS,

  execute(context, { index }): CaretResult {
    const { engine, transaction, block } = context;
    const ratios = ratiosOf(context);
    const column = engine.block.create({ flavour: COLUMN, parentId: block.id });

    engine.block.insert(transaction, block.id, index, column);

    const [paragraph] = engine.block.build(transaction, column.id, [
      { flavour: 'block:paragraph' },
    ]);

    if (block.props.ratios) {
      const average = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;

      ratios.splice(index, 0, average);
      context.setProps({ ratios });
    }

    return { blockId: paragraph, offset: 0 };
  },
});

/**
 * Убирает колонку `index`; её блоки переходят в конец соседней колонки (слева, у первой — справа), ничего не теряется.
 * Когда останется одна колонка, колонки разворачиваются в обычные блоки.
 */
export const RemoveColumnCommand = defineBlockCommand<ColumnsProps, { index: number }>({
  type: 'removeColumn',

  canExecute: (context, { index }) => countOf(context) > 1 && isIndex(index, countOf(context) - 1),

  execute(context, { index }): CaretResult {
    const { engine, transaction, block } = context;
    const target = block.children[index === 0 ? 1 : index - 1];
    const ratios = ratiosOf(context);

    const moved = [...(transaction.getBlock(block.children[index])?.children ?? [])];

    moved.forEach((childId, offset) => {
      const parent = transaction.getBlock(target)!;

      engine.block.move(
        transaction,
        childId,
        target,
        index === 0 ? offset : parent.children.length,
      );
    });

    engine.block.remove(transaction, block.children[index]);

    if (transaction.getBlock(block.id)!.children.length === 1) return unwrap(context);

    if (block.props.ratios) {
      ratios.splice(index, 1);
      context.setProps({ ratios });
    }

    return firstTextOf(context, target);
  },
});

/** Колонки превращаются в обычные блоки: содержимое остаётся по порядку, колонки пропадают. */
export const UnwrapColumnsCommand = defineBlockCommand<ColumnsProps, Record<string, never>>({
  type: 'unwrapColumns',

  canExecute: (context) => !!context.block.parentId,

  execute: (context) => unwrap(context),
});

/** Задаёт доли ширины колонок: по числу на колонку, положительные; сохраняется только отношение. */
export const SetColumnRatiosCommand = defineBlockCommand<ColumnsProps, { ratios: number[] }>({
  type: 'setColumnRatios',

  canExecute: (context, { ratios }) =>
    Array.isArray(ratios) &&
    ratios.length === countOf(context) &&
    ratios.every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0),

  execute(context, { ratios }) {
    const total = ratios.reduce((sum, value) => sum + value, 0);
    const equal = ratios.every((value) => Math.abs(value - ratios[0]) < 1e-9);

    context.setProps({
      ratios: equal ? undefined : ratios.map((value) => Math.round((value / total) * 1000) / 1000),
    });
  },
});

export const columnsCommands = [
  AddColumnCommand,
  RemoveColumnCommand,
  UnwrapColumnsCommand,
  SetColumnRatiosCommand,
] as const;
