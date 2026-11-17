import { flushSync } from 'react-dom';

import type { CaretResult, Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import type { TFunction } from '../i18n/translate';
import { Icon } from '../icons/Icon';
import { availableSlashItems } from '../slash/items';
import type { SlashMenuItem } from '../slash/types';
import { syncSlashMenu } from '../slash/syncSlashMenu';
import { iconByName } from '../controllers/adapters';
import { BLOCK_BACKGROUNDS, getBlockBackground } from '@inkbrick/document';

import { deleteBlocks, duplicateBlocks, moveBlocks, targetsOf } from '../pick/actions';
import type { BlockMenuAction, BlockMenuBackground } from './types';

const isCaret = (value: unknown): value is CaretResult =>
  typeof value === 'object' && value !== null && 'blockId' in value && 'offset' in value;

export function performBlockAction(view: EditorView, action: () => unknown): void {
  let result: unknown;

  flushSync(() => {
    result = action();
  });

  view.blocks.closeMenu();

  if (isCaret(result) && view.getElement(result.blockId)) {
    view.placeCaret(result.blockId, result.offset);
  } else {
    view.getRoot()?.focus({ preventScroll: true });
  }
}

export function buildBlockActions(
  editor: Editor,
  view: EditorView,
  blockId: string,
  slashItems: readonly SlashMenuItem[],
  t: TFunction,
): {
  actions: BlockMenuAction[];
  turnInto: BlockMenuAction[];
  background?: BlockMenuBackground;
} {
  const group = targetsOf(view, blockId);
  const previous = editor.document.getPreviousSibling(group[0]);
  const next = editor.document.getNextSibling(group.at(-1)!);
  const perform = (fn: () => unknown) => () => performBlockAction(view, fn);

  const moveUp = previous && {
    blockId: group[0],
    targetId: previous.id,
    position: 'before' as const,
  };
  const moveDown = next && {
    blockId: group.at(-1)!,
    targetId: next.id,
    position: 'after' as const,
  };

  const block = editor.store.getBlock(blockId);
  const controller = block && editor.controllers.get(block.flavour);
  const own = (controller?.menuItems ?? []).map<BlockMenuAction>((item) => {
    const context = editor.controllers.contextOf(block!);

    return {
      id: item.id,
      title: item.title,
      icon: iconByName(item.icon),
      danger: item.danger,
      disabled: item.isDisabled ? item.isDisabled(context) : context.readOnly,
      run: perform(() => item.run(context)),
    };
  });

  // Блок в выбранном ряду (несколько блоков выбраны целиком): дублирование, перенос и удаление относятся ко всему ряду.
  const several = group.length > 1;

  const actions: BlockMenuAction[] = [
    ...own,
    {
      id: 'duplicate',
      title: t('menu.duplicate'),
      icon: <Icon name="copy" />,
      disabled: several
        ? !group.some((id) => editor.can('duplicateBlock', { blockId: id }))
        : !editor.can('duplicateBlock', { blockId }),
      run: several
        ? () => {
            duplicateBlocks(editor, view, group);
            view.blocks.closeMenu();
          }
        : perform(() => editor.dispatch({ type: 'duplicateBlock', payload: { blockId } })),
    },
    {
      id: 'move-up',
      title: t('menu.moveUp'),
      icon: <Icon name="arrow-up" />,
      disabled: !moveUp || !editor.can('moveBlock', moveUp),
      run: several
        ? () => {
            moveBlocks(editor, view, group, -1);
            view.blocks.closeMenu();
          }
        : perform(() => moveUp && editor.dispatch({ type: 'moveBlock', payload: moveUp })),
    },
    {
      id: 'move-down',
      title: t('menu.moveDown'),
      icon: <Icon name="arrow-down" />,
      disabled: !moveDown || !editor.can('moveBlock', moveDown),
      run: several
        ? () => {
            moveBlocks(editor, view, group, 1);
            view.blocks.closeMenu();
          }
        : perform(() => moveDown && editor.dispatch({ type: 'moveBlock', payload: moveDown })),
    },
    {
      id: 'delete',
      title: t('menu.delete'),
      icon: <Icon name="trash" />,
      danger: true,
      run: several
        ? () => {
            deleteBlocks(editor, view, group);
            view.blocks.closeMenu();
          }
        : perform(() => editor.execute('delete-block', { id: blockId })),
    },
  ];

  const turnInto = availableSlashItems(editor, slashItems, blockId)
    .filter((item) =>
      editor.can('convertBlock', { blockId, flavour: item.flavour, props: item.props }),
    )
    .map<BlockMenuAction>((item) => ({
      id: item.id,
      title: item.title,
      icon: item.icon,
      run: perform(() =>
        editor.dispatch({
          type: 'convertBlock',
          payload: { blockId, flavour: item.flavour, props: item.props as never },
        }),
      ),
    }));

  // Фон есть у текстовых блоков, чья схема его допускает: движок проверяет props, так что свои блоки без фона его не покажут.
  const background: BlockMenuBackground | undefined =
    block && editor.can('setBlockProps', { blockId, props: { background: BLOCK_BACKGROUNDS[0] } })
      ? {
          current: getBlockBackground(block),
          options: BLOCK_BACKGROUNDS,
          onPick: (color) =>
            performBlockAction(view, () =>
              editor.dispatch({
                type: 'setBlockProps',
                payload: { blockId, props: { background: color ?? undefined } as never },
              }),
            ),
        }
      : undefined;

  return { actions, turnInto, background };
}

export function addBlockBelow(
  editor: Editor,
  view: EditorView,
  blockId: string,
  slashItems: readonly SlashMenuItem[],
): void {
  const block = editor.store.getBlock(blockId);
  const parent = block?.parentId ? editor.store.getBlock(block.parentId) : undefined;

  if (!block || !parent) return;

  // Рядом с вложенным блоком вставляем блок того же типа: параграф «провалился» бы внутрь списка.
  const nested = parent.flavour !== 'block:note';
  const payload = {
    flavour: nested ? block.flavour : 'block:paragraph',
    afterId: blockId,
    props: nested ? (block.props as never) : undefined,
    content: [{ insert: '/' }],
  };

  let caret: CaretResult | undefined;

  flushSync(() => {
    caret = editor.dispatch({ type: 'insertBlock', payload }) as CaretResult | undefined;
  });

  view.blocks.setHover(null);

  if (!caret) return;

  view.placeCaret(caret.blockId, 1);
  view.slash.open(caret.blockId, 0);
  syncSlashMenu(editor, view, slashItems);
}
