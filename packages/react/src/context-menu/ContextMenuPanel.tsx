import { useEffect, useState, useSyncExternalStore } from 'react';

import { readDocSelection } from '../editing/selection';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { Icon } from '../icons/Icon';
import { cellToolbar } from '../table/cellFormatting';
import { DefaultToolbar } from '../toolbar/DefaultToolbar';
import { toolbarHandlers } from '../toolbar/toolbarHandlers';
import { turnIntoFor } from '../toolbar/turnInto';
import type { ToolbarPanel } from '../toolbar/types';
import { useEditorUI } from '../ui/EditorUIContext';
import { PortalPresence } from '../ui/Presence';
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
  const { slots, t, contextMenu, slashItems } = useEditorUI();
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

  // Панель цвета у кнопок форматирования выделенных ячеек: у текста её состояние хранит toolbar, а у ячеек его нет.
  const [cellPanel, setCellPanel] = useState<ToolbarPanel | null>(null);
  const [, refresh] = useState(0);

  useEffect(() => {
    if (!menu.position) setCellPanel(null);
  }, [menu.position]);

  const root = view.getRoot();
  const open =
    !!menu.position &&
    !readOnly &&
    slots.ContextMenu !== null &&
    typeof document !== 'undefined' &&
    !!root;

  const render = () => {
    const rootElement = root!;
    const selection = menu.selection ?? readDocSelection(rootElement);

    /*
     * Фокус мог уйти в меню (стрелки, Tab): возвращаем его в документ вместе с выделением — иначе
     * «Копировать» отправило бы событие copy пункту меню, а не редактору.
     */
    const close = (refocus = true) => {
      view.contextMenu.close();

      if (!refocus) return;

      const current = readDocSelection(rootElement);
      const same =
        !!current &&
        !!selection &&
        current.from.blockId === selection.from.blockId &&
        current.from.offset === selection.from.offset &&
        current.to.blockId === selection.to.blockId &&
        current.to.offset === selection.to.offset;

      if (selection && !same && editor.store.getBlock(selection.from.blockId))
        view.placeSelection(selection.from, selection.to);
      else if (document.activeElement !== rootElement) rootElement.focus({ preventScroll: true });
    };

    const picked = view.cells.get();
    const hasText = (!!selection && !selection.collapsed) || !!picked;

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
          void pasteFromClipboard(rootElement);
        },
      },
      {
        id: 'selectAll',
        title: t('contextMenu.selectAll'),
        icon: <Icon name="select-all" />,
        shortcut: shortcutLabel('A'),
        run: () => {
          close();
          selectAll(rootElement);
        },
      },
    ];

    const context = { editor, view, selection, t, close };

    for (const contribute of contextMenu) {
      const extra = contribute(context).map((item) => ({
        ...item,
        run: () => {
          close();
          item.run();
        },
      }));

      if (extra.length > 0) items.push({ ...extra[0], separatorBefore: true }, ...extra.slice(1));
    }

    const Toolbar = slots.Toolbar === null ? null : (slots.Toolbar ?? DefaultToolbar);
    const formatting =
      Toolbar && picked ? (
        <Toolbar
          position={menu.position!}
          placement="inline"
          {...cellToolbar(editor, picked, {
            current: cellPanel,
            set: setCellPanel,
            changed: () => refresh((n) => n + 1),
          })}
        />
      ) : Toolbar && hasText && toolbar.visible && toolbar.formats && toolbar.range ? (
        <Toolbar
          formats={toolbar.formats}
          position={menu.position!}
          placement="inline"
          linkOpen={toolbar.linkOpen}
          panel={toolbar.panel}
          turnInto={turnIntoFor(editor, view, slashItems, toolbar.range)}
          {...toolbarHandlers(editor, view, toolbar.range, { onFormula: () => close(false) })}
        />
      ) : null;

    const Menu = slots.ContextMenu ?? DefaultContextMenu;

    return (
      <Menu
        position={menu.position!}
        formatting={formatting}
        items={items}
        onClose={close}
        onDismiss={() => close(false)}
      />
    );
  };

  // Меню остаётся смонтированным и уходит плавно: условие показа — `open`, а то, что рисуется, — в `render`.
  return <PortalPresence open={open} render={render} />;
}
