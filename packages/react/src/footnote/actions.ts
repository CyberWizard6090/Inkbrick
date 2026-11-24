import { flushSync } from 'react-dom';

import { FORMULA_CHAR, footnoteNumbers } from '@inkbrick/document';
import type { CaretResult, Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { documentBlocks, getFootnoteIndex } from '@inkbrick/engine/internal';

let counter = 0;

/** Новый код сноски: короткий и уникальный. */
export const newFootnoteId = (): string =>
  `fn${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Заметка, в которой лежит блок: туда же ставится текст сноски. */
function noteOf(editor: Editor, blockId: string): string | undefined {
  for (
    let block = editor.store.getBlock(blockId);
    block;
    block = block.parentId ? editor.store.getBlock(block.parentId) : undefined
  ) {
    if (block.flavour === 'block:note') return block.id;
  }

  return undefined;
}

/** Можно ли вставить сноску в этот блок: у блока есть текст, это не код и не сам текст сноски. */
export function canInsertFootnote(editor: Editor, blockId: string): boolean {
  const block = editor.store.getBlock(blockId);

  return (
    !!block &&
    editor.schema.hasBlock('block:footnote') &&
    block.flavour !== 'block:code' &&
    block.flavour !== 'block:footnote' &&
    editor.schema.getBlockSchema(block.flavour)?.inline !== false &&
    noteOf(editor, blockId) !== undefined
  );
}

/**
 * Вставляет ссылку на новую сноску в `blockId` на смещении `offset` и создаёт пустой текст сноски в заметке — на месте,
 * которое соответствует номеру (после сносок с меньшими номерами). Одна правка в истории; каретка встаёт в текст сноски.
 */
export function insertFootnote(
  editor: Editor,
  view: EditorView,
  blockId: string,
  offset: number,
): boolean {
  const caret = createFootnote(editor, blockId, offset);

  if (caret) view.placeCaret(caret.blockId, caret.offset);

  return !!caret;
}

/**
 * То же, что `insertFootnote`, но каретку не ставит, а возвращает: нужно там, где правка идёт внутри чужой отрисовки
 * (пункт slash-меню) и текст сноски ещё не появился в DOM.
 */
export function createFootnote(
  editor: Editor,
  blockId: string,
  offset: number,
): CaretResult | undefined {
  if (!canInsertFootnote(editor, blockId)) return undefined;

  const note = noteOf(editor, blockId)!;
  const id = newFootnoteId();
  let caret: CaretResult | undefined;

  flushSync(() => {
    editor.batch(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId, from: offset, to: offset, text: FORMULA_CHAR, plain: true },
      });
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: {
          from: { blockId, offset },
          to: { blockId, offset: offset + 1 },
          attributes: { footnote: id },
        },
      });

      // Место текста: перед первой сноской с большим номером, иначе после последней (или в конец заметки).
      const numbers = footnoteNumbers(documentBlocks(editor));
      const own = numbers.get(id) ?? Infinity;
      const children = editor.store.getBlock(note)!.children;
      const footnotes = children
        .map((child) => editor.store.getBlock(child))
        .filter((block) => block?.flavour === 'block:footnote');
      const next = footnotes.find(
        (block) => (numbers.get(String(block!.props.id)) ?? Infinity) > own,
      );
      const index = next ? children.indexOf(next.id) : children.length;

      caret = editor.dispatch({
        type: 'insertBlock',
        payload: {
          flavour: 'block:footnote',
          parentId: note,
          afterId: index > 0 ? children[index - 1] : undefined,
          props: { id },
        },
      }) as CaretResult | undefined;
    });
  });

  return caret;
}

/** К тексту сноски: каретка в конце. */
export function goToFootnote(editor: Editor, view: EditorView, id: string): boolean {
  const definition = getFootnoteIndex(editor).definitionOf(id);
  const block = definition ? editor.store.getBlock(definition) : undefined;

  if (!block) return false;

  view.placeCaret(block.id, editor.engine.inline.length(block.content));

  return true;
}

/** К ссылке на сноску: каретка сразу после неё. */
export function goToReference(editor: Editor, view: EditorView, id: string): boolean {
  const reference = getFootnoteIndex(editor).referenceOf(id);

  if (!reference) return false;

  view.placeCaret(reference.blockId, reference.offset + 1);

  return true;
}
