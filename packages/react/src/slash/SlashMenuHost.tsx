import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useEditorUI } from '../ui/EditorUIContext';
import { applySlashItem } from './applySlashItem';
import { DefaultSlashMenu } from './DefaultSlashMenu';
import { visibleSlashItems } from './items';

export function SlashMenuHost() {
  const editor = useEditor();
  const view = useEditorView();
  const { slots, slashItems } = useEditorUI();
  const readOnly = useReadOnly();
  const state = useSyncExternalStore(
    view.slash.subscribe,
    view.slash.getState,
    view.slash.getState,
  );

  if (
    readOnly ||
    !state.open ||
    !state.blockId ||
    !state.position ||
    typeof document === 'undefined'
  ) {
    return null;
  }

  const items = visibleSlashItems(editor, slashItems, state.blockId, state.query);
  const Menu = slots.SlashMenu ?? DefaultSlashMenu;

  return createPortal(
    <Menu
      items={items}
      query={state.query}
      activeIndex={Math.min(state.activeIndex, Math.max(items.length - 1, 0))}
      position={state.position}
      onSelect={(item) => applySlashItem(editor, view, item)}
      onHover={(index) => view.slash.update({ activeIndex: index })}
      onClose={() => view.slash.close()}
    />,
    document.body,
  );
}
