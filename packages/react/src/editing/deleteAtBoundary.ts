import type { CaretResult, Editor } from '@inkbrick/engine';

import type { EditorView } from './EditorView';

/** Delete в конце блока: команда движка `deleteForward` (перед блоком без текста ничего не делает). */
export function deleteForwardAtEnd(editor: Editor, blockId: string): CaretResult | undefined {
  return editor.dispatch({ type: 'deleteForward', payload: { blockId } });
}

/**
 * Backspace в начале блока склеивает его с предыдущим соседом, Delete в конце — со следующим. Если этот сосед скрыт
 * свёрнутым разделом, склейка ушла бы в блок, которого не видно. Вместо неё раздел разворачивается (одной правкой в
 * истории), каретка остаётся на месте, а следующее нажатие склеивает как обычно. `true` — раздел развёрнут, клавишу
 * обрабатывать дальше не надо.
 */
export function unfoldNeighbour(
  editor: Editor,
  view: EditorView,
  blockId: string,
  direction: 'backward' | 'forward',
): boolean {
  const neighbour =
    direction === 'backward'
      ? editor.document.getPreviousSibling(blockId)
      : editor.document.getNextSibling(blockId);
  const owner = neighbour ? view.folds.hiddenBy(neighbour.id) : undefined;

  if (!owner || !editor.can('setBlockProps', { blockId: owner, props: { collapsed: false } }))
    return false;

  editor.dispatch({
    type: 'setBlockProps',
    payload: { blockId: owner, props: { collapsed: false } },
  });

  return true;
}
