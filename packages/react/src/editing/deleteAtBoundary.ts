import type { CaretResult, Editor } from '@inkbrick/engine';

/**
 * Delete в конце блока: склеивает следующий блок с этим. Перед блоком без текста (картинка, разделитель)
 * ничего не делает — так его не удалить случайно.
 */
export function deleteForwardAtEnd(editor: Editor, blockId: string): CaretResult | undefined {
  const next = editor.document.getNextSibling(blockId);

  if (!next || editor.schema.getBlockSchema(next.flavour)?.inline === false) return undefined;

  return editor.dispatch({
    type: 'deleteBackward',
    payload: { blockId: next.id, offset: 0 },
  }) as CaretResult | undefined;
}
