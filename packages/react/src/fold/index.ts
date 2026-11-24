import type { BlockComponentRegistry } from '../ui/types';
import type { KeyBinding } from '../keymap/types';
import { FoldableHeadingBlock } from './FoldableHeadingBlock';
import { FoldableListBlock } from './FoldableListBlock';

export { FoldableHeadingBlock } from './FoldableHeadingBlock';
export { FoldableListBlock } from './FoldableListBlock';
export { computeFolds } from '@inkbrick/engine';
export { useFoldTracking } from './useFoldTracking';

/** Enter в конце свёрнутого заголовка сначала разворачивает его: иначе новый блок появился бы скрытым. */
const expandOnEnter: KeyBinding = {
  id: 'fold.expandOnEnter',
  keys: 'Enter',
  when: ({ selection, editor }) => {
    const current = selection();
    const block = current && editor.store.getBlock(current.from.blockId);

    return block?.flavour === 'block:heading' && block.props.collapsed === true;
  },
  run: ({ selection, editor }) => {
    const current = selection()!;

    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: current.from.blockId, props: { collapsed: false } },
    });

    return false;
  },
};

/**
 * Сворачивание заголовков: подключается одной строкой в провайдер —
 *
 * ```tsx
 * import { headingFolding } from '@inkbrick/react';
 *
 * <EditorProvider editor={editor} {...headingFolding}>…
 * ```
 *
 * Если у провайдера уже есть свои `components` или `keymap`, добавьте оба поля вручную: `components={{ ...headingFolding.components,
 * ...mine }}`, `keymap={[...headingFolding.keymap, ...mine]}`.
 */
export const headingFolding: {
  readonly components: BlockComponentRegistry;
  readonly keymap: readonly KeyBinding[];
} = {
  components: { 'block:heading': FoldableHeadingBlock as never },
  keymap: [expandOnEnter],
};

/** Список блока пункта, в котором стоит каретка, если у пункта есть вложенные блоки. */
const listItemWithChildren = ({
  selection,
  editor,
}: Parameters<NonNullable<KeyBinding['when']>>[0]) => {
  const current = selection();
  const block = current && editor.store.getBlock(current.from.blockId);

  return block?.flavour === 'block:list' && block.children.length > 0 ? block : undefined;
};

/**
 * Ctrl/Cmd+Enter сворачивает и разворачивает пункт, в котором стоит каретка; Tab, который вложил бы блок в свёрнутый пункт,
 * сначала разворачивает его: иначе блок исчез бы с экрана.
 */
const listKeymap: readonly KeyBinding[] = [
  {
    id: 'fold.list.toggle',
    keys: 'Mod-Enter',
    when: (context) => !context.editor.readOnly && !!listItemWithChildren(context),
    run: (context) => {
      const block = listItemWithChildren(context)!;

      context.editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: block.id, props: { collapsed: block.props.collapsed !== true } },
      });
    },
  },
  {
    id: 'fold.list.expandOnIndent',
    keys: 'Tab',
    when: ({ selection, editor }) => {
      const current = selection();
      const block = current && editor.store.getBlock(current.from.blockId);
      const previous = block && editor.document.getPreviousSibling(block.id);

      return (
        block?.flavour === 'block:list' &&
        previous?.flavour === 'block:list' &&
        previous.props.collapsed === true
      );
    },
    run: ({ selection, editor }) => {
      const previous = editor.document.getPreviousSibling(selection()!.from.blockId)!;

      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: previous.id, props: { collapsed: false } },
      });

      return false;
    },
  },
];

/**
 * Сворачивание вложенных блоков пункта списка: подключается одной строкой в провайдер, как `headingFolding` —
 *
 * ```tsx
 * <EditorProvider editor={editor} {...listFolding}>…
 * ```
 *
 * Оба сворачивания сразу: `{...folding}`. Если у провайдера уже есть свои `components` или `keymap`, добавьте оба поля
 * вручную: `components={{ ...listFolding.components, ...mine }}`, `keymap={[...listFolding.keymap, ...mine]}`.
 */
export const listFolding: {
  readonly components: BlockComponentRegistry;
  readonly keymap: readonly KeyBinding[];
} = {
  components: { 'block:list': FoldableListBlock as never },
  keymap: listKeymap,
};

/** Сворачивание и заголовков, и пунктов списка. */
export const folding: {
  readonly components: BlockComponentRegistry;
  readonly keymap: readonly KeyBinding[];
} = {
  components: { ...headingFolding.components, ...listFolding.components },
  keymap: [...headingFolding.keymap, ...listFolding.keymap],
};
