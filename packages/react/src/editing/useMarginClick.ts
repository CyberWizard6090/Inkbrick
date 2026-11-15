import { useEffect, type RefObject } from 'react';

import { useEditorView } from '../hooks/useEditorView';
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

      const onMove = (move: MouseEvent) => {
        if ((move.buttons & 1) === 0) return finish();

        const focus = pointAt(root, move.clientX, move.clientY);

        if (focus) selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      };

      // pointerup из useEditorInput снимет view.pointerDown и покажет toolbar для готового выделения.
      const finish = () => {
        globalThis.document.removeEventListener('mousemove', onMove);
        globalThis.document.removeEventListener('mouseup', finish);
        stop = null;
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
  }, [view, ref, enabled]);
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

  // Ближайший по высоте блок; среди стоящих на одной высоте (ячейки строки таблицы) — ближайший по горизонтали.
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
