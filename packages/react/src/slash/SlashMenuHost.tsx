import { useSyncExternalStore } from 'react';
import { visibleSlashItems } from '@inkbrick/view';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useEditorUI } from '../ui/EditorUIContext';
import { PortalPresence } from '../ui/Presence';
import { applySlashItem } from './applySlashItem';
import { lazyModule, useLazy } from '../ui/lazy';

const defaultSlashMenu = lazyModule(() =>
  import('./DefaultSlashMenu').then((module) => module.DefaultSlashMenu),
);

export function SlashMenuHost() {
  const editor = useEditor();
  const view = useEditorView();
  const { slots, slashItems } = useEditorUI();
  const readOnly = useReadOnly();
  const Default = useLazy(defaultSlashMenu, slots.SlashMenu === undefined && !readOnly);
  const state = useSyncExternalStore(
    view.slash.subscribe,
    view.slash.getState,
    view.slash.getState,
  );

  const shown =
    !readOnly &&
    state.open &&
    !!state.blockId &&
    !!state.position &&
    typeof document !== 'undefined';
  const Menu = slots.SlashMenu ?? Default;

  return (
    <PortalPresence
      open={shown && !!Menu}
      render={() => {
        const items = visibleSlashItems(editor, slashItems, state.blockId!, state.query);
        const Current = Menu!;

        return (
          <Current
            items={items}
            query={state.query}
            activeIndex={Math.min(state.activeIndex, Math.max(items.length - 1, 0))}
            position={state.position!}
            onSelect={(item) => applySlashItem(editor, view, item)}
            onHover={(index) => view.slash.update({ activeIndex: index })}
            onClose={() => view.slash.close()}
          />
        );
      }}
    />
  );
}
