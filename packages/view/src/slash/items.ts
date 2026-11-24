import type { Editor } from '@inkbrick/engine';

import { filterSlashItems } from './filter';
import { orderByGroup } from './groups';
import type { SlashMenuItem } from './types';

export function availableSlashItems<T extends SlashMenuItem>(
  editor: Editor,
  items: readonly T[],
  blockId: string,
): T[] {
  const block = editor.store.getBlock(blockId);
  const parent = block?.parentId ? editor.store.getBlock(block.parentId) : undefined;

  if (!block || !parent) return [];

  return orderByGroup(
    items.filter((item) =>
      !editor.schema.hasBlock(item.flavour)
        ? false
        : // Действие выполняется внутри блока, где набран «/», и не создаёт блок рядом: схема родителя не важна.
          item.run
          ? (item.canRun?.({ editor, blockId }) ?? true)
          : editor.schema.validateRelation(parent.flavour, item.flavour),
    ),
  );
}

export function visibleSlashItems<T extends SlashMenuItem>(
  editor: Editor,
  items: readonly T[],
  blockId: string,
  query: string,
): T[] {
  return filterSlashItems(availableSlashItems(editor, items, blockId), query);
}
