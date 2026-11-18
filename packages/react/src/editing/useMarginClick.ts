import { useEffect, type RefObject } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { pickRun } from '../pick/actions';
import { findPoint } from './selection';

const EDITABLE = '.editable[data-id]';

/** Цели, у которых своё поведение: кнопки, поля, ссылки, оболочка редактора, блоки без текста. */
const OWN_BEHAVIOUR = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[data-inkbrick-ui]',
  '[data-inkbrick-block-ui]',
].join(',');

interface DomPoint {
  readonly node: Node;
  readonly offset: number;
}

/**
 * Клик мимо текста — в полосе слева, справа от строки, между блоками или в «буферной зоне» вокруг
 * документа — ставит курсор на строку на той же высоте: левее текста — в начало этой визуальной строки,
 * правее — в её конец. Выше первого блока — первая строка, ниже последнего — конец последнего блока.
 * Протягивание с полей выделяет текст, Shift+клик расширяет выделение.
 *
 * Буферная зона — элементы-обёртки корня вплоть до ближайшего предка с `data-inkbrick-surface`.
 * Без этого атрибута обрабатываются только клики внутри самого корня.
 */
export function useMarginClick(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const editor = useEditor();
  const view = useEditorView();

  useEffect(() => {
    const root = ref.current;

    if (!root || !enabled) return;

    let stop: (() => void) | null = null;

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      if (!(event.target instanceof Element) || !isMarginTarget(root, event.target)) return;

      const point = pointAt(root, event.clientX, event.clientY);

      if (!point) return;

      event.preventDefault();
      stop?.();
      view.picked.clear();

      if (globalThis.document.activeElement !== root) root.focus({ preventScroll: true });

      const selection = globalThis.getSelection();

      if (!selection) return;

      view.pointerDown = true;
      view.toolbar.closeLink();
      view.toolbar.hide();

      const anchor =
        event.shiftKey && selection.anchorNode && root.contains(selection.anchorNode)
          ? { node: selection.anchorNode, offset: selection.anchorOffset }
          : point;

      selection.setBaseAndExtent(anchor.node, anchor.offset, point.node, point.offset);

      // Протягивание с поля за краем документа (левее или правее корня) — рамка: выбираются блоки целиком.
      const bounds = root.getBoundingClientRect();
      const gutter = event.clientX < bounds.left || event.clientX > bounds.right;
      const start = { x: event.clientX, y: event.clientY };
      let frame: HTMLElement | null = null;

      const onMove = (move: MouseEvent) => {
        if ((move.buttons & 1) === 0) return finish();

        if (gutter && !frame && Math.hypot(move.clientX - start.x, move.clientY - start.y) > 4) {
          selection.removeAllRanges();
          frame = globalThis.document.createElement('div');
          frame.setAttribute('data-inkbrick-ui', 'marquee');
          frame.style.cssText = 'position:fixed;pointer-events:none;';
          globalThis.document.body.appendChild(frame);
        }

        if (frame) {
          const left = Math.min(start.x, move.clientX);
          const top = Math.min(start.y, move.clientY);
          const height = Math.abs(move.clientY - start.y);

          Object.assign(frame.style, {
            left: `${left}px`,
            top: `${top}px`,
            width: `${Math.abs(move.clientX - start.x)}px`,
            height: `${height}px`,
          });

          const ids = blocksInBand(editor, view, top, top + height);

          view.picked.set(ids, ids[0] ?? null, ids.at(-1) ?? null);

          return;
        }

        const focus = pointAt(root, move.clientX, move.clientY);

        if (focus) selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      };

      // pointerup из useEditorInput снимет view.pointerDown и покажет toolbar для готового выделения.
      const finish = () => {
        globalThis.document.removeEventListener('mousemove', onMove);
        globalThis.document.removeEventListener('mouseup', finish);
        stop = null;

        if (frame) {
          frame.remove();
          frame = null;

          const { ids, anchor: first, focus: last } = view.picked.getState();

          if (ids.length > 0) pickRun(view, ids, first ?? undefined, last ?? undefined);
        }
      };

      globalThis.document.addEventListener('mousemove', onMove);
      globalThis.document.addEventListener('mouseup', finish);
      stop = finish;
    };

    const zone = root.closest<HTMLElement>('[data-inkbrick-surface]') ?? root;

    zone.addEventListener('mousedown', onMouseDown);

    return () => {
      zone.removeEventListener('mousedown', onMouseDown);
      stop?.();
    };
  }, [editor, view, ref, enabled]);
}

/** Клик не по тексту и не по элементу со своим поведением: в корне — мимо блоков, снаружи — по обёртке корня. */
export function isMarginTarget(root: HTMLElement, target: Element): boolean {
  if (target.closest(OWN_BEHAVIOUR)) return false;

  if (root.contains(target)) {
    // Текст ставит курсор сам; у блоков без текста (картинка, разделитель) и у их частей — своё поведение.
    return !target.closest(`${EDITABLE}, [contenteditable="false"]`);
  }

  // Снаружи — только обёртки, внутри которых лежит редактор: заголовок или панель рядом с ним не трогаем.
  return target.contains(root);
}

/** Точка текста на строке, ближайшей по высоте к `y`. */
export function pointAt(root: HTMLElement, x: number, y: number): DomPoint | null {
  const editables = [...root.querySelectorAll<HTMLElement>(EDITABLE)].filter((element) => {
    const rect = element.getBoundingClientRect();

    return rect.width > 0 || rect.height > 0;
  });

  if (editables.length === 0) return null;

  const last = editables[editables.length - 1];

  // Ниже последнего блока — в его конец.
  if (y > last.getBoundingClientRect().bottom) return endOf(last);

  let target = editables[0];
  let distance = Infinity;
  let aside = Infinity;

  for (const element of editables) {
    const rect = element.getBoundingClientRect();
    const gap = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const side = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;

    if (gap < distance || (gap === distance && side < aside)) {
      target = element;
      distance = gap;
      aside = side;
    }
  }

  const rect = target.getBoundingClientRect();
  const probeX = Math.min(Math.max(x, rect.left + 1), rect.right - 1);
  const probeY = Math.min(Math.max(y, rect.top + 1), rect.bottom - 1);
  const hit = caretFromPoint(probeX, probeY);

  if (hit && target.contains(hit.node)) return hit;

  return x < rect.left + rect.width / 2 ? startOf(target) : endOf(target);
}

function startOf(element: HTMLElement): DomPoint {
  return findPoint(element, 0) ?? { node: element, offset: 0 };
}

function endOf(element: HTMLElement): DomPoint {
  return findPoint(element, element.textContent?.length ?? 0) ?? startOf(element);
}

function caretFromPoint(x: number, y: number): DomPoint | null {
  const doc = globalThis.document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };

  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);

    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }

  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);

    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }

  return null;
}

/** Блоки верхнего уровня заметки, чьи строки пересекают полосу `top`–`bottom` (координаты окна). */
function blocksInBand(
  editor: ReturnType<typeof useEditor>,
  view: ReturnType<typeof useEditorView>,
  top: number,
  bottom: number,
): string[] {
  const root = view.getRoot();
  const note = editor.document.getBlock(editor.document.rootId)?.children[0];

  if (!root || !note) return [];

  return (editor.store.getBlock(note)?.children ?? []).filter((id) => {
    const element = root.querySelector(`[data-block-id="${id.replace(/["\\]/g, '\\$&')}"]`);
    const rect = element?.getBoundingClientRect();

    return !!rect && rect.height > 0 && rect.bottom >= top && rect.top <= bottom;
  });
}
