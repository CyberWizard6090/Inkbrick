import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { readDocSelection } from '../editing/selection';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { Icon } from '../icons/Icon';
import { DefaultToolbar } from '../toolbar/DefaultToolbar';
import { toolbarHandlers } from '../toolbar/toolbarHandlers';
import { useEditorUI } from '../ui/EditorUIContext';
import {
  canReadClipboard,
  copySelection,
  pasteFromClipboard,
  selectAll,
  shortcutLabel,
} from './clipboardActions';
import { DefaultContextMenu } from './DefaultContextMenu';
import type { ContextMenuItem } from './types';

/** Содержимое открытого контекстного меню. Отдельный чанк: грузится заранее, но не входит в основной бандл. */
export function ContextMenuPanel() {
  const editor = useEditor();
  const view = useEditorView();
  const { slots, t } = useEditorUI();
  const readOnly = useReadOnly();
  const menu = useSyncExternalStore(
    view.contextMenu.subscribe,
    view.contextMenu.getState,
    view.contextMenu.getState,
  );
  const toolbar = useSyncExternalStore(
    view.toolbar.subscribe,
    view.toolbar.getState,
    view.toolbar.getState,
  );

  if (!menu.position || readOnly || slots.ContextMenu === null) return null;
  if (typeof document === 'undefined') return null;

  const root = view.getRoot();

  if (!root) return null;

  const selection = menu.selection ?? readDocSelection(root);

  /*
   * Фокус мог уйти в меню (стрелки, Tab): возвращаем его в документ вместе с выделением — иначе
   * «Копировать» отправило бы событие copy пункту меню, а не редактору.
   */
  const close = (refocus = true) => {
    view.contextMenu.close();

    if (!refocus) return;

    const current = readDocSelection(root);
    const same =
      !!current &&
      !!selection &&
      current.from.blockId === selection.from.blockId &&
      current.from.offset === selection.from.offset &&
      current.to.blockId === selection.to.blockId &&
      current.to.offset === selection.to.offset;

    if (selection && !same && editor.store.getBlock(selection.from.blockId))
      view.placeSelection(selection.from, selection.to);
    else if (document.activeElement !== root) root.focus({ preventScroll: true });
  };

  const hasText = !!selection && !selection.collapsed;

  const items: ContextMenuItem[] = [
    {
      id: 'cut',
      title: t('contextMenu.cut'),
      icon: <Icon name="scissors" />,
      shortcut: shortcutLabel('X'),
      disabled: !hasText,
      run: () => {
        close();
        copySelection(true);
      },
    },
    {
      id: 'copy',
      title: t('contextMenu.copy'),
      icon: <Icon name="copy" />,
      shortcut: shortcutLabel('C'),
      disabled: !hasText,
      run: () => {
        close();
        copySelection(false);
      },
    },
    {
      id: 'paste',
      title: t('contextMenu.paste'),
      icon: <Icon name="clipboard-paste" />,
      shortcut: shortcutLabel('V'),
      disabled: !selection || !canReadClipboard(),
      run: () => {
        close();
        void pasteFromClipboard(root);
      },
    },
    {
      id: 'selectAll',
      title: t('contextMenu.selectAll'),
      icon: <Icon name="select-all" />,
      shortcut: shortcutLabel('A'),
      run: () => {
        close();
        selectAll(root);
      },
    },
  ];

  const Toolbar = slots.Toolbar === null ? null : (slots.Toolbar ?? DefaultToolbar);
  const formatting =
    Toolbar && hasText && toolbar.visible && toolbar.formats && toolbar.range ? (
      <Toolbar
        formats={toolbar.formats}
        position={menu.position}
        placement="inline"
        linkOpen={toolbar.linkOpen}
        panel={toolbar.panel}
        {...toolbarHandlers(editor, view, toolbar.range, { onFormula: () => close(false) })}
      />
    ) : null;

  const Menu = slots.ContextMenu ?? DefaultContextMenu;

  return createPortal(
    <Menu position={menu.position} formatting={formatting} items={items} onClose={close} />,
    document.body,
  );
}
