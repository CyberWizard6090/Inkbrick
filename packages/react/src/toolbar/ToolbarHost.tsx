import { useSyncExternalStore } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useEditorUI } from '../ui/EditorUIContext';
import { lazyModule, useLazy } from '../ui/lazy';
import { PortalPresence } from '../ui/Presence';
import { toolbarHandlers } from './toolbarHandlers';
import { turnIntoFor } from './turnInto';

const defaultToolbar = lazyModule(() =>
  import('./DefaultToolbar').then((module) => module.DefaultToolbar),
);

export function ToolbarHost() {
  const editor = useEditor();
  const view = useEditorView();
  const { slots, formatting, slashItems } = useEditorUI();
  const readOnly = useReadOnly();
  const Default = useLazy(defaultToolbar, slots.Toolbar === undefined && !readOnly);
  const state = useSyncExternalStore(
    view.toolbar.subscribe,
    view.toolbar.getState,
    view.toolbar.getState,
  );
  const menu = useSyncExternalStore(
    view.contextMenu.subscribe,
    view.contextMenu.getState,
    view.contextMenu.getState,
  );

  // Открытое контекстное меню само показывает кнопки форматирования.
  const visible =
    slots.Toolbar !== null &&
    !readOnly &&
    state.visible &&
    !!state.position &&
    !!state.formats &&
    !!state.range &&
    typeof document !== 'undefined' &&
    !menu.position;

  /*
   * В режиме контекстного меню плавающий toolbar показывается только пальцем (правого клика нет) и для
   * Ctrl/Cmd+K: полю ссылки нужно место у выделения.
   */
  const floating =
    formatting !== 'context-menu' ||
    slots.ContextMenu === null ||
    view.lastPointerType === 'touch' ||
    state.linkOpen;
  const Toolbar = slots.Toolbar ?? Default;

  return (
    <PortalPresence
      open={visible && floating && !!Toolbar}
      render={() => {
        const Current = Toolbar!;

        return (
          <Current
            formats={state.formats!}
            position={state.position!}
            placement="floating"
            linkOpen={state.linkOpen}
            panel={state.panel}
            turnInto={turnIntoFor(editor, view, slashItems, state.range!)}
            {...toolbarHandlers(editor, view, state.range!)}
          />
        );
      }}
    />
  );
}
