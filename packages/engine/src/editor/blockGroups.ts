import {
  BLOCK_BACKGROUNDS,
  getBlockBackgroundColor,
  type BlockId,
  type BlockProps,
} from '@inkbrick/document';

import { convertsAsGroup } from '../commands/BlockGroupCommands';

import type { Fragment } from '../clipboard/types';
import type { Editor } from './Editor';

/*
 * Запросы к дереву для действий над группой блоков (выбор целиком, Shift+клик, копирование выбранного). Без интерфейса:
 * их используют и `@inkbrick/react`, и код, который работает с документом на сервере.
 */

/**
 * Блок, который выбирают целиком: блок под кареткой, а для частей составных блоков (ячейка и строка таблицы) — сама
 * таблица. Корень, страница и заметка блоками не выбираются (`undefined`).
 */
export function pickableBlock(editor: Editor, blockId: BlockId): BlockId | undefined {
  let block = editor.store.getBlock(blockId);

  while (block && (block.flavour === 'block:table-cell' || block.flavour === 'block:table-row')) {
    block = block.parentId ? editor.store.getBlock(block.parentId) : undefined;
  }

  const parent = block?.parentId ? editor.store.getBlock(block.parentId) : undefined;

  return block && parent && parent.flavour !== 'block:page' ? block.id : undefined;
}

/** Блок верхнего уровня заметки, в котором лежит `blockId` (или он сам). */
export function topBlock(editor: Editor, blockId: BlockId): BlockId | undefined {
  for (
    let block = editor.store.getBlock(blockId);
    block?.parentId;
    block = editor.store.getBlock(block.parentId)
  ) {
    if (editor.store.getBlock(block.parentId)?.flavour === 'block:note') return block.id;
  }

  return undefined;
}

/** Соседи блока (дети его родителя) в порядке документа. */
export function siblingsOf(editor: Editor, blockId: BlockId): readonly BlockId[] {
  const parent = editor.store.getBlock(blockId)?.parentId;

  return parent ? (editor.store.getBlock(parent)?.children ?? []) : [];
}

/** Подряд идущие соседи от `a` до `b` включительно; `undefined`, если блоки не соседи. */
export function runBetween(editor: Editor, a: BlockId, b: BlockId): readonly BlockId[] | undefined {
  const siblings = siblingsOf(editor, a);
  const from = siblings.indexOf(a);
  const to = siblings.indexOf(b);

  if (from < 0 || to < 0) return undefined;

  return siblings.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** Блоки группы, которые превратятся в `flavour` командой `convertBlocks` (для пунктов меню «Превратить в»). */
export function convertibleIn(
  editor: Editor,
  ids: readonly BlockId[],
  target: { readonly flavour: string; readonly props?: unknown },
): readonly BlockId[] {
  if (!convertsAsGroup(editor.schema, target.flavour, ids.length)) return [];

  return ids.filter((blockId) =>
    editor.can('convertBlock', {
      blockId,
      flavour: target.flavour,
      props: target.props as BlockProps | undefined,
    }),
  );
}

/** Блоки группы, у которых бывает фон (их меняет `setBlockBackgrounds`). */
export function backgroundTargets(editor: Editor, ids: readonly BlockId[]): readonly BlockId[] {
  return ids.filter((blockId) =>
    editor.can('setBlockProps', { blockId, props: { background: BLOCK_BACKGROUNDS[0] } }),
  );
}

/** Общий фон блоков (имя из палитры или свой цвет); `undefined` — фона нет или он разный. */
export function commonBackground(editor: Editor, ids: readonly BlockId[]): string | undefined {
  const colors = new Set(ids.map((id) => getBlockBackgroundColor(editor.store.getBlock(id)!)));

  return colors.size === 1 ? [...colors][0] : undefined;
}

/** Самый глубокий последний потомок блока (или он сам): конец блока вместе со вложенными. */
function lastDescendant(editor: Editor, blockId: BlockId) {
  let block = editor.store.getBlock(blockId);

  for (let last = block?.children.at(-1); last; last = block?.children.at(-1))
    block = editor.store.getBlock(last);

  return block;
}

/**
 * Фрагмент из блоков группы целиком (для буфера обмена): блоки, выбранные вразброс, идут подряд, без тех, что между ними.
 * `null` — блок пропал.
 */
export function blocksFragment(editor: Editor, ids: readonly BlockId[]): Fragment | null {
  const blocks: Fragment['blocks'] = [];
  const place = new Map(siblingsOf(editor, ids[0]).map((id, index) => [id, index]));
  let start = 0;

  for (let i = 1; i <= ids.length; i++) {
    if (i < ids.length && place.get(ids[i]) === place.get(ids[i - 1])! + 1) continue;

    const first = editor.store.getBlock(ids[start]);
    const last = lastDescendant(editor, ids[i - 1]);

    start = i;

    if (!first || !last) return null;

    const part = editor.copyFragment(
      { blockId: first.id, offset: 0 },
      { blockId: last.id, offset: editor.engine.inline.length(last.content) },
    );

    if (!part) return null;

    blocks.push(...part.blocks);
  }

  return { blocks };
}
