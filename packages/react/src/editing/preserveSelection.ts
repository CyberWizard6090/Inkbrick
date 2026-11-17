import { findPoint, getOffsetIn } from './selection';

/** Выделение, которое целиком лежит внутри одного блока: смещения в единицах модели. */
export interface SavedSelection {
  anchor: number;
  focus: number;
}

/**
 * Выделение внутри `element`, если и его начало, и конец в нём. Выделение через несколько блоков не трогается: его
 * границы лежат в других блоках, которые этот блок не знает.
 */
export function saveSelectionIn(element: HTMLElement): SavedSelection | null {
  const selection = globalThis.getSelection();

  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) {
    return null;
  }

  if (!element.contains(selection.anchorNode) || !element.contains(selection.focusNode))
    return null;

  return {
    anchor: getOffsetIn(element, selection.anchorNode, selection.anchorOffset),
    focus: getOffsetIn(element, selection.focusNode, selection.focusOffset),
  };
}

/** Ставит выделение на место; направление (от якоря к концу) сохраняется. */
export function restoreSelectionIn(element: HTMLElement, saved: SavedSelection): void {
  const selection = globalThis.getSelection();
  const anchor = findPoint(element, saved.anchor);
  const focus = findPoint(element, saved.focus);

  if (!selection || !anchor || !focus) return;

  selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
}

/**
 * Куда сдвигается позиция `offset` при замене текста `before` на `after`. Разница ищется как общий префикс и суффикс:
 * позиция до изменённого места остаётся, после него сдвигается на разницу длин, внутри заменённого места становится
 * концом новой вставки (как если бы набор продолжился после неё). Позиция ровно на границе вставки остаётся перед ней.
 */
export function mapOffset(before: string, after: string, offset: number): number {
  if (before === after) return offset;

  const limit = Math.min(before.length, after.length);
  let prefix = 0;

  while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;

  let suffix = 0;

  while (
    suffix < limit - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }

  if (offset <= prefix) return offset;

  if (offset >= before.length - suffix) return Math.max(0, offset + after.length - before.length);

  return after.length - suffix;
}
