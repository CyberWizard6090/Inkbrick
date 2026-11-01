import { useMemo } from 'react';

import type { BaseBlock, BlockProps } from '@inkbrick/document';
import type { BlockContext, BlockController } from '@inkbrick/engine';

import { useEditor } from './useEditor';

export interface BlockControllerHandle<
  TProps extends BlockProps = BlockProps,
> extends BlockContext<TProps> {
  readonly controller: BlockController<TProps> | undefined;
}

/**
 * Контроллер блока для его React-компонента: `execute('counter.increment')` и `can(...)` уже знают `blockId`.
 * Команды уважают режим только чтения (возвращают undefined); для разметки используйте prop `readOnly`.
 */
export function useBlockController<TProps extends BlockProps = BlockProps>(
  block: BaseBlock,
): BlockControllerHandle<TProps> {
  const editor = useEditor();

  return useMemo(() => {
    const context = editor.controllers.contextOf<TProps>(block);

    return Object.assign(Object.create(context) as BlockContext<TProps>, {
      controller: editor.controllers.get(block.flavour) as BlockController<TProps> | undefined,
    });
  }, [editor, block]);
}
