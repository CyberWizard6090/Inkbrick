import { flushSync } from 'react-dom';

import type { CaretResult, Editor, EditorIntent } from '@inkbrick/engine';

import { syncSlashMenu } from '../slash/syncSlashMenu';
import type { SlashMenuItem } from '../slash/types';
import { toggleFormatInSelection } from '../toolbar/formatting';
import type { EditorView } from './EditorView';
import { readDocSelection, type DocSelection } from './selection';

export interface InputActions {
  exec<T>(intent: EditorIntent): T | undefined;
  run(action: () => CaretResult | undefined): void;
  syncSlash(): void;
  blockText(blockId: string): string;
  deleteSelection(selection: DocSelection): CaretResult | undefined;
  insertAt(blockId: string, offset: number, text: string): CaretResult | undefined;
  replaceSelection(selection: DocSelection, text: string): CaretResult | undefined;
  toggleFormat(format: string): void;
  undo(): void;
  redo(): void;
}

export function createInputActions(
  editor: Editor,
  view: EditorView,
  root: HTMLElement,
  slashItems: readonly SlashMenuItem[],
): InputActions {
  const exec = <T>(intent: EditorIntent) => editor.dispatch(intent) as T | undefined;

  const run = (action: () => CaretResult | undefined) => {
    let caret: CaretResult | undefined;

    flushSync(() => {
      caret = action();
    });

    if (caret) view.placeCaret(caret.blockId, caret.offset);

    syncSlash();
  };

  const syncSlash = () => syncSlashMenu(editor, view, slashItems);

  const blockText = (blockId: string) => {
    const block = editor.store.getBlock(blockId);
    return block ? editor.engine.inline.toPlainText(block.content) : '';
  };

  const isSingleBlock = (selection: DocSelection) =>
    selection.from.blockId === selection.to.blockId;

  const deleteSelection = (selection: DocSelection) =>
    isSingleBlock(selection)
      ? exec<CaretResult>({
          type: 'deleteText',
          payload: {
            blockId: selection.from.blockId,
            from: selection.from.offset,
            to: selection.to.offset,
          },
        })
      : exec<CaretResult>({
          type: 'deleteRange',
          payload: { from: selection.from, to: selection.to },
        });

  const insertAt = (blockId: string, offset: number, text: string) =>
    exec<CaretResult>({
      type: 'replaceText',
      payload: { blockId, from: offset, to: offset, text },
    });

  const replaceSelection = (selection: DocSelection, text: string) => {
    // Обычный ввод идёт без batch: иначе набор подряд не сливается в один шаг undo.
    if (selection.collapsed) {
      return insertAt(selection.from.blockId, selection.from.offset, text);
    }

    return editor.batch(() => {
      const caret = deleteSelection(selection);

      return caret ? insertAt(caret.blockId, caret.offset, text) : undefined;
    });
  };

  const toggleFormat = (format: string) => {
    const selection = readDocSelection(root);

    if (selection) toggleFormatInSelection(editor, view, selection, format);
  };

  const undo = () => run(() => editor.undo()?.caret);
  const redo = () => run(() => editor.redo()?.caret);

  return {
    exec,
    run,
    syncSlash,
    blockText,
    deleteSelection,
    insertAt,
    replaceSelection,
    toggleFormat,
    undo,
    redo,
  };
}
