import { useEffect, type RefObject } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { blockAtPoint, blockElement, hasHandle, probePoint, rowRect } from './geometry';

/**
 * Следит за указателем: показывает ручку у блока под курсором (в том числе в полосе слева от текста),
 * на сенсорном экране — у блока, которого коснулись; закрывает меню по клику снаружи/Esc/прокрутке
 * и скрывает ручку при наборе текста. Перетаскивание запускается из ручки (см. BlockHandleHost).
 */
export function useBlockHandles(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const editor = useEditor();
  const view = useEditorView();

  useEffect(() => {
    const root = ref.current;

    if (!root || !enabled) return;

    const showAt = (event: PointerEvent) => {
      const probe = probePoint(view, event.clientX, event.clientY);

      if (!probe) {
        view.blocks.setHover(null);
        return;
      }

      const blockId = blockAtPoint(editor, view, probe.x, probe.y);

      if (!blockId) return;

      const wrapper = blockElement(view, blockId);
      const row = rowRect(view, blockId);

      if (wrapper && row) {
        view.blocks.setHover({
          blockId,
          x: Math.round(wrapper.getBoundingClientRect().left),
          y: Math.round(row.top),
        });
      }
    };

    const onUiTarget = (event: Event) =>
      event.target instanceof Element && !!event.target.closest('[data-inkbrick-block-ui]');

    const onMove = (event: PointerEvent) => {
      const { menu, drag } = view.blocks.getState();

      // Палец «наводится» только касанием (см. onPointerUp); движение пальца — это прокрутка.
      if (event.pointerType === 'touch') return;

      if (drag || menu || view.pointerDown) return;

      if (onUiTarget(event)) return;

      showAt(event);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || onUiTarget(event)) return;

      const { menu, drag } = view.blocks.getState();

      if (!drag && !menu) showAt(event);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (onUiTarget(event)) return;

      view.blocks.closeMenu();
    };

    const hide = (event: Event) => {
      // Прокрутка самого меню (оно может не помещаться в окно) не должна его закрывать.
      if (onUiTarget(event)) return;
      // Автопрокрутка при переносе: элемент-хваталка (в том числе у стороннего DnD) должен остаться.
      if (view.blocks.getState().drag) return;

      view.blocks.setHover(null);
      view.blocks.closeMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') view.blocks.closeMenu();

      if (view.blocks.getState().hover && !event.metaKey && !event.ctrlKey)
        view.blocks.setHover(null);
    };

    const onLeave = (event: PointerEvent) => {
      // Палец «уходит» со страницы после каждого касания — ручка должна остаться.
      if (event.pointerType === 'touch') return;
      if (!event.relatedTarget) view.blocks.setHover(null);
    };

    // Блок исчез из документа (удалён, undo) — ручка и меню не должны остаться висеть.
    const unsubscribe = editor.store.subscribe(() => {
      const { hover, menu } = view.blocks.getState();

      if (hover && !hasHandle(editor, hover.blockId)) view.blocks.setHover(null);
      if (menu && !hasHandle(editor, menu.blockId)) view.blocks.closeMenu();
    });

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointerout', onLeave);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', hide, true);

    return () => {
      unsubscribe();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointerout', onLeave);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', hide, true);
      view.blocks.setHover(null);
      view.blocks.closeMenu();
    };
  }, [editor, view, ref, enabled]);
}
