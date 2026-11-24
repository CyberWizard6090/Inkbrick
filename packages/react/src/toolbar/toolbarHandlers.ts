import type { Editor } from '@inkbrick/engine';

import { openInlineFormula, setLinkInSelection, toggleFormatInSelection } from '@inkbrick/view';
import type { EditorView, DocSelection } from '@inkbrick/view';
import { setAlignInSelection, setColorInSelection } from './rich';
import { syncToolbar } from './syncToolbar';
import type { ToolbarProps } from './types';

export type ToolbarHandlers = Pick<
  ToolbarProps,
  | 'onToggle'
  | 'onOpenLink'
  | 'onApplyLink'
  | 'onCancelLink'
  | 'onTogglePanel'
  | 'onApplyColor'
  | 'onAlign'
  | 'onInsertFormula'
>;

/** Действия кнопок форматирования над выделением `range` — общие для плавающего toolbar и контекстного меню. */
export function toolbarHandlers(
  editor: Editor,
  view: EditorView,
  range: DocSelection,
  options: { onFormula?: () => void } = {},
): ToolbarHandlers {
  return {
    onToggle: (format) => {
      toggleFormatInSelection(editor, view, range, format);
      syncToolbar(editor, view);
    },
    onOpenLink: () => view.toolbar.openLink(),
    onApplyLink: (url) => {
      if (!setLinkInSelection(editor, view, range, url)) return false;

      view.toolbar.closeLink();
      syncToolbar(editor, view);

      return true;
    },
    onTogglePanel: (panel) => view.toolbar.togglePanel(panel),
    onApplyColor: (kind, value) => {
      setColorInSelection(editor, view, range, kind, value);
      view.toolbar.closePanel();
      syncToolbar(editor, view);
    },
    onAlign: (align) => {
      setAlignInSelection(editor, view, range, align);
      syncToolbar(editor, view);
    },
    onInsertFormula: () => {
      options.onFormula?.();
      view.placeSelection(range.from, range.to);
      openInlineFormula(editor, view);
    },
    onCancelLink: () => {
      view.toolbar.closeLink();
      view.placeSelection(range.from, range.to);
      syncToolbar(editor, view);
    },
  };
}
