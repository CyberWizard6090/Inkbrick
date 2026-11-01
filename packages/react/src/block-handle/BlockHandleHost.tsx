import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useEditorUI } from '../ui/EditorUIContext';
import { addBlockBelow, buildBlockActions } from './actions';
import { DefaultBlockHandle } from './DefaultBlockHandle';
import { DefaultBlockMenu } from './DefaultBlockMenu';
import { startGripGesture } from './gripGesture';
import type { GripProps } from './types';
import { useBlockDrag } from './useBlockDrag';

const GRIP_STYLE = Object.freeze({ touchAction: 'none' as const });

/**
 * Ручка блока и меню действий. `slots.BlockHandle = null` отключает их вместе со встроенным перетаскиванием;
 * линию вставки рисует DropIndicatorHost, поэтому свой DnD через `useBlockDrag` работает и без ручек.
 */
export function BlockHandleHost() {
  const editor = useEditor();
  const view = useEditorView();
  const drag = useBlockDrag();
  const { slots, slashItems, t } = useEditorUI();
  const readOnly = useReadOnly();
  const state = useSyncExternalStore(
    view.blocks.subscribe,
    view.blocks.getState,
    view.blocks.getState,
  );
  const cleanup = useRef<(() => void) | null>(null);

  // Не оставляем слушателей, если компонент исчез посреди перетаскивания.
  useEffect(() => () => cleanup.current?.(), []);

  if (slots.BlockHandle === null || readOnly || typeof document === 'undefined') return null;

  const { hover, menu } = state;
  const dragging = state.drag;

  const openMenuFor = (blockId: string) => {
    const anchor = view.blocks.getState().hover ?? hover;

    if (anchor) view.blocks.openMenu({ blockId, x: anchor.x, y: anchor.y + 30 });
  };

  const gripPropsFor = (blockId: string): GripProps => ({
    onPointerDown: (event) => {
      if (event.button !== 0) return;

      event.preventDefault();
      cleanup.current?.();

      const anchor = hover;
      const cancel = startGripGesture(drag, blockId, event.nativeEvent, {
        onTap: () => {
          cleanup.current = null;
          if (anchor) view.blocks.openMenu({ blockId, x: anchor.x, y: anchor.y + 30 });
        },
      });

      cleanup.current = cancel;
    },
    onContextMenu: (event) => event.preventDefault(),
    style: GRIP_STYLE,
    'data-inkbrick-grip': '',
  });

  const Handle = slots.BlockHandle ?? DefaultBlockHandle;
  const Menu = slots.BlockMenu ?? DefaultBlockMenu;
  const activeId = dragging?.blockId ?? hover?.blockId;

  const menuBlock = menu ? editor.store.getBlock(menu.blockId) : undefined;
  const menuContent =
    menu && menuBlock ? buildBlockActions(editor, view, menu.blockId, slashItems, t) : null;

  return createPortal(
    <>
      {hover && activeId && (
        <Handle
          blockId={activeId}
          position={{ x: hover.x, y: hover.y }}
          canAdd={editor.can('insertBlock', { flavour: 'block:paragraph', afterId: activeId })}
          dragging={!!dragging}
          menuOpen={!!menu}
          onAdd={() => addBlockBelow(editor, view, activeId, slashItems)}
          onOpenMenu={() => openMenuFor(activeId)}
          gripProps={gripPropsFor(activeId)}
        />
      )}

      {menu && menuBlock && menuContent && (
        <Menu
          block={menuBlock}
          position={{ x: menu.x, y: menu.y }}
          actions={menuContent.actions}
          turnInto={menuContent.turnInto}
          onClose={() => {
            view.blocks.closeMenu();
            view.getRoot()?.focus({ preventScroll: true });
          }}
        />
      )}
    </>,
    document.body,
  );
}
