import { flushSync } from 'react-dom';

import type { Editor } from '@inkbrick/engine';

import { availableSlashItems } from '@inkbrick/view';
import type { EditorView, DocSelection } from '@inkbrick/view';
import type { SlashMenuItem } from '../slash/types';
import type { ToolbarTurnInto } from './types';

/** Подходит ли пункт меню текущему блоку: тот же тип и те же свойства (кроме отметки задачи). */
function matches(item: SlashMenuItem, block: { flavour: string; props: Record<string, unknown> }) {
  return (
    item.flavour === block.flavour &&
    Object.entries(item.props ?? {}).every(
      ([key, value]) => key === 'checked' || block.props[key] === value,
    )
  );
}

/**
 * Список «Превратить в» для выделения в одном блоке: пункты меню вставки, в которые блок можно превратить (движок
 * проверяет схему и вложенность). Блок, в который превратить нельзя, и типы, которых он не принимает, не показываются;
 * если превращать некуда, возвращает `undefined` и кнопки нет.
 */
export function turnIntoFor(
  editor: Editor,
  view: EditorView,
  slashItems: readonly SlashMenuItem[],
  range: DocSelection | null,
): ToolbarTurnInto | undefined {
  if (!range || range.from.blockId !== range.to.blockId) return undefined;

  const blockId = range.from.blockId;
  const block = editor.store.getBlock(blockId);

  if (!block || editor.schema.getBlockSchema(block.flavour)?.inline === false) return undefined;

  const options = availableSlashItems(editor, slashItems, blockId)
    // Действия (вставить сноску) блок не превращают.
    .filter((item) => !item.run)
    .map((item) => ({ item, active: matches(item, block) }))
    .filter(
      ({ item, active }) =>
        active || editor.can('convertBlock', { blockId, flavour: item.flavour, props: item.props }),
    );

  if (!options.some(({ active }) => !active)) return undefined;

  const current = options.find(({ active }) => active)?.item.title;

  return {
    title: current ?? editor.schema.getBlockSchema(block.flavour)?.name ?? block.flavour,
    options: options.map(({ item, active }) => ({
      id: item.id,
      title: item.title,
      icon: item.icon,
      active,
      run: () => {
        flushSync(() => {
          editor.dispatch({
            type: 'convertBlock',
            payload: { blockId, flavour: item.flavour, props: item.props as never },
          });
        });
        // Выделение остаётся на тексте: превращение меняет блок, а не слова в нём.
        if (editor.store.getBlock(blockId)) view.placeSelection(range.from, range.to);
      },
    })),
  };
}
