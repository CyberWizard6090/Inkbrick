import type { Editor } from '@inkbrick/engine';

import { filterSlashItems } from './filter';
import type { SlashMenuItem } from './types';

export function availableSlashItems(
  editor: Editor,
  items: readonly SlashMenuItem[],
  blockId: string,
): SlashMenuItem[] {
  const block = editor.store.getBlock(blockId);
  const parent = block?.parentId ? editor.store.getBlock(block.parentId) : undefined;

  if (!block || !parent) return [];

  return items.filter(
    (item) =>
      editor.schema.hasBlock(item.flavour) &&
      editor.schema.validateRelation(parent.flavour, item.flavour),
  );
}

export function visibleSlashItems(
  editor: Editor,
  items: readonly SlashMenuItem[],
  blockId: string,
  query: string,
): SlashMenuItem[] {
  return filterSlashItems(availableSlashItems(editor, items, blockId), query);
}
