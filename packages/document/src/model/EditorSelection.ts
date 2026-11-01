import type { BlockId } from './BlockId';

export interface SelectionPoint {
  blockId: BlockId;
  offset: number;
}

export interface EditorSelection {
  anchor: SelectionPoint;
  focus: SelectionPoint;
}

export function isCollapsed(selection: EditorSelection): boolean {
  return (
    selection.anchor.blockId === selection.focus.blockId &&
    selection.anchor.offset === selection.focus.offset
  );
}

/**
 * Для выделения внутри одного блока возвращает диапазон from <= to.
 * Для выделения между блоками порядок определяется движком документа
 * (нужен обход дерева), поэтому возвращается null.
 */
export function getInlineRange(
  selection: EditorSelection,
): { blockId: BlockId; from: number; to: number } | null {
  const { anchor, focus } = selection;
  if (anchor.blockId !== focus.blockId) return null;

  return {
    blockId: anchor.blockId,
    from: Math.min(anchor.offset, focus.offset),
    to: Math.max(anchor.offset, focus.offset),
  };
}
