import { useEffect, type RefObject } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { blockAtPoint, blockElement, hasHandle, probePoint, rowRect } from './geometry';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Meta', 'Alt']);

/** Полоса слева от блока, где стоит его ручка (ширина ручки, промежуток и запас): по пути к ручке она не уходит. */
const HANDLE_REACH = 72;

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

    /**
     * Указатель идёт от блока к его ручке: между ними может оказаться соседний блок (таблица в соседней колонке), промежуток
     * колонок или поле. Пока указатель на высоте блока и между его левым краем и ручкой, ручка остаётся у этого блока.
     */
    const towardHandle = (event: PointerEvent) => {
      const { hover } = view.blocks.getState();
      const wrapper = hover ? blockElement(view, hover.blockId) : null;

      if (!hover || !wrapper) return false;

      const box = wrapper.getBoundingClientRect();

      return (
        event.clientY >= box.top &&
        event.clientY <= box.bottom &&
        event.clientX >= hover.x - HANDLE_REACH &&
        event.clientX <= box.left
      );
    };

    const showAt = (event: PointerEvent) => {
      if (towardHandle(event)) return;

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
          // Ручка стоит у края колонки документа, одинаково у всех блоков: окрашенный блок выступает за колонку на
          // отрицательный отступ, а таблица отодвинута от неё положительным (там её ручки строк и маркеры вставки).
          x: Math.round(
            wrapper.getBoundingClientRect().left -
              (editor.store.getBlock(blockId)?.flavour === 'block:table'
                ? parseFloat(getComputedStyle(wrapper).marginLeft) || 0
                : Math.min(0, parseFloat(getComputedStyle(wrapper).marginLeft) || 0)),
          ),
          y: Math.round(row.top),
        });
      }
    };

    const onUiTarget = (event: Event) =>
      event.target instanceof Element && !!event.target.closest('[data-inkbrick-block-ui]');

    // Разделитель колонок лежит в промежутке, где стоит ручка следующей колонки: над ним ручка не должна пропадать.
    const onDivider = (event: Event) =>
      event.target instanceof Element && !!event.target.closest('[data-inkbrick-part="divider"]');

    const onMove = (event: PointerEvent) => {
      const { menu, drag } = view.blocks.getState();

      // Палец «наводится» только касанием (см. onPointerUp); движение пальца — это прокрутка.
      if (event.pointerType === 'touch') return;

      if (drag || menu || view.pointerDown) return;

      if (onUiTarget(event) && !onDivider(event)) return;

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

      // Сами модификаторы ручку не прячут: Shift+клик и Ctrl/Cmd+клик по ручке (выбор блоков) начинаются с их нажатия.
      if (MODIFIER_KEYS.has(event.key)) return;

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
