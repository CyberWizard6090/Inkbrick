import type { CaretResult } from '@inkbrick/engine';
import type { Alignment } from '@inkbrick/document';

import { applySlashItem } from '../slash/applySlashItem';
import { visibleSlashItems } from '../slash/items';
import { isFormattable } from '../toolbar/formatting';
import { syncToolbar } from '../toolbar/syncToolbar';
import { selectAllText } from '../editing/selection';
import { openInlineFormula } from '../formula/actions';
import { setAlignInSelection } from '../toolbar/rich';
import { deleteForwardAtEnd } from '../editing/deleteAtBoundary';
import type { KeyBinding, KeymapContext } from './types';

const caretAtEdge =
  (edge: 'start' | 'end') =>
  ({ editor, event, selection }: KeymapContext): boolean => {
    const current = selection();

    if (event.isComposing || !current?.collapsed) return false;
    if (edge === 'start') return current.from.offset === 0;

    const block = editor.store.getBlock(current.from.blockId);

    return !!block && current.from.offset === editor.engine.inline.length(block.content);
  };

const slashOpen = ({ view }: KeymapContext) => {
  const state = view.slash.getState();

  return state.open && state.blockId !== null;
};

function visibleItems({ editor, view, slashItems }: KeymapContext) {
  const state = view.slash.getState();

  return visibleSlashItems(editor, slashItems, state.blockId!, state.query);
}

const slashMove = (direction: 1 | -1) => (context: KeymapContext) => {
  const visible = visibleItems(context);

  if (visible.length === 0) return false;

  context.view.slash.move(direction, visible.length);
};

function indent(context: KeymapContext) {
  const { editor, event } = context;
  const selection = context.selection();

  if (!selection || selection.from.blockId !== selection.to.blockId) return;

  const block = editor.store.getBlock(selection.from.blockId);

  if (!block) return;

  if (block.flavour === 'block:code') {
    if (!event.shiftKey) context.run(() => context.replaceSelection(selection, '  '));
    return;
  }

  context.run(() => {
    context.exec({
      type: event.shiftKey ? 'outdentBlock' : 'indentBlock',
      payload: { blockId: block.id },
    });

    return { blockId: block.id, offset: selection.from.offset };
  });
}

const toggle = (format: string) => (context: KeymapContext) => context.toggleFormat(format);

const align = (value: Alignment) => (context: KeymapContext) => {
  const selection = context.selection();

  if (!selection || !setAlignInSelection(context.editor, context.view, selection, value))
    return false;
};

/**
 * Стандартные привязки редактора, в порядке проверки. Свои привязки передаются в `<EditorProvider keymap>`:
 * тот же `id` заменяет стандартную, новый `id` проверяется раньше стандартных.
 */
export const defaultKeymap: readonly KeyBinding[] = [
  {
    id: 'slash.next',
    keys: ['ArrowDown', 'Shift-ArrowDown'],
    when: slashOpen,
    run: slashMove(1),
  },
  {
    id: 'slash.previous',
    keys: ['ArrowUp', 'Shift-ArrowUp'],
    when: slashOpen,
    run: slashMove(-1),
  },
  {
    id: 'slash.accept',
    keys: ['Enter', 'Shift-Enter', 'Tab', 'Shift-Tab'],
    when: slashOpen,
    run: (context) => {
      const state = context.view.slash.getState();
      const visible = visibleItems(context);
      const item = visible[Math.min(state.activeIndex, visible.length - 1)];

      if (item) {
        applySlashItem(context.editor, context.view, item);
        return;
      }

      // Подходящих пунктов нет: меню закрывается, клавиша работает как обычно (например, Tab-отступ).
      context.view.slash.close();

      return false;
    },
  },
  {
    id: 'slash.close',
    keys: ['Escape', 'Shift-Escape'],
    when: slashOpen,
    run: ({ view }) => view.slash.close(),
  },

  // Выделить всё: нативное поведение ненадёжно для документа, начинающегося с нередактируемого блока.
  { id: 'selectAll', keys: 'Mod-a', run: ({ root }) => selectAllText(root) },
  { id: 'undo', keys: 'Mod-z', run: (context) => context.undo() },
  { id: 'redo', keys: ['Mod-Shift-z', 'Mod-y'], run: (context) => context.redo() },
  {
    id: 'link',
    keys: 'Mod-k',
    run: (context) => {
      const selection = context.selection();

      if (!selection || selection.collapsed || !isFormattable(context.editor, selection)) {
        return false;
      }

      syncToolbar(context.editor, context.view);
      context.view.toolbar.openLink();
    },
  },

  { id: 'format.bold', keys: 'Mod-b', run: toggle('bold') },
  { id: 'format.italic', keys: 'Mod-i', run: toggle('italic') },
  { id: 'format.underline', keys: 'Mod-u', run: toggle('underline') },
  { id: 'format.code', keys: 'Mod-e', run: toggle('code') },
  { id: 'format.strike', keys: 'Mod-Shift-x', run: toggle('strike') },

  { id: 'align.left', keys: 'Mod-Shift-l', run: align('left') },
  { id: 'align.center', keys: 'Mod-Shift-e', run: align('center') },
  { id: 'align.right', keys: 'Mod-Shift-r', run: align('right') },
  { id: 'align.justify', keys: 'Mod-Shift-j', run: align('justify') },

  {
    id: 'formula.inline',
    keys: 'Mod-Shift-m',
    run: ({ editor, view }) => openInlineFormula(editor, view),
  },

  { id: 'indent', keys: ['Tab', 'Shift-Tab'], run: indent },

  /*
   * Backspace в начале и Delete в конце блока обрабатываются уже на keydown: Safari не присылает beforeinput,
   * если сам считает, что удалять нечего (пустой блок, соседний блок без текста), и клавиша бы не сработала.
   */
  {
    id: 'delete.blockStart',
    keys: 'Backspace',
    when: caretAtEdge('start'),
    run: (context) => {
      const { blockId } = context.selection()!.from;

      context.run(() =>
        context.exec<CaretResult>({ type: 'deleteBackward', payload: { blockId, offset: 0 } }),
      );
    },
  },
  {
    id: 'delete.blockEnd',
    keys: 'Delete',
    when: caretAtEdge('end'),
    run: (context) => {
      const { blockId } = context.selection()!.from;

      context.run(() => deleteForwardAtEnd(context.editor, blockId));
    },
  },
];
