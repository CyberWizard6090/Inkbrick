import { flushSync } from 'react-dom';

import { FORMULA_CHAR, MAX_FORMULA_LENGTH } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { getOffsetIn, readDocSelection } from '../editing/selection';
import { isFormattable } from '../toolbar/formatting';
import type { FormulaEditorState } from './FormulaController';

function anchorOf(rect: DOMRect, fallback: Element | null) {
  const box =
    rect.width === 0 && rect.height === 0 && fallback ? fallback.getBoundingClientRect() : rect;

  return { x: box.left + box.width / 2, y: box.bottom, top: box.top };
}

function selectedLatex(editor: Editor, blockId: string, from: number, to: number): string {
  const block = editor.store.getBlock(blockId);

  if (!block || from === to) return '';

  const text = block.content.map((node) => node.insert).join('');

  return text.slice(from, to).split(FORMULA_CHAR).join('').trim();
}

/**
 * Открывает окошко вставки встроенной формулы на месте выделения (курсора). Выделенный текст становится
 * заготовкой кода. Возвращает false, если вставлять некуда: выделение вне редактора, из нескольких блоков или в коде.
 */
export function openInlineFormula(editor: Editor, view: EditorView): boolean {
  const root = view.getRoot();
  const selection = root ? readDocSelection(root) : null;

  if (!selection || selection.from.blockId !== selection.to.blockId) return false;

  if (!isFormattable(editor, selection)) return false;

  const block = editor.store.getBlock(selection.from.blockId);

  if (!block || editor.schema.getBlockSchema(block.flavour)?.inline === false) return false;

  const native = globalThis.getSelection();
  const rect =
    native && native.rangeCount > 0 ? native.getRangeAt(0).getBoundingClientRect() : new DOMRect();
  const { blockId } = selection.from;

  view.toolbar.hide();
  view.formula.open({
    mode: 'insert',
    blockId,
    from: selection.from.offset,
    to: selection.to.offset,
    latex: selectedLatex(editor, blockId, selection.from.offset, selection.to.offset),
    position: anchorOf(rect, view.getElement(blockId) ?? null),
  });

  return true;
}

export function openFormulaAt(view: EditorView, host: Element): boolean {
  const editable = host.closest<HTMLElement>('.editable[data-id]');
  const blockId = editable?.dataset.id;

  if (!editable || !blockId) return false;

  const offset = getOffsetIn(editable, host, 0);

  view.toolbar.hide();
  view.formula.open({
    mode: 'edit',
    blockId,
    from: offset,
    to: offset + 1,
    latex: host.getAttribute('data-latex') ?? '',
    position: anchorOf(host.getBoundingClientRect(), editable),
  });

  return true;
}

/**
 * Применяет результат окошка: вставляет формулу, меняет код существующей или (пустой код при правке) удаляет её.
 * Курсор ставится сразу после формулы. Возвращает false, если команда отклонена (пустой код при вставке, слишком
 * длинная формула).
 */
export function applyInlineFormula(
  editor: Editor,
  view: EditorView,
  state: FormulaEditorState,
  latex: string,
): boolean {
  const code = latex.trim();
  const { blockId, from, to } = state;

  if (code.length > MAX_FORMULA_LENGTH) return false;

  if (state.mode === 'insert' && code === '') return false;

  flushSync(() => {
    if (state.mode === 'insert') {
      editor.dispatch({ type: 'insertFormula', payload: { blockId, from, to, latex: code } });
    } else if (code === '') {
      editor.dispatch({ type: 'deleteText', payload: { blockId, from, to } });
    } else {
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: {
          from: { blockId, offset: from },
          to: { blockId, offset: to },
          attributes: { formula: code },
        },
      });
    }
  });

  view.placeCaret(blockId, state.mode === 'edit' && code === '' ? from : Math.min(from, to) + 1);

  return true;
}

/**
 * Markdown-шорткат: при вводе закрывающего `$` проверяет, не набрано ли `$код$`. Код не должен быть пустым и
 * не должен начинаться или кончаться пробелом (так «$5 и $6» остаётся ценой, а не формулой).
 * `before` — текст блока до курсора; возвращает начало `$` и код формулы.
 */
export function matchInlineFormula(before: string): { from: number; latex: string } | null {
  const start = before.lastIndexOf('$');

  if (start < 0 || before[start - 1] === '\\') return null;

  const latex = before.slice(start + 1);

  if (latex === '' || /^\s|\s$/.test(latex) || latex.includes(FORMULA_CHAR)) return null;

  return { from: start, latex };
}
