import { useEffect, type RefObject } from 'react';

import type { CaretResult } from '@inkbrick/engine';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { syncToolbar } from '../toolbar/syncToolbar';
import { openFormulaAt } from '../formula/actions';
import { handleKeyDown } from '../keymap/keymap';
import { useEditorUI } from '../ui/EditorUIContext';
import { applyBeforeInput } from './beforeInput';
import { createInputActions } from './inputActions';
import { readDocSelection } from './selection';

const NAVIGATION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

function diffText(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;

  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }

  return { from: start, to: endBefore, text: after.slice(start, endAfter) };
}

/** События из полей ввода и кнопок внутри пользовательских компонентов редактор не перехватывает. */
function isForeignControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, button, [data-inkbrick-ignore-input]') !== null
  );
}

/**
 * Подключает ввод к корню документа. Все изменения текста перехватываются на beforeinput,
 * превращаются в intent'ы движка, а выделение возвращается после перерисовки.
 * Выделение может охватывать несколько блоков.
 */
export function useEditorInput(ref: RefObject<HTMLElement | null>, enabled = true) {
  const editor = useEditor();
  const view = useEditorView();
  const { slashItems, keymap } = useEditorUI();

  useEffect(() => {
    const root = ref.current;

    if (!root || !enabled) return;

    let composing = false;

    const actions = createInputActions(editor, view, root, slashItems);
    const { exec, run, syncSlash, blockText, replaceSelection, toggleFormat, undo, redo } = actions;

    const onBeforeInput = (event: InputEvent) => {
      if (isForeignControl(event.target)) return;

      // Во время IME-композиции браузер сам меняет DOM; модель синхронизируется на compositionend.
      if (composing || event.isComposing) return;

      event.preventDefault();

      applyBeforeInput(event, root, editor, view, slashItems, actions);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isForeignControl(event.target)) return;

      const handled = handleKeyDown(keymap, {
        editor,
        view,
        root,
        event,
        slashItems,
        selection: () => readDocSelection(root),
        exec,
        run,
        replaceSelection,
        undo,
        redo,
        toggleFormat,
      });

      // Перемещение курсора — граница шага undo: следующий набор текста начнёт новый шаг.
      if (!handled && NAVIGATION_KEYS.has(event.key)) editor.sealHistory();
    };

    /** Блок, в котором стоит каретка. Цель событий композиции — корень (contenteditable), а не блок. */
    const editableAtCaret = () => {
      const node = document.getSelection()?.anchorNode ?? null;
      const element = node instanceof Element ? node : node?.parentElement;
      const editable = element?.closest<HTMLElement>('.editable[data-id]');

      return editable && root.contains(editable) ? editable : null;
    };

    // Блок, где началась композиция: к её концу каретка у некоторых клавиатур уже может быть в другом месте.
    let compositionBlock: HTMLElement | null = null;

    const onCompositionStart = () => {
      composing = true;
      compositionBlock = editableAtCaret();
      // Набираемое слово ещё не в модели, и блок считается пустым: атрибут прячет подсказку поверх текста.
      compositionBlock?.setAttribute('data-composing', '');
    };

    /*
     * Клавиатуры телефонов набирают почти всё композицией: слово живёт только в DOM до compositionend,
     * поэтому здесь его нужно обязательно перенести в модель — иначе следующая перерисовка его сотрёт.
     */
    const onCompositionEnd = () => {
      composing = false;

      const started = compositionBlock?.isConnected ? compositionBlock : null;
      const element = started ?? editableAtCaret();
      const blockId = element?.dataset.id;

      compositionBlock?.removeAttribute('data-composing');
      compositionBlock = null;

      if (!element || !blockId) return;

      const { from, to, text } = diffText(blockText(blockId), element.textContent ?? '');

      if (from === to && text === '') return;

      run(() => exec<CaretResult>({ type: 'replaceText', payload: { blockId, from, to, text } }));
    };

    const prevent = (event: Event) => event.preventDefault();
    const sealHistory = () => editor.sealHistory();
    const closeSlash = () => view.slash.close();
    const onPointerDown = () => {
      view.pointerDown = true;
      view.toolbar.closeLink();
      view.toolbar.hide();
    };
    const onPointerUp = () => {
      if (!view.pointerDown) return;

      view.pointerDown = false;
      // Выделение окончательно установится после mouseup.
      setTimeout(() => syncToolbar(editor, view), 0);
    };
    const onClick = (event: MouseEvent) => {
      const formula =
        event.target instanceof Element ? event.target.closest('[data-inkbrick-formula]') : null;

      if (formula && root.contains(formula)) {
        event.preventDefault();
        openFormulaAt(view, formula);
        return;
      }

      if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) return;

      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');

      if (anchor && root.contains(anchor)) {
        event.preventDefault();
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
      }
    };
    const onSelectionChange = () => {
      if (view.slash.getState().open) syncSlash();
      syncToolbar(editor, view);
    };
    const syncIfOpen = () => {
      if (view.slash.getState().open) syncSlash();
      if (view.toolbar.getState().visible) syncToolbar(editor, view);
    };

    root.addEventListener('beforeinput', onBeforeInput);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('compositionstart', onCompositionStart);
    root.addEventListener('compositionend', onCompositionEnd);
    root.addEventListener('drop', prevent);
    root.addEventListener('pointerdown', sealHistory);
    root.addEventListener('focusout', sealHistory);
    root.addEventListener('pointerdown', closeSlash);
    root.addEventListener('focusout', closeSlash);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('click', onClick);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('scroll', syncIfOpen, true);

    return () => {
      root.removeEventListener('beforeinput', onBeforeInput);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('compositionstart', onCompositionStart);
      root.removeEventListener('compositionend', onCompositionEnd);
      root.removeEventListener('drop', prevent);
      root.removeEventListener('pointerdown', sealHistory);
      root.removeEventListener('focusout', sealHistory);
      root.removeEventListener('pointerdown', closeSlash);
      root.removeEventListener('focusout', closeSlash);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('click', onClick);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', syncIfOpen, true);
      compositionBlock?.removeAttribute('data-composing');
      view.slash.close();
      view.toolbar.hide();
    };
  }, [editor, view, ref, slashItems, keymap, enabled]);
}
