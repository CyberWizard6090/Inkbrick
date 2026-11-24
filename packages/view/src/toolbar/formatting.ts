import { normalizeLinkUrl } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import type { DocSelection } from '../editing/selection';

const isSingleBlock = (selection: DocSelection) => selection.from.blockId === selection.to.blockId;

export function isFormattable(editor: Editor, selection: DocSelection): boolean {
  if (!isSingleBlock(selection)) return true;

  const block = editor.store.getBlock(selection.from.blockId);

  // Код не форматируется, а у блока без текста (картинка, разделитель) форматировать нечего: выделение подписи
  // или кнопки внутри него не должно открывать панель форматирования текста.
  return (
    block?.flavour !== 'block:code' &&
    (!block || editor.schema.getBlockSchema(block.flavour)?.inline !== false)
  );
}

export function toggleFormatInSelection(
  editor: Editor,
  view: EditorView,
  selection: DocSelection,
  format: string,
): void {
  if (selection.collapsed || !isFormattable(editor, selection)) return;

  view.commit(() => {
    if (isSingleBlock(selection)) {
      editor.dispatch({
        type: 'toggleFormat',
        payload: {
          blockId: selection.from.blockId,
          from: selection.from.offset,
          to: selection.to.offset,
          format,
        },
      });
    } else {
      editor.dispatch({
        type: 'toggleFormatRange',
        payload: { from: selection.from, to: selection.to, format },
      });
    }
  });

  view.placeSelection(selection.from, selection.to);
}

/**
 * Ставит или снимает ссылку на выделении. Ввод нормализуется («example.com» → https://example.com);
 * null или пустая строка снимают ссылку. Возвращает false, если адрес небезопасен — документ не меняется.
 */
export function setLinkInSelection(
  editor: Editor,
  view: EditorView,
  selection: DocSelection,
  input: string | null,
): boolean {
  if (selection.collapsed || !isFormattable(editor, selection)) return false;

  const remove = input === null || input.trim() === '';
  const link = remove ? undefined : (normalizeLinkUrl(input) ?? null);

  if (link === null) return false;

  view.commit(() => {
    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: selection.from, to: selection.to, attributes: { link } },
    });
  });

  view.placeSelection(selection.from, selection.to);

  return true;
}
