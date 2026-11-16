import type { CaretResult, Editor } from '@inkbrick/engine';

import { availableSlashItems } from '../slash/items';
import type { SlashMenuItem } from '../slash/types';
import { matchInlineFormula } from '../formula/actions';
import { deleteForwardAtEnd } from './deleteAtBoundary';
import { matchInlineMarkdown } from './markdownInline';
import type { EditorView } from './EditorView';
import type { InputActions } from './inputActions';
import { readDocSelection } from './selection';

const FORMAT_BY_INPUT_TYPE: Record<string, string> = {
  formatBold: 'bold',
  formatItalic: 'italic',
  formatUnderline: 'underline',
  formatStrikeThrough: 'strike',
};

const TODO = /^\[( |x|X)?\]$/;

function matchShortcut(prefix: string, inBulletList: boolean) {
  const todo = TODO.exec(prefix);

  if (todo) {
    return {
      flavour: 'block:list',
      props: { type: 'todo', checked: todo[1] === 'x' || todo[1] === 'X' },
    };
  }

  if (inBulletList) return null;

  if (/^#{1,6}$/.test(prefix)) {
    return { flavour: 'block:heading', props: { level: prefix.length } };
  }
  if (prefix === '>') return { flavour: 'block:quote', props: {} };
  if (prefix === '```') return { flavour: 'block:code', props: {} };
  if (prefix === '---' || prefix === '***' || prefix === '___') {
    return { flavour: 'block:divider', props: {} };
  }
  if (prefix === '$$') return { flavour: 'block:formula', props: {} };
  if (/^[-*+]$/.test(prefix)) return { flavour: 'block:list', props: { type: 'bullet' } };
  if (/^\d+[.)]$/.test(prefix)) return { flavour: 'block:list', props: { type: 'ordered' } };

  const fence = /^```([\w+#.-]+)$/.exec(prefix);

  return fence ? { flavour: 'block:code', props: { language: fence[1].toLowerCase() } } : null;
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

      const inBulletList = block?.flavour === 'block:list' && block.props.type === 'bullet';

      if (data === ' ' && collapsed && (block?.flavour === 'block:paragraph' || inBulletList)) {
        const shortcut = matchShortcut(text.slice(0, from.offset), inBulletList);

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

      if (
        data.length === 1 &&
        collapsed &&
        block &&
        block.flavour !== 'block:code' &&
        editor.schema.getBlockSchema(block.flavour)?.inline !== false
      ) {
        const markdown = matchInlineMarkdown(text.slice(0, from.offset), data);

        if (markdown) {
          const { start, open, close, length, attributes } = markdown;
          const end = start + open + length;

          run(() =>
            editor.batch(() => {
              if (close > 0) {
                exec({
                  type: 'deleteText',
                  payload: { blockId: from.blockId, from: end, to: from.offset },
                });
              }

              exec({
                type: 'deleteText',
                payload: { blockId: from.blockId, from: start, to: start + open },
              });
              exec({
                type: 'setInlineAttributes',
                payload: {
                  from: { blockId: from.blockId, offset: start },
                  to: { blockId: from.blockId, offset: start + length },
                  attributes,
                },
              });

              return { blockId: from.blockId, offset: start + length };
            }),
          );
          view.plainAt = {
            blockId: from.blockId,
            offset: start + length,
            version: editor.store.getVersion(),
          };
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

      const plain =
        collapsed &&
        view.plainAt?.blockId === from.blockId &&
        view.plainAt.offset === from.offset &&
        view.plainAt.version === editor.store.getVersion();

      view.plainAt = null;

      if (plain) {
        run(() =>
          exec<CaretResult>({
            type: 'replaceText',
            payload: {
              blockId: from.blockId,
              from: from.offset,
              to: from.offset,
              text: data,
              plain,
            },
          }),
        );
      } else {
        run(() => replaceSelection(selection, data));
      }

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
