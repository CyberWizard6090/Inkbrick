import type { Editor } from '../editor/Editor';
import { isTextBlock, orderRange, type BlockPoint } from '../utils';
import type { Fragment, FragmentBlock } from './types';

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

  for (const block of range.blocks) {
    const parent = block.parentId ? getBlock(block.parentId) : undefined;

    // Страница и заметка (дети страницы) — структура документа, а не содержимое.
    if (!editor.schema.hasBlock(block.flavour) || !parent?.parentId) continue;

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
