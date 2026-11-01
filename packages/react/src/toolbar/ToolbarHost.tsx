import { createPortal } from 'react-dom';
import { useSyncExternalStore } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { openInlineFormula } from '../formula/actions';
import { useEditorUI } from '../ui/EditorUIContext';
import { DefaultToolbar } from './DefaultToolbar';
import { setLinkInSelection, toggleFormatInSelection } from './formatting';
import { setAlignInSelection, setColorInSelection } from './rich';
import { syncToolbar } from './syncToolbar';

export function ToolbarHost() {
  const editor = useEditor();
  const view = useEditorView();
  const { slots } = useEditorUI();
  const readOnly = useReadOnly();
  const state = useSyncExternalStore(
    view.toolbar.subscribe,
    view.toolbar.getState,
    view.toolbar.getState,
  );

  if (slots.Toolbar === null || readOnly) return null;

  if (
    !state.visible ||
    !state.position ||
    !state.formats ||
    !state.range ||
    typeof document === 'undefined'
  ) {
    return null;
  }

  const Toolbar = slots.Toolbar ?? DefaultToolbar;
  const range = state.range;

  return createPortal(
    <Toolbar
      formats={state.formats}
      position={state.position}
      linkOpen={state.linkOpen}
      panel={state.panel}
      onToggle={(format) => {
        toggleFormatInSelection(editor, view, range, format);
        syncToolbar(editor, view);
      }}
      onOpenLink={() => view.toolbar.openLink()}
      onApplyLink={(url) => {
        if (!setLinkInSelection(editor, view, range, url)) return false;

        view.toolbar.closeLink();
        syncToolbar(editor, view);

        return true;
      }}
      onTogglePanel={(panel) => view.toolbar.togglePanel(panel)}
      onApplyColor={(kind, value) => {
        setColorInSelection(editor, view, range, kind, value);
        view.toolbar.closePanel();
        syncToolbar(editor, view);
      }}
      onAlign={(align) => {
        setAlignInSelection(editor, view, range, align);
        syncToolbar(editor, view);
      }}
      onInsertFormula={() => {
        view.placeSelection(range.from, range.to);
        openInlineFormula(editor, view);
      }}
      onCancelLink={() => {
        view.toolbar.closeLink();
        view.placeSelection(range.from, range.to);
        syncToolbar(editor, view);
      }}
    />,
    document.body,
  );
}
