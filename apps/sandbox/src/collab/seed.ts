import * as Y from 'yjs';

import { createSchemaRegistry, serializeDocument, type BlockId } from '@inkbrick/document';
import { initYDoc } from '@inkbrick/collab';
import { Editor, type CaretResult } from '@inkbrick/engine';

/** Начальный документ создаёт «сервер»: здесь это одна функция, в продукте его создаёт бэкенд при создании записи. */
export function createServerState(): Uint8Array {
  const schema = createSchemaRegistry();
  const editor = new Editor({ schema });
  const doc = editor.document;
  const noteId = doc.getBlock(doc.rootId)!.children[0];
  let last: BlockId = doc.getBlock(noteId)!.children[0];

  editor.dispatch({
    type: 'replaceText',
    payload: { blockId: last, from: 0, to: 0, text: 'Заметка на двоих' },
  });
  editor.dispatch({ type: 'convertBlock', payload: { blockId: last, flavour: 'block:heading' } });

  const add = (flavour: string, text: string): void => {
    const { blockId } = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour, afterId: last },
    }) as CaretResult;

    editor.dispatch({ type: 'replaceText', payload: { blockId, from: 0, to: 0, text } });
    last = blockId;
  };

  add('block:paragraph', 'Печатайте в обоих редакторах одновременно: правки сольются без потерь.');
  add('block:list', 'Перенесите блок за ручку в одном редакторе и печатайте в нём в другом.');
  add('block:list', 'Нажмите «Обрыв», поправьте текст в обоих и верните связь.');
  add('block:paragraph', 'Отмена откатывает только ваши правки, а не чужие.');

  const ydoc = new Y.Doc();

  initYDoc(ydoc, serializeDocument(editor.document, schema));

  return Y.encodeStateAsUpdate(ydoc);
}
