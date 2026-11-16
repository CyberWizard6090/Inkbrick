import type { BlockComponentRegistry } from '../ui/types';
import type { KeyBinding } from '../keymap/types';
import { FoldableHeadingBlock } from './FoldableHeadingBlock';

export { FoldableHeadingBlock } from './FoldableHeadingBlock';
export { computeFolds } from './computeFolds';
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
