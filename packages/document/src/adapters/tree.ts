import type { Document } from '../document';
import type { BaseBlock, BlockId, InlineNode } from '../model';
import type { SchemaRegistry } from '../schema';
import { isFormulaNode } from '../utils/formula';

export interface ExportOptions {
  /** Реестр схем: по ролям блоков определяет контейнеры (page, note и пользовательские). Без него — только page и note. */
  schema?: SchemaRegistry;
  /** Экспортировать поддерево этого блока (по умолчанию — весь документ). */
  from?: BlockId;
  /** Выводить заголовок страницы (`props.title`) первой строкой; по умолчанию да. Только при экспорте всего документа. */
  title?: boolean;
}

/** Блок документа с потомками; контейнеры (page, note) в дерево экспорта не попадают — их дети поднимаются выше. */
export interface ExportNode {
  readonly block: BaseBlock;
  readonly children: readonly ExportNode[];
}

const DEFAULT_CONTAINERS = new Set(['block:page', 'block:note']);

export function buildExportTree(
  document: Document,
  options: ExportOptions = {},
): { nodes: ExportNode[]; title: string | undefined } {
  const startId = options.from ?? document.rootId;
  const start = document.getBlock(startId);

  if (!start) throw new Error(`Block "${startId}" not found`);

  const isContainer = (block: BaseBlock) =>
    options.schema
      ? options.schema.hasBlock(block.flavour) &&
        options.schema.getRole(block.flavour) !== 'content'
      : DEFAULT_CONTAINERS.has(block.flavour);

  const visited = new Set<BlockId>();

  const collect = (block: BaseBlock): ExportNode[] => {
    if (visited.has(block.id)) return [];
    visited.add(block.id);

    const children = document.getChildren(block.id).flatMap(collect);

    return isContainer(block) ? children : [{ block, children }];
  };

  const nodes = collect(start);
  const title =
    options.title !== false && startId === document.rootId && typeof start.props.title === 'string'
      ? start.props.title
      : undefined;

  return { nodes, title: title === '' ? undefined : title };
}

export const plainOf = (content: readonly InlineNode[]): string =>
  content
    .map((node) =>
      isFormulaNode(node)
        ? String(node.attributes!.formula).repeat(node.insert.length)
        : node.insert,
    )
    .join('');

export const stringProp = (block: BaseBlock, name: string, fallback = ''): string => {
  const value = block.props[name];

  return typeof value === 'string' ? value : fallback;
};

export const isList = (block: BaseBlock) => block.flavour === 'block:list';
export const isTodo = (block: BaseBlock) => isList(block) && block.props.type === 'todo';
export const isOrdered = (block: BaseBlock) => isList(block) && block.props.type === 'ordered';

export function headingLevel(block: BaseBlock): number {
  const level = block.props.level;

  return typeof level === 'number' && level >= 1 && level <= 6 ? Math.trunc(level) : 1;
}

export function groupSiblings(
  nodes: readonly ExportNode[],
): Array<{ list: boolean; nodes: readonly ExportNode[] }> {
  const groups: Array<{ list: boolean; nodes: readonly ExportNode[] }> = [];

  for (let i = 0; i < nodes.length;) {
    const list = isList(nodes[i].block);
    let j = i + 1;

    while (list && j < nodes.length && isList(nodes[j].block)) j++;

    groups.push({ list, nodes: nodes.slice(i, list ? j : i + 1) });
    i = j;
  }

  return groups;
}
