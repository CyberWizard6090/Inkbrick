import { flushSync } from 'react-dom';

import type { BlockProps } from '@inkbrick/document';
import type { CaretResult, Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { readDocSelection } from '../editing/selection';
import type { SlashMenuItem } from './types';

/**
 * Применяет пункт меню: удаляет «/запрос» и превращает блок в выбранный тип —
 * одним шагом undo. Если превращение невозможно, текст остаётся нетронутым.
 */
export function applySlashItem(editor: Editor, view: EditorView, item: SlashMenuItem): void {
  const state = view.slash.getState();

  if (!state.open || !state.blockId) return;

  const { blockId, slashOffset } = state;
  const root = view.getRoot();
  const selection = root ? readDocSelection(root) : null;
  const end =
    selection?.collapsed && selection.from.blockId === blockId
      ? selection.from.offset
      : slashOffset + 1 + state.query.length;

  view.slash.close();

  let caret: CaretResult | undefined;

  try {
    flushSync(() => {
      caret = editor.batch(() => {
        editor.dispatch({ type: 'deleteText', payload: { blockId, from: slashOffset, to: end } });

        const result = editor.dispatch({
          type: 'convertBlock',
          payload: {
            blockId,
            flavour: item.flavour,
            props: item.props as BlockProps | undefined,
            offset: slashOffset,
          },
        }) as CaretResult | undefined;

        if (!result) throw new Error('convert-failed');

        return result;
      });
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'convert-failed') throw error;
    return;
  }

  if (caret) view.placeCaret(caret.blockId, caret.offset);
}
