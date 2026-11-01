import { flushSync } from 'react-dom';

import type { CaretResult, Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import type { TFunction } from '../i18n/translate';
import { Icon } from '../icons/Icon';
import { availableSlashItems } from '../slash/items';
import type { SlashMenuItem } from '../slash/types';
import { syncSlashMenu } from '../slash/syncSlashMenu';
import { iconByName } from '../controllers/adapters';
import type { BlockMenuAction } from './types';

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
): { actions: BlockMenuAction[]; turnInto: BlockMenuAction[] } {
  const previous = editor.document.getPreviousSibling(blockId);
  const next = editor.document.getNextSibling(blockId);
  const perform = (fn: () => unknown) => () => performBlockAction(view, fn);

  const moveUp = previous && { blockId, targetId: previous.id, position: 'before' as const };
  const moveDown = next && { blockId, targetId: next.id, position: 'after' as const };

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

  const actions: BlockMenuAction[] = [
    ...own,
    {
      id: 'duplicate',
      title: t('menu.duplicate'),
      icon: <Icon name="copy" />,
      disabled: !editor.can('duplicateBlock', { blockId }),
      run: perform(() => editor.dispatch({ type: 'duplicateBlock', payload: { blockId } })),
    },
    {
      id: 'move-up',
      title: t('menu.moveUp'),
      icon: <Icon name="arrow-up" />,
      disabled: !moveUp || !editor.can('moveBlock', moveUp),
      run: perform(() => moveUp && editor.dispatch({ type: 'moveBlock', payload: moveUp })),
    },
    {
      id: 'move-down',
      title: t('menu.moveDown'),
      icon: <Icon name="arrow-down" />,
      disabled: !moveDown || !editor.can('moveBlock', moveDown),
      run: perform(() => moveDown && editor.dispatch({ type: 'moveBlock', payload: moveDown })),
    },
    {
      id: 'delete',
      title: t('menu.delete'),
      icon: <Icon name="trash" />,
      danger: true,
      run: perform(() => editor.execute('delete-block', { id: blockId })),
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

  return { actions, turnInto };
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
