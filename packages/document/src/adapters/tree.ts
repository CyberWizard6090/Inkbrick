import type { Document } from '../document';
import type { TableMerge } from '../schema/blocks/TableSchema';
import { normalizeMerges } from '../utils/tableMerges';
import type { BaseBlock, BlockId, InlineNode } from '../model';
import type { SchemaRegistry } from '../schema';
import { footnoteNumbers, isFootnoteNode } from '../utils/footnote';
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

const DEFAULT_CONTAINERS = new Set(['block:page', 'block:note', 'block:columns', 'block:column']);

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

  // Номера сносок для вывода ссылок и текстов сносок: порядок первой ссылки в обходе документа.
  const ordered: BaseBlock[] = [];
  const walk = (items: readonly ExportNode[]) =>
    items.forEach(({ block, children }) => {
      ordered.push(block);
      walk(children);
    });

  walk(nodes);
  numbers = footnoteNumbers(ordered);
  const title =
    options.title !== false && startId === document.rootId && typeof start.props.title === 'string'
      ? start.props.title
      : undefined;

  return { nodes, title: title === '' ? undefined : title };
}

/** Номера сносок последнего собранного дерева экспорта (экспорт синхронный: дерево и вывод идут подряд). */
let numbers: ReadonlyMap<string, number> = new Map();

/** Метка сноски: её номер, а у сноски без ссылки — код. */
export const footnoteLabel = (id: string): string => String(numbers.get(id) ?? id);

export const plainOf = (content: readonly InlineNode[]): string =>
  content
    .map((node) =>
      isFootnoteNode(node)
        ? `[${footnoteLabel(String(node.attributes!.footnote))}]`.repeat(node.insert.length)
        : isFormulaNode(node)
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

export const isTable = (block: BaseBlock) => block.flavour === 'block:table';

export interface ExportTable {
  /** Первая строка — заголовок. */
  readonly header: boolean;
  /** Первый столбец — заголовок. */
  readonly headerColumn: boolean;
  /** Чередующиеся строки тела. */
  readonly striped: boolean;
  /** Границы ячеек (по умолчанию есть). */
  readonly borders: boolean;
  /** Строки; во всех строках поровну ячеек (недостающие — `undefined`, их выводят пустыми). */
  readonly rows: readonly (readonly (BaseBlock | undefined)[])[];
  readonly widths: readonly (number | null)[];
  /** Объединённые ячейки: пригодные к использованию, без пересечений. */
  readonly merges: readonly TableMerge[];
}

/** Таблица для экспорта: строки и ячейки по порядку. Лишние потомки (не строки, не ячейки) пропускаются. */
export function exportTable(node: ExportNode): ExportTable {
  const rows = node.children
    .filter(({ block }) => block.flavour === 'block:table-row')
    .map((row) =>
      row.children
        .filter(({ block }) => block.flavour === 'block:table-cell')
        .map(({ block }) => block),
    );
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const widths = node.block.props.widths;

  return {
    header: node.block.props.header !== false,
    headerColumn: node.block.props.headerColumn === true,
    striped: node.block.props.striped === true,
    borders: node.block.props.borders !== false,
    merges: normalizeMerges(node.block.props.merges, rows.length, columns),
    rows: rows.map((row) => Array.from({ length: columns }, (_, index) => row[index])),
    widths: Array.from({ length: columns }, (_, index) => {
      const width = Array.isArray(widths) ? widths[index] : null;

      return typeof width === 'number' && width > 0 ? width : null;
    }),
  };
}

export const isToc = (block: BaseBlock) => block.flavour === 'block:toc';

/** Заголовки документа по порядку, вместе с вложенными в другие блоки. */
export function collectHeadings(nodes: readonly ExportNode[]): BaseBlock[] {
  return nodes.flatMap(({ block, children }) => [
    ...(block.flavour === 'block:heading' ? [block] : []),
    ...collectHeadings(children),
  ]);
}

export interface OutlineItem {
  readonly block: BaseBlock;
  readonly children: readonly OutlineItem[];
}

/**
 * Заголовки оглавления деревом: заголовок следующего уровня вкладывается в предыдущий, пропущенные уровни
 * не оставляют пустых ступеней (после `h1` сразу `h3` — вложенный пункт). Выше `maxLevel` заголовки не берутся.
 */
export function tocOutline(headings: readonly BaseBlock[], toc: BaseBlock): OutlineItem[] {
  const max = typeof toc.props.maxLevel === 'number' ? Math.trunc(toc.props.maxLevel) : 6;
  const roots: { block: BaseBlock; children: OutlineItem[]; level: number }[] = [];
  const stack: typeof roots = [];

  for (const block of headings) {
    const level = headingLevel(block);

    if (level > max) continue;

    const item = { block, children: [], level };

    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();

    (stack.length > 0 ? stack[stack.length - 1].children : roots).push(item);
    stack.push(item);
  }

  return roots;
}
