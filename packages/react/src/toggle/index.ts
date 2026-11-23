import { ToggleSchema, type ToggleProps } from '@inkbrick/document';

import { defineBlock, type AnyReactBlockDefinition } from '../blocks/defineBlock';
import type { KeyBinding } from '../keymap/types';
import type { BlockComponent } from '../ui/types';
import { ToggleBlock } from './ToggleBlock';

export { ToggleBlock } from './ToggleBlock';

const length = (content: readonly { readonly insert: string }[]) =>
  content.reduce((total, node) => total + node.insert.length, 0);

/**
 * Enter в конце раскрытого переключателя создаёт первый вложенный блок (а не соседний, как в обычной строке), в пустом
 * вложенном абзаце — выходит из переключателя под него.
 */
const keymap: readonly KeyBinding[] = [
  {
    id: 'toggle.enterInside',
    keys: 'Enter',
    when: ({ selection, editor }) => {
      const current = selection();
      const block = current && editor.store.getBlock(current.from.blockId);

      return (
        !!current &&
        current.collapsed &&
        block?.flavour === 'block:toggle' &&
        block.props.open !== false &&
        current.from.offset === length(block.content)
      );
    },
    run: ({ selection, exec, run }) => {
      const { blockId } = selection()!.from;

      run(() =>
        exec({ type: 'insertBlock', payload: { flavour: 'block:paragraph', parentId: blockId } }),
      );
    },
  },
  {
    id: 'toggle.exitWhenEmpty',
    keys: 'Enter',
    when: ({ selection, editor }) => {
      const current = selection();
      const block = current && editor.store.getBlock(current.from.blockId);
      const parent = block?.parentId ? editor.store.getBlock(block.parentId) : undefined;

      return (
        !!current &&
        current.collapsed &&
        block?.flavour === 'block:paragraph' &&
        parent?.flavour === 'block:toggle' &&
        length(block.content) === 0 &&
        parent.children[parent.children.length - 1] === block.id
      );
    },
    run: ({ selection, exec, run }) => {
      const { blockId } = selection()!.from;

      run(() => {
        exec({ type: 'outdentBlock', payload: { blockId } });

        return { blockId, offset: 0 };
      });
    },
  },
];

/**
 * Переключатель: схема, отрисовка, пункт slash-меню и клавиши. Подключается и к редактору, и к провайдеру:
 *
 * ```tsx
 * import { toggleBlocks } from '@inkbrick/react';
 *
 * const editor = new Editor({ blocks: toggleBlocks });
 *
 * <EditorProvider editor={editor} blocks={toggleBlocks}>…
 * ```
 */
export const toggleBlocks: readonly AnyReactBlockDefinition[] = [
  defineBlock<ToggleProps>({
    schema: ToggleSchema,
    component: ToggleBlock as unknown as BlockComponent as never,
    keymap,
    controller: {
      slashItems: [
        {
          id: 'toggle',
          group: 'advanced',
          title: 'Toggle',
          description: 'A line that hides and shows the blocks inside it',
          keywords: ['toggle', 'collapse', 'details', 'fold'],
          icon: 'chevron-right',
        },
      ],
    },
  }),
];
