import { TABLE, TABLE_CELL, TABLE_ROW, type BaseBlock, type BlockId } from '@inkbrick/document';

import type { Editor } from '../editor/Editor';
import { isTextBlock, orderRange, type BlockPoint } from '../utils';
import type { Fragment, FragmentBlock } from './types';

const TABLE_PARTS = new Set([TABLE, TABLE_ROW, TABLE_CELL]);

/** Таблица, к которой относится блок: он сам, его строка или ячейка. */
function tableOf(editor: Editor, block: BaseBlock): BaseBlock | undefined {
  for (let current: BaseBlock | undefined = block; current;) {
    if (current.flavour === TABLE) return current;

    current = current.parentId ? editor.store.getBlock(current.parentId) : undefined;
  }

  return undefined;
}

/**
 * Часть таблицы в выделении. Выделение идёт по порядку документа, поэтому в него попадают ячейки от первой до
 * последней выделенной (в строках между ними — все ячейки). Результат — прямоугольная таблица из строк, в которых
 * есть выделенные ячейки, и столбцов, в которых они есть; ячейки, не попавшие в выделение, пусты.
 * Выделение внутри одной ячейки — не таблица, а абзац с её текстом.
 */
function extractTable(
  editor: Editor,
  table: BaseBlock,
  inRange: ReadonlySet<BlockId>,
  range: { from: BlockPoint; to: BlockPoint },
): FragmentBlock | undefined {
  const { inline } = editor.engine;
  const getBlock = editor.store.getBlock.bind(editor.store);
  const rows = table.children
    .map(getBlock)
    .filter((row): row is BaseBlock => row?.flavour === TABLE_ROW)
    .map((row) => row.children.map(getBlock).filter((cell): cell is BaseBlock => !!cell));
  const selected = (cell: BaseBlock) => inRange.has(cell.id);
  const sliced = (cell: BaseBlock) => {
    const length = inline.length(cell.content);
    const start = cell.id === range.from.blockId ? range.from.offset : 0;
    const end = cell.id === range.to.blockId ? range.to.offset : length;

    return {
      content: inline.split(inline.split(cell.content, start)[1], end - start)[0],
      complete: start === 0 && end === length,
    };
  };

  const hit = rows.flatMap((row) => row.filter(selected));

  if (hit.length === 0) return undefined;

  if (hit.length === 1 && !inRange.has(table.id)) {
    const { content, complete } = sliced(hit[0]);

    return {
      flavour: 'block:paragraph',
      props: {},
      content: structuredClone(content),
      children: [],
      complete,
    };
  }

  const keptRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some(selected));
  const columns = Math.max(...rows.map((row) => row.length));
  const keptColumns = Array.from({ length: columns }, (_, column) => column).filter((column) =>
    keptRows.some(({ row }) => row[column] && selected(row[column])),
  );
  const widths = Array.isArray(table.props.widths) ? table.props.widths : [];
  const props: Record<string, unknown> = {
    // Заголовок остаётся заголовком, только если в выделение попала первая строка.
    header: table.props.header !== false && keptRows[0].index === 0,
  };

  if (keptColumns.some((column) => typeof widths[column] === 'number'))
    props.widths = keptColumns.map((column) => widths[column] ?? null);

  return {
    flavour: TABLE,
    props,
    content: [],
    complete: true,
    children: keptRows.map(({ row }) => ({
      flavour: TABLE_ROW,
      props: {},
      content: [],
      children: keptColumns.map((column): FragmentBlock => {
        const cell = row[column];

        return {
          flavour: TABLE_CELL,
          props: cell ? structuredClone(cell.props) : {},
          content: cell && selected(cell) ? structuredClone(sliced(cell).content) : [],
          children: [],
        };
      }),
    })),
  };
}

/**
 * Копирует выделение (в том числе из нескольких блоков) во фрагмент: типы, props, форматирование, вложенность.
 * Структурные блоки (страница, заметка) и блоки неизвестного типа не копируются.
 */
export function extractFragment(editor: Editor, a: BlockPoint, b: BlockPoint): Fragment {
  const getBlock = editor.store.getBlock.bind(editor.store);
  const range = orderRange(getBlock, editor.document.rootId, a, b);

  if (!range) return { blocks: [] };

  const { inline } = editor.engine;
  const roots: FragmentBlock[] = [];
  const byId = new Map<string, FragmentBlock>();
  const inRange = new Set(range.blocks.map((item) => item.id));
  const doneTables = new Set<string>();

  for (const block of range.blocks) {
    const parent = block.parentId ? getBlock(block.parentId) : undefined;

    // Страница и заметка (дети страницы) — структура документа, а не содержимое.
    if (!editor.schema.hasBlock(block.flavour) || !parent?.parentId) continue;

    // Таблица копируется целиком как таблица: строки и ячейки по отдельности бессмысленны.
    if (TABLE_PARTS.has(block.flavour)) {
      const table = tableOf(editor, block);

      if (table && !doneTables.has(table.id)) {
        doneTables.add(table.id);

        const part = extractTable(editor, table, inRange, range);

        if (part) roots.push(part);
      }

      continue;
    }

    let content = block.content;
    let complete = true;

    if (isTextBlock(editor.schema, block)) {
      const length = inline.length(block.content);
      const start = block.id === range.from.blockId ? range.from.offset : 0;
      const end = block.id === range.to.blockId ? range.to.offset : length;

      content = inline.split(inline.split(block.content, start)[1], end - start)[0];
      complete = start === 0 && end === length;
    }

    const copy: FragmentBlock = {
      flavour: block.flavour,
      props: structuredClone(block.props),
      content: structuredClone(content),
      children: [],
    };

    // Вложенный блок попадает в дерево, если выделен и его родитель; иначе становится корневым.
    const parentCopy = block.parentId ? byId.get(block.parentId) : undefined;

    if (parentCopy) {
      parentCopy.children.push(copy);
      byId.set(block.id, copy);
    } else {
      const root = { ...copy, complete };

      roots.push(root);
      byId.set(block.id, root);
    }
  }

  const [only] = roots;
  const empty =
    roots.length === 1 &&
    only.children.length === 0 &&
    inline.length(only.content) === 0 &&
    editor.schema.getBlockSchema(only.flavour)?.inline !== false;

  return { blocks: empty ? [] : roots };
}
