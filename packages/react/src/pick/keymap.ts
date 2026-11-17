import type { KeyBinding, KeymapContext } from '../keymap/types';
import {
  deleteBlocks,
  duplicateBlocks,
  extendPick,
  leavePick,
  moveBlocks,
  pickBlock,
  pickRun,
  pickableBlock,
  runBetween,
  stepPick,
} from './actions';

const picked = ({ view }: KeymapContext) => view.picked.size > 0;

/** Панели, которые закрывает Esc сами (поиск, палитра): выбирать блок под ними нельзя. */
const panelOpen = () =>
  typeof document !== 'undefined' &&
  document.querySelector('[data-inkbrick-ui="find"], [data-inkbrick-ui="palette"]') !== null;

/** Блок под кареткой, который можно выбрать, и, если выделение охватывает несколько блоков, весь их ряд. */
function blocksAtSelection({ editor, selection }: KeymapContext): readonly string[] {
  const current = selection();

  if (!current) return [];

  const from = pickableBlock(editor, current.from.blockId);
  const to = pickableBlock(editor, current.to.blockId);

  if (!from || !to) return [];

  return from === to ? [from] : (runBetween(editor, from, to) ?? [from]);
}

/** Блоки, которым адресовано действие: выбранные, а без выбора — блок под кареткой. */
const actionTargets = (context: KeymapContext): readonly string[] =>
  context.view.picked.size > 0
    ? context.view.picked.getState().ids
    : blocksAtSelection(context).slice(0, 1);

/** Не набор через IME, не Alt и событие ещё никто не обработал (например, Esc ячеек таблицы). */
const idle = (context: KeymapContext) =>
  !context.event.isComposing && !context.event.altKey && !context.event.defaultPrevented;

/**
 * Выбор блоков целиком и действия над ними. Esc в блоке выбирает его (или ряд блоков, который охватывает выделение),
 * Shift+↑/↓ расширяет, ↑/↓ переносит выбор, Enter возвращает каретку, Delete и Backspace удаляют, Ctrl/Cmd+D дублирует,
 * Ctrl/Cmd+Shift+↑/↓ сдвигает (работает и с кареткой в блоке). Копирование и вырезание — обычные Ctrl+C и Ctrl+X.
 */
export const pickKeymap: readonly KeyBinding[] = [
  {
    id: 'pick.exit',
    keys: 'Escape',
    when: (context) => picked(context) && idle(context),
    run: ({ editor, view }) => leavePick(editor, view, 'end'),
  },
  {
    id: 'pick.extendDown',
    keys: 'Shift-ArrowDown',
    when: picked,
    run: ({ editor, view }) => extendPick(editor, view, 1),
  },
  {
    id: 'pick.extendUp',
    keys: 'Shift-ArrowUp',
    when: picked,
    run: ({ editor, view }) => extendPick(editor, view, -1),
  },
  {
    id: 'pick.down',
    keys: 'ArrowDown',
    when: picked,
    run: ({ editor, view }) => stepPick(editor, view, 1),
  },
  {
    id: 'pick.up',
    keys: 'ArrowUp',
    when: picked,
    run: ({ editor, view }) => stepPick(editor, view, -1),
  },
  {
    id: 'pick.edit',
    keys: 'Enter',
    when: picked,
    run: ({ editor, view }) => leavePick(editor, view, 'start'),
  },
  {
    id: 'pick.delete',
    keys: ['Delete', 'Backspace'],
    when: picked,
    run: ({ editor, view }) => {
      deleteBlocks(editor, view, view.picked.getState().ids);
    },
  },
  {
    id: 'pick.duplicate',
    keys: 'Mod-d',
    when: (context) => idle(context) && actionTargets(context).length > 0,
    run: (context) => {
      const { editor, view } = context;
      const ids = actionTargets(context);
      const caret = view.picked.size === 0;
      const copies = duplicateBlocks(editor, view, ids);

      // Без выбора дублируется блок под кареткой, и каретка остаётся в нём.
      if (caret && copies.length > 0) {
        view.picked.clear();
        leavePick(editor, view, 'end');
        view.placeCaret(
          copies[0],
          editor.engine.inline.length(editor.store.getBlock(copies[0])?.content ?? []),
        );
      }

      return copies.length > 0 ? undefined : false;
    },
  },
  {
    id: 'pick.moveUp',
    keys: 'Mod-Shift-ArrowUp',
    when: (context) => idle(context) && actionTargets(context).length > 0,
    run: (context) => {
      const ids = actionTargets(context);

      return moveBlocks(context.editor, context.view, ids, -1) ? undefined : false;
    },
  },
  {
    id: 'pick.moveDown',
    keys: 'Mod-Shift-ArrowDown',
    when: (context) => idle(context) && actionTargets(context).length > 0,
    run: (context) => {
      const ids = actionTargets(context);

      return moveBlocks(context.editor, context.view, ids, 1) ? undefined : false;
    },
  },
  {
    id: 'pick.start',
    keys: 'Escape',
    when: (context) =>
      idle(context) &&
      !picked(context) &&
      !panelOpen() &&
      !context.view.slash.getState().open &&
      // У этих состояний свой Esc: меню, выделение ячеек таблицы.
      !context.view.contextMenu.getState().position &&
      !context.view.blocks.getState().menu &&
      !context.view.cells.get() &&
      blocksAtSelection(context).length > 0,
    run: (context) => {
      const ids = blocksAtSelection(context);

      if (ids.length === 1)
        return pickBlock(context.editor, context.view, ids[0]) ? undefined : false;

      pickRun(context.view, ids, ids[0], ids.at(-1));
    },
  },
];
