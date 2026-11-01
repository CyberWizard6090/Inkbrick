import type { CaretResult, Editor } from '@inkbrick/engine';

import { availableSlashItems } from '../slash/items';
import type { SlashMenuItem } from '../slash/types';
import { matchInlineFormula } from '../formula/actions';
import { deleteForwardAtEnd } from './deleteAtBoundary';
import type { EditorView } from './EditorView';
import type { InputActions } from './inputActions';
import { readDocSelection } from './selection';

const FORMAT_BY_INPUT_TYPE: Record<string, string> = {
  formatBold: 'bold',
  formatItalic: 'italic',
  formatUnderline: 'underline',
  formatStrikeThrough: 'strike',
};

function matchShortcut(prefix: string) {
  if (/^#{1,6}$/.test(prefix)) {
    return { flavour: 'block:heading', props: { level: prefix.length } };
  }
  if (prefix === '>') return { flavour: 'block:quote', props: {} };
  if (prefix === '```') return { flavour: 'block:code', props: {} };
  if (prefix === '---') return { flavour: 'block:divider', props: {} };
  if (prefix === '$$') return { flavour: 'block:formula', props: {} };
  if (/^[-*+]$/.test(prefix)) return { flavour: 'block:list', props: { type: 'bullet' } };
  if (/^\d+\.$/.test(prefix)) return { flavour: 'block:list', props: { type: 'ordered' } };
  if (prefix === '[]') return { flavour: 'block:list', props: { type: 'todo', checked: false } };
  return null;
}

/**
 * Превращает `beforeinput` в команды движка: ввод, Enter, удаление (символ, слово, строка), история и формат из
 * системного меню, Markdown-шорткаты, `$формула$` и открытие slash-меню. Событие уже отменено вызывающим кодом.
 */
export function applyBeforeInput(
  event: InputEvent,
  root: HTMLElement,
  editor: Editor,
  view: EditorView,
  slashItems: readonly SlashMenuItem[],
  actions: InputActions,
): void {
  const {
    exec,
    run,
    syncSlash,
    blockText,
    deleteSelection,
    replaceSelection,
    toggleFormat,
    undo,
    redo,
  } = actions;
  const selection = readDocSelection(root);

  if (!selection) return;

  const { from, collapsed } = selection;
  const type = event.inputType;
  const block = editor.store.getBlock(from.blockId);
  const text = blockText(from.blockId);

  switch (type) {
    case 'insertText':
    case 'insertReplacementText': {
      const data = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';

      if (!data) return;

      if (data === '$' && collapsed && block && block.flavour !== 'block:code') {
        const formula = matchInlineFormula(text.slice(0, from.offset));

        if (
          formula &&
          editor.can('insertFormula', {
            blockId: from.blockId,
            from: formula.from,
            to: from.offset,
            latex: formula.latex,
          })
        ) {
          run(() =>
            exec<CaretResult>({
              type: 'insertFormula',
              payload: {
                blockId: from.blockId,
                from: formula.from,
                to: from.offset,
                latex: formula.latex,
              },
            }),
          );
          return;
        }
      }

      if (data === ' ' && collapsed && block?.flavour === 'block:paragraph') {
        const shortcut = matchShortcut(text.slice(0, from.offset));

        if (shortcut) {
          run(() =>
            editor.batch(() => {
              exec({
                type: 'deleteText',
                payload: { blockId: from.blockId, from: 0, to: from.offset },
              });

              return exec<CaretResult>({
                type: 'convertBlock',
                payload: { blockId: from.blockId, ...shortcut, offset: 0 },
              });
            }),
          );
          return;
        }
      }

      const opensSlash =
        data === '/' &&
        collapsed &&
        !!block &&
        block.flavour !== 'block:code' &&
        editor.schema.getBlockSchema(block.flavour)?.inline !== false &&
        (from.offset === 0 || /\s/.test(text[from.offset - 1])) &&
        availableSlashItems(editor, slashItems, from.blockId).length > 0;

      run(() => replaceSelection(selection, data));

      if (opensSlash) {
        view.slash.open(from.blockId, from.offset);
        syncSlash();
      }

      return;
    }

    case 'insertParagraph':
      run(() =>
        editor.batch(() => {
          const caret = collapsed
            ? { blockId: from.blockId, offset: from.offset }
            : deleteSelection(selection);

          return caret
            ? exec<CaretResult>({
                type: 'splitBlock',
                payload: { blockId: caret.blockId, offset: caret.offset },
              })
            : undefined;
        }),
      );
      return;

    case 'insertLineBreak':
      run(() => replaceSelection(selection, '\n'));
      return;

    case 'deleteContentBackward':
      run(() =>
        collapsed
          ? exec<CaretResult>({
              type: 'deleteBackward',
              payload: { blockId: from.blockId, offset: from.offset },
            })
          : deleteSelection(selection),
      );
      return;

    case 'deleteContentForward':
      run(() => {
        if (!collapsed) return deleteSelection(selection);

        if (from.offset < text.length) {
          return exec<CaretResult>({
            type: 'deleteText',
            payload: { blockId: from.blockId, from: from.offset, to: from.offset + 1 },
          });
        }

        return deleteForwardAtEnd(editor, from.blockId);
      });
      return;

    case 'deleteWordBackward':
      run(() => {
        if (!collapsed) return deleteSelection(selection);

        // Как в браузерах и Word: слово вместе с пробелами после него (пробел перед словом остаётся).
        const start = text.slice(0, from.offset).replace(/(\S+\s*|\s+)$/, '').length;

        return start < from.offset
          ? exec<CaretResult>({
              type: 'deleteText',
              payload: { blockId: from.blockId, from: start, to: from.offset },
            })
          : exec<CaretResult>({
              type: 'deleteBackward',
              payload: { blockId: from.blockId, offset: from.offset },
            });
      });
      return;

    case 'deleteWordForward':
      run(() => {
        if (!collapsed) return deleteSelection(selection);

        const rest = text.slice(from.offset);
        const length = rest.length - rest.replace(/^(\s*[^\s]+|\s+)/, '').length;

        return length > 0
          ? exec<CaretResult>({
              type: 'deleteText',
              payload: { blockId: from.blockId, from: from.offset, to: from.offset + length },
            })
          : undefined;
      });
      return;

    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
      run(() => {
        if (!collapsed) return deleteSelection(selection);

        return from.offset > 0
          ? exec<CaretResult>({
              type: 'deleteText',
              payload: { blockId: from.blockId, from: 0, to: from.offset },
            })
          : undefined;
      });
      return;

    case 'deleteSoftLineForward':
    case 'deleteHardLineForward':
      run(() => {
        if (!collapsed) return deleteSelection(selection);

        return from.offset < text.length
          ? exec<CaretResult>({
              type: 'deleteText',
              payload: { blockId: from.blockId, from: from.offset, to: text.length },
            })
          : undefined;
      });
      return;

    case 'deleteByCut':
    case 'deleteByDrag':
    case 'deleteContent':
      if (!collapsed) run(() => deleteSelection(selection));
      return;

    case 'historyUndo':
      undo();
      return;

    case 'historyRedo':
      redo();
      return;

    case 'formatBold':
    case 'formatItalic':
    case 'formatUnderline':
    case 'formatStrikeThrough':
      toggleFormat(FORMAT_BY_INPUT_TYPE[type]);
      return;

    default:
      /*
       * insertFromPaste обрабатывается в useClipboard; drop и всё неизвестное блокируем,
       * чтобы DOM не разошёлся с моделью.
       */
      return;
  }
}
