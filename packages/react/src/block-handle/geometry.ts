import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';

/** Ширина полосы слева от текста, в которой ручка остаётся видимой. */
export const GUTTER = 72;

export function hasHandle(editor: Editor, blockId: string): boolean {
  const block = editor.store.getBlock(blockId);
  const parent = block?.parentId ? editor.store.getBlock(block.parentId) : undefined;

  return !!parent?.parentId;
}

export function blockElement(view: EditorView, blockId: string): HTMLElement | null {
  return (
    view.getRoot()?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`) ?? null
  );
}

export function blockAtPoint(
  editor: Editor,
  view: EditorView,
  x: number,
  y: number,
): string | null {
  const root = view.getRoot();
  const hit = root ? document.elementFromPoint(x, y) : null;

  if (!root || !hit || !root.contains(hit)) return null;

  let node: Element | null = hit.closest('[data-block-id]');

  while (node && root.contains(node)) {
    const id = node.getAttribute('data-block-id')!;

    if (hasHandle(editor, id)) return id;

    node = node.parentElement?.closest('[data-block-id]') ?? null;
  }

  return null;
}

/** Точка в колонке редактора: прижимает x к тексту, чтобы блок находился и при наведении в полосу слева. */
export function probePoint(
  view: EditorView,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const root = view.getRoot();

  if (!root) return null;

  const rect = root.getBoundingClientRect();

  if (x < rect.left - GUTTER || x > rect.right || y < rect.top || y > rect.bottom) return null;

  return { x: Math.min(Math.max(x, rect.left + 12), rect.right - 12), y };
}

export function rowRect(view: EditorView, blockId: string): DOMRect | null {
  return (view.getElement(blockId) ?? blockElement(view, blockId))?.getBoundingClientRect() ?? null;
}
