import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type RefObject,
} from 'react';

import { readDocSelection } from '../editing/selection';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { syncToolbar } from '../toolbar/syncToolbar';

/** Цели правого клика, у которых остаётся меню браузера: поля, ссылки, блоки без текста, оболочка редактора. */
const NATIVE_MENU = [
  'input',
  'textarea',
  'select',
  'a[href]',
  '[contenteditable="false"]',
  '[data-inkbrick-ui]',
  '[data-inkbrick-block-ui]',
].join(',');

/**
 * Правый клик в документе открывает своё контекстное меню: кнопки форматирования (если есть выделение) и
 * «Вырезать / Копировать / Вставить / Выделить всё». Shift+правый клик, касание пальцем и клик по полю,
 * ссылке или картинке оставляют меню браузера.
 */
export function useContextMenu(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const editor = useEditor();
  const view = useEditorView();

  useEffect(() => {
    const root = ref.current;

    if (!root || !enabled) return;

    void preloadContextMenu();

    const onContextMenu = (event: MouseEvent) => {
      if (event.shiftKey || event.defaultPrevented) return;
      if ((event as PointerEvent).pointerType === 'touch') return;
      if (event.target instanceof Element && event.target.closest(NATIVE_MENU)) return;

      event.preventDefault();
      view.slash.close();
      view.blocks.closeMenu();

      // С клавиатуры (клавиша меню, Shift+F10) точки клика нет — открываем у выделения.
      let { clientX: x, clientY: y } = event;

      if (x === 0 && y === 0) {
        const range = globalThis.getSelection()?.rangeCount
          ? globalThis.getSelection()!.getRangeAt(0).getBoundingClientRect()
          : root.getBoundingClientRect();

        x = range.left;
        y = range.bottom + 4;
      }

      // Кнопкам форматирования нужно актуальное выделение (правый клик мог его поменять).
      view.pointerDown = false;
      syncToolbar(editor, view);
      view.contextMenu.open(Math.round(x), Math.round(y), readDocSelection(root));
    };

    const onUi = (event: Event) =>
      event.target instanceof Element &&
      !!event.target.closest('[data-inkbrick-ui="context-menu"]');

    const onPointerDown = (event: PointerEvent) => {
      if (!onUi(event)) view.contextMenu.close();
    };

    const onScroll = (event: Event) => {
      if (!onUi(event)) view.contextMenu.close();
    };

    const close = () => view.contextMenu.close();
    // Окно браузера потеряло фокус. Системное окно «Свой цвет…» тоже забирает его: меню с полем цвета остаётся открытым,
    // иначе поле исчезло бы раньше, чем браузер сообщит выбранный цвет, и цвет не применился бы.
    const onBlur = () => {
      if (
        document.querySelector(
          '[data-inkbrick-ui="context-menu"] input[type="color"][data-picking]',
        )
      )
        return;

      close();
    };

    // Esc закрывает меню и тогда, когда фокус остался в документе (кнопки меню его не забирают).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !view.contextMenu.getState().position) return;
      // Во вложенной панели Escape закрывает только её: это делает сама панель.
      if (event.target instanceof Element && event.target.closest('[data-inkbrick-part="flyout"]'))
        return;
      if (event.target instanceof HTMLInputElement && onUi(event)) return;

      event.preventDefault();
      event.stopPropagation();
      close();
      root.focus({ preventScroll: true });
    };

    root.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      root.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', onBlur);
      view.contextMenu.close();
    };
  }, [editor, view, ref, enabled]);
}

let loaded: ComponentType | undefined;
let loading: Promise<ComponentType> | undefined;

/** Загружает содержимое меню заранее, чтобы первый правый клик открыл его сразу. */
export function preloadContextMenu(): Promise<ComponentType> {
  return (loading ??= import('./ContextMenuPanel').then(
    (module) => (loaded = module.ContextMenuPanel),
  ));
}

/**
 * Хост меню в основном бандле: ждёт открытия и показывает содержимое из отдельного чанка.
 * Без React.lazy: Suspense придержал бы показ уже загруженного модуля.
 */
export function ContextMenuHost() {
  const view = useEditorView();
  const open = useSyncExternalStore(
    view.contextMenu.subscribe,
    () => view.contextMenu.getState().position !== null,
    () => false,
  );
  const [Panel, setPanel] = useState<ComponentType | undefined>(() => loaded);

  useEffect(() => {
    if (!open || Panel) return;

    let active = true;

    void preloadContextMenu().then((component) => {
      if (active) setPanel(() => component);
    });

    return () => {
      active = false;
    };
  }, [open, Panel]);

  // Панель остаётся смонтированной и сама плавно убирает меню, когда оно закрывается.
  return Panel ? <Panel /> : null;
}
