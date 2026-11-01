export interface DocPoint {
  blockId: string;
  offset: number;
}

export interface DocSelection {
  from: DocPoint;
  to: DocPoint;
  collapsed: boolean;
}

const EDITABLE = '.editable[data-id]';
/** Блоки без текста (картинка, разделитель, неизвестный блок) — нередактируемые «острова» со своим id. */
const ISLAND = '[data-block-id][contenteditable="false"]';

export function getOffsetIn(editable: HTMLElement, node: Node, offset: number): number {
  const range = globalThis.document.createRange();

  range.selectNodeContents(editable);
  range.setEnd(node, offset);

  return range.toString().length;
}

function editableOf(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;

  return element?.closest<HTMLElement>(EDITABLE) ?? null;
}

function textLength(editable: HTMLElement): number {
  return editable.textContent?.length ?? 0;
}

function leafPoint(el: HTMLElement, where: 'start' | 'end'): DocPoint {
  return el.matches(ISLAND)
    ? { blockId: el.getAttribute('data-block-id')!, offset: 0 }
    : { blockId: el.dataset.id!, offset: where === 'start' ? 0 : textLength(el) };
}

/**
 * Точка вне текстовых блоков (на контейнере, у маркера списка и т.п.) переводится
 * в ближайшую позицию текста: вперёд — в начало следующего блока, назад — в конец предыдущего.
 */
function resolveContainerPoint(
  root: HTMLElement,
  node: Node,
  offset: number,
  bias: 'forward' | 'backward',
  includeIslands: boolean,
): DocPoint | null {
  /*
   * Граница непустого выделения может приходиться на блок без текста: иначе картинку или разделитель
   * в начале/конце документа нельзя было бы выделить, скопировать и удалить. Курсор (свёрнутое выделение) —
   * всегда в текст.
   */
  const editables = [
    ...root.querySelectorAll<HTMLElement>(includeIslands ? `${EDITABLE}, ${ISLAND}` : EDITABLE),
  ];

  if (editables.length === 0) return null;

  const probe = globalThis.document.createRange();
  probe.setStart(node, offset);
  probe.collapse(true);

  let previous: HTMLElement | null = null;

  for (const editable of editables) {
    if (probe.comparePoint(editable, 0) >= 0) {
      if (bias === 'forward') return leafPoint(editable, 'start');
      break;
    }

    previous = editable;
  }

  if (bias === 'backward')
    return previous ? leafPoint(previous, 'end') : leafPoint(editables[0], 'start');

  return leafPoint(editables[editables.length - 1], 'end');
}

function resolvePoint(
  root: HTMLElement,
  node: Node,
  offset: number,
  bias: 'forward' | 'backward',
  includeIslands: boolean,
): DocPoint | null {
  const editable = editableOf(node);

  if (editable && root.contains(editable)) {
    return { blockId: editable.dataset.id!, offset: getOffsetIn(editable, node, offset) };
  }

  return resolveContainerPoint(root, node, offset, bias, includeIslands);
}

export function readDocSelection(root: HTMLElement): DocSelection | null {
  const selection = globalThis.getSelection();

  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);

  if (!root.contains(range.commonAncestorContainer)) return null;

  const from = resolvePoint(
    root,
    range.startContainer,
    range.startOffset,
    'forward',
    !range.collapsed,
  );
  let to = range.collapsed
    ? from
    : resolvePoint(root, range.endContainer, range.endOffset, 'backward', true);

  if (!from || !to) return null;

  // Выделение «всего документа» (Ctrl+A) включает и крайние блоки без текста.
  const remembered = fullSelections.get(root);

  if (remembered && !range.collapsed && sameRange(remembered, range)) {
    const leaves = root.querySelectorAll<HTMLElement>(`${EDITABLE}, ${ISLAND}`);

    return {
      from: leafPoint(leaves[0], 'start'),
      to: leafPoint(leaves[leaves.length - 1], 'end'),
      collapsed: false,
    };
  }

  // Выделение целиком вне текста могло «вывернуться» (from позже to) — считаем его курсором.
  if (
    from.blockId === to.blockId ? from.offset > to.offset : isAfter(root, from.blockId, to.blockId)
  ) {
    to = from;
  }

  return {
    from,
    to,
    collapsed: from.blockId === to.blockId && from.offset === to.offset,
  };
}

function isAfter(root: HTMLElement, a: string, b: string): boolean {
  const elementA = root.querySelector(`.editable[data-id="${CSS.escape(a)}"]`);
  const elementB = root.querySelector(`.editable[data-id="${CSS.escape(b)}"]`);

  if (!elementA || !elementB) return false;

  return !!(elementA.compareDocumentPosition(elementB) & Node.DOCUMENT_POSITION_PRECEDING);
}

function outsideFormula(node: Node, offset: number): { node: Node; offset: number } {
  const host = node.parentElement?.closest('[data-inkbrick-formula]');
  const parent = host?.parentNode;

  if (!host || !parent) return { node, offset };

  const index = Array.prototype.indexOf.call(parent.childNodes, host) as number;

  return { node: parent, offset: offset === 0 ? index : index + 1 };
}

function findPoint(editable: HTMLElement, offset: number): { node: Node; offset: number } | null {
  const walker = globalThis.document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);

  let remaining = offset;
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;

    if (remaining <= length) {
      return outsideFormula(node, remaining);
    }

    remaining -= length;
    node = walker.nextNode();
  }

  return null;
}

/**
 * Выделения, которые установил `selectAllText` (по одному на корень). Пока выделение браузера совпадает с запомненным,
 * оно считается выделением всего документа — вместе с блоками без текста в начале и в конце, которые
 * DOM-выделением не охватить: браузер сводит концы выделения к допустимым позициям каретки.
 */
const fullSelections = new WeakMap<HTMLElement, Range>();

function sameRange(a: Range, b: Range): boolean {
  return (
    a.startContainer === b.startContainer &&
    a.startOffset === b.startOffset &&
    a.endContainer === b.endContainer &&
    a.endOffset === b.endOffset
  );
}

/**
 * Выделяет весь документ (Ctrl/Cmd+A), включая блоки без текста. Нативный Ctrl+A схлопывается в каретку,
 * если документ начинается с нередактируемого элемента (значок callout, маркер списка), поэтому выделение
 * строим сами. false — в документе нечего выделять.
 */
export function selectAllText(root: HTMLElement): boolean {
  const editables = root.querySelectorAll<HTMLElement>(EDITABLE);

  if (editables.length === 0) {
    if (!root.querySelector(ISLAND)) return false;

    const selection = globalThis.getSelection();
    const range = globalThis.document.createRange();

    range.selectNodeContents(root);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  }

  setDomSelection(
    editables[0],
    0,
    editables[editables.length - 1],
    textLength(editables[editables.length - 1]),
  );

  const selection = globalThis.getSelection();

  if (selection && selection.rangeCount > 0)
    fullSelections.set(root, selection.getRangeAt(0).cloneRange());

  return true;
}

export function setDomSelection(
  start: HTMLElement,
  startOffset: number,
  end: HTMLElement = start,
  endOffset: number = startOffset,
): void {
  const selection = globalThis.getSelection();

  if (!selection) return;

  const range = globalThis.document.createRange();
  const from = findPoint(start, startOffset);
  const to = start === end && startOffset === endOffset ? from : findPoint(end, endOffset);

  if (from) range.setStart(from.node, from.offset);
  else range.setStart(start, 0);

  if (to) range.setEnd(to.node, to.offset);
  else range.setEnd(end, 0);

  selection.removeAllRanges();
  selection.addRange(range);
}
