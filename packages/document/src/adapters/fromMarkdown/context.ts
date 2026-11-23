import type { BaseBlock, BlockProps, InlineNode } from '../../model';
import type { SchemaRegistry } from '../../schema';
import { createId } from '../../utils/id';

/** Общее для разбора Markdown: состояние, константы, создание блока. */

export interface Ctx {
  readonly schema: SchemaRegistry;
  readonly nodes: Map<string, BaseBlock>;
  readonly maxBlocks: number;
  readonly footnotes: boolean;
  readonly formulas: boolean;
  count: number;
}

export type Lines = readonly string[];

export const NOTE = 'block:note';
export const TONES: Record<string, string> = {
  NOTE: 'info',
  WARNING: 'warning',
  TIP: 'success',
  CAUTION: 'danger',
};
/** Во сколько раз глубже ссылка или `<u>` может вкладываться в другую: дальше — обычным текстом. */
export const MAX_INLINE_LEVEL = 6;
/** Самый длинный адрес в `(...)` ссылки или картинки; длиннее — обычный текст. */
export const MAX_DESTINATION = 2000;
/** Сколько выделений может быть открыто одновременно: глубже серии остаются текстом, а разбор — линейным. */
export const MAX_EMPHASIS_DEPTH = 64;

export const FENCE = /^(`{3,}|~{3,})(.*)$/;
export const HEADING = /^(#{1,6})(?:[ \t]+(.*))?$/;
export const HR = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
export const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
export const FOOTNOTE_DEF = /^\[\^([\w-]{1,64})\]:[ \t]*(.*)$/;
export const DETAILS = /^<details(\s+open)?\s*>/i;
export const DELIMITER_CELL = /^:?-+:?$/;
export const CAPTION = /^\*((?:\\.|[^*\\])+)\*$/;
export const IMAGE = /^!\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+"[^"]*")?\s*\)$/;
export const ESCAPED = /\\([!-/:-@[-`{-~])/g;
export const PUNCTUATION = /[!-/:-@[-`{-~]/;

export const isBlank = (line: string) => line.trim() === '';
export const indentOf = (line: string) => line.length - line.trimStart().length;
export const unescapeMarkdown = (text: string) => text.replace(ESCAPED, '$1');
export const dedent = (lines: Lines, n: number) =>
  lines.map((line) => line.slice(Math.min(n, indentOf(line))));

export function create(
  ctx: Ctx,
  parentId: string,
  flavour: string,
  props: BlockProps,
  content: InlineNode[] = [],
): BaseBlock | null {
  if (!ctx.schema.hasBlock(flavour)) return null;

  let checked: BlockProps;

  try {
    checked = ctx.schema.createProps(flavour, props);
  } catch {
    // Значение не прошло схему (слишком длинное, небезопасное…): вызывающий разберёт строки обычным текстом.
    return null;
  }

  if (++ctx.count > ctx.maxBlocks)
    throw new RangeError(`Markdown has more than ${ctx.maxBlocks} blocks`);

  const block: BaseBlock = {
    id: `${flavour.replace(/^block:/, '')}-${createId()}`,
    flavour,
    parentId: null,
    children: [],
    content,
    props: checked,
  };
  let parent = ctx.nodes.get(parentId)!;

  // Блок, который родитель не принимает (например, код внутри пункта списка), встаёт у ближайшего подходящего предка.
  while (
    parent.flavour !== NOTE &&
    parent.parentId !== null &&
    !ctx.schema.validateRelation(parent.flavour, flavour)
  )
    parent = ctx.nodes.get(parent.parentId)!;

  block.parentId = parent.id;
  parent.children.push(block.id);
  ctx.nodes.set(block.id, block);

  return block;
}
