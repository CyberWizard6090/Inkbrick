import { COLUMNS } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';

/**
 * Запас слева от документа, в котором блок под указателем ещё находится. Полоса для ручки обычно внутри
 * документа (`--inkbrick-gutter`), но приложение может её убрать — тогда ручка снова оказывается за краем корня.
 */
export const GUTTER = 72;

export function hasHandle(editor: Editor, blockId: string): boolean {
  const block = editor.store.getBlock(blockId);
  const parent = block?.parentId ? editor.store.getBlock(block.parentId) : undefined;

  return !!parent?.parentId && editor.schema.getBlockSchema(block!.flavour)?.isolating !== true;
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
  let redirected = false;

  while (node && root.contains(node)) {
    const id = node.getAttribute('data-block-id')!;

    if (!redirected && editor.store.getBlock(id)?.flavour === COLUMNS) {
      // Промежуток между колонками (и разделитель в нём) — полоса ручки следующей колонки, а не блока колонок.
      // Переход один: если в колонке под точкой нет блока с ручкой, остаётся ручка самого блока колонок.
      redirected = true;

      const next = columnAfter(node, x);
      const rect = next?.getBoundingClientRect();
      const inner = rect
        ? document.elementFromPoint(Math.min(Math.max(x, rect.left + 4), rect.right - 4), y)
        : null;
      const found = next && inner && next.contains(inner) ? inner.closest('[data-block-id]') : null;

      if (found && found !== node) {
        node = found;
        continue;
      }
    }

    if (hasHandle(editor, id)) return id;

    node = node.parentElement?.closest('[data-block-id]') ?? null;
  }

  return null;
}

/** Колонка блока колонок, чья левая полоса (с промежутком перед ней) содержит точку: первая, правее края которой нет `x`. */
function columnAfter(columns: Element, x: number): Element | null {
  const items = columns.querySelectorAll(
    ':scope > [data-inkbrick-part="grid"] > [data-inkbrick-block="column"]',
  );

  return [...items].find((item) => item.getBoundingClientRect().right > x) ?? null;
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
