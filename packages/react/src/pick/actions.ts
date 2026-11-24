import { flushSync } from 'react-dom';

import type { CaretResult, Editor, Fragment } from '@inkbrick/engine';
import {
  backgroundTargets as engineBackgroundTargets,
  blocksFragment,
  commonBackground as engineCommonBackground,
  convertibleIn as engineConvertibleIn,
  pickableBlock,
  runBetween,
  siblingsOf,
} from '@inkbrick/engine/internal';

import type { EditorView } from '@inkbrick/view';

// Запросы к дереву живут в движке: там же их используют команды и код без интерфейса.
export { pickableBlock, runBetween, topBlock } from '@inkbrick/engine/internal';

/** Убирает выделение текста: действия над блоками не должны делить фокус с кареткой. Корень остаётся в фокусе. */
function dropTextSelection(view: EditorView): void {
  const root = view.getRoot();

  // Сначала фокус (браузер ставит в фокусируемый корень каретку), потом убираем выделение.
  if (root && globalThis.document.activeElement !== root) root.focus({ preventScroll: true });

  globalThis.getSelection()?.removeAllRanges();
}

/** Выбирает блок целиком (каретка исчезает, корень остаётся в фокусе — клавиши продолжают работать). */
export function pickBlock(editor: Editor, view: EditorView, blockId: string): boolean {
  const id = pickableBlock(editor, blockId);

  if (!id) return false;

  view.picked.set([id], id, id);
  dropTextSelection(view);
  view.getElement(id)?.scrollIntoView?.({ block: 'nearest' });

  return true;
}

/** Выбирает подряд идущие блоки; якорь — первый, подвижный край — последний (или заданные). */
export function pickRun(
  view: EditorView,
  ids: readonly string[],
  anchor?: string,
  focus?: string,
): void {
  view.picked.set(ids, anchor, focus);
  dropTextSelection(view);
}

/** Блоки в порядке документа (соседи `like`): выбор всегда хранится так, даже если он собран вразброс. */
function inOrder(editor: Editor, like: string, ids: ReadonlySet<string>): string[] {
  return siblingsOf(editor, like).filter((id) => ids.has(id));
}

/**
 * Расширяет выбор на соседа сверху или снизу от подвижного края; если сосед уже выбран (путь назад к якорю), выбор
 * сужается на край. Блоки, выбранные вразброс, остаются.
 */
export function extendPick(editor: Editor, view: EditorView, direction: 1 | -1): boolean {
  const { ids, anchor, focus } = view.picked.getState();

  if (!anchor || !focus) return false;

  const siblings = siblingsOf(editor, focus);
  const next = siblings[siblings.indexOf(focus) + direction];

  if (!next) return true;

  const rest = new Set(ids);

  if (rest.has(next)) rest.delete(focus);
  else rest.add(next);

  view.picked.set(inOrder(editor, focus, rest), anchor, next);
  view.getElement(next)?.scrollIntoView?.({ block: 'nearest' });

  return true;
}

/** Сосед `blockId` (или он сам) под родителем `parentId`: блок, который лежит на пути от `blockId` к этому родителю. */
function siblingUnder(editor: Editor, blockId: string, parentId: string): string | undefined {
  for (
    let block = editor.store.getBlock(blockId);
    block;
    block = block.parentId ? editor.store.getBlock(block.parentId) : undefined
  ) {
    if (block.parentId === parentId) return block.id;
  }

  return undefined;
}

/**
 * Shift+клик по блоку или ручке: выбор расширяется от якоря до кликнутого блока (диапазон). Без выбора якорь — `from`
 * (блок под кареткой), а если и его нет — выбирается один кликнутый блок. Блок из другой ветки ставит новый выбор.
 */
export function pickRangeTo(
  editor: Editor,
  view: EditorView,
  blockId: string,
  from?: string,
): boolean {
  const target = pickableBlock(editor, blockId);

  if (!target) return false;

  const anchor = view.picked.getState().anchor ?? (from && pickableBlock(editor, from));
  const parent = anchor ? editor.store.getBlock(anchor)?.parentId : undefined;
  const end = parent ? siblingUnder(editor, target, parent) : undefined;
  const run = anchor && end ? runBetween(editor, anchor, end) : undefined;

  if (!anchor || !end || !run) return pickBlock(editor, view, target);

  view.picked.set(run, anchor, end);
  dropTextSelection(view);

  return true;
}

/**
 * Ctrl/Cmd+клик по ручке: блок добавляется в выбор или убирается из него. Выбор может быть несвязным; блок из другой
 * ветки начинает выбор заново.
 */
export function togglePick(editor: Editor, view: EditorView, blockId: string): boolean {
  const target = pickableBlock(editor, blockId);

  if (!target) return false;

  const { ids } = view.picked.getState();
  const same =
    ids.length > 0 &&
    editor.store.getBlock(ids[0])?.parentId === editor.store.getBlock(target)?.parentId;

  if (!same) return pickBlock(editor, view, target);

  if (!ids.includes(target)) {
    view.picked.set(inOrder(editor, target, new Set([...ids, target])), target, target);
    dropTextSelection(view);

    return true;
  }

  const rest = ids.filter((id) => id !== target);

  // Снятый последним блок уводит выбор: каретка клавиш остаётся на последнем из оставшихся.
  view.picked.set(rest, rest[0], rest.at(-1));

  return true;
}

/**
 * Выбирает все блоки того же уровня (Ctrl/Cmd+A); если они уже выбраны, поднимается на уровень выше. `false`, если
 * выбирать некуда.
 */
export function pickAll(editor: Editor, view: EditorView, blockId?: string): boolean {
  let base: string | undefined = blockId ?? view.picked.getState().ids[0];

  while (base) {
    const level = siblingsOf(editor, base);
    const done = level.length > 0 && level.every((id) => view.picked.has(id));
    const up: string | null | undefined = editor.store.getBlock(base)?.parentId;

    if (!done) {
      view.picked.set(level, level[0], level.at(-1));
      dropTextSelection(view);

      return true;
    }

    base = up ? pickableBlock(editor, up) : undefined;
  }

  return false;
}

/** Переносит выбор на соседа без расширения. */
export function stepPick(editor: Editor, view: EditorView, direction: 1 | -1): boolean {
  const { focus } = view.picked.getState();

  if (!focus) return false;

  const siblings = siblingsOf(editor, focus);
  const next = siblings[siblings.indexOf(focus) + direction];

  if (next) view.picked.set([next], next, next);

  return true;
}

/** Каретка в конец выбранного блока (первого из выбранных), выбор снят. */
export function leavePick(editor: Editor, view: EditorView, edge: 'start' | 'end' = 'end'): void {
  const ids = view.picked.getState().ids;
  const id = edge === 'start' ? ids[0] : ids.at(-1);

  view.picked.clear();

  const block = id ? editor.store.getBlock(id) : undefined;

  if (block)
    view.placeCaret(block.id, edge === 'start' ? 0 : editor.engine.inline.length(block.content));
}

/** Блоки, к которым относится действие над `blockId`: весь выбор, если блок в нём, иначе только он сам. */
/**
 * Блок, за который на самом деле взялись: если `blockId` лежит внутри выбранного блока (например, рамка выбрала блок
 * колонок, а ручку тянут у картинки в колонке), действие относится к выбранному блоку целиком.
 */
export function pickedOwner(editor: Editor, view: EditorView, blockId: string): string {
  const { ids } = view.picked.getState();

  if (ids.length === 0 || ids.includes(blockId)) return blockId;

  const picked = new Set(ids);

  for (
    let id = editor.store.getBlock(blockId)?.parentId;
    id;
    id = editor.store.getBlock(id)?.parentId
  ) {
    if (picked.has(id)) return id;
  }

  return blockId;
}

export function targetsOf(view: EditorView, blockId: string): readonly string[] {
  const { ids } = view.picked.getState();

  return ids.length > 1 && ids.includes(blockId) ? ids : [blockId];
}

/**
 * Удаляет блоки одной правкой (команда `delete-blocks`); каретка — туда, куда её ставит команда: на ближайший оставшийся
 * блок. Блоки, которые нельзя удалить, остаются.
 */
export function deleteBlocks(editor: Editor, view: EditorView, ids: readonly string[]): boolean {
  if (!editor.can('delete-blocks', { ids })) return false;

  const result: { caret?: CaretResult } = {};

  view.picked.clear();
  // Синхронно: каретку можно поставить, только когда удалённые блоки ушли из DOM.
  flushSync(() => {
    result.caret = editor.execute('delete-blocks', { ids });
  });

  if (result.caret) view.placeCaret(result.caret.blockId, result.caret.offset);

  return true;
}

/** Дублирует блоки одной правкой (`duplicateBlocks`) и выбирает копии. */
export function duplicateBlocks(
  editor: Editor,
  view: EditorView,
  ids: readonly string[],
): readonly string[] {
  let copies: readonly string[] = [];

  flushSync(() => {
    copies = editor.execute('duplicateBlocks', { ids })?.ids ?? [];
  });

  if (copies.length > 0) pickRun(view, copies);

  return copies;
}

/** Сдвигает блоки на одну позицию (`moveBlocks`). `false`, если дальше некуда или перенос недопустим. */
export function moveBlocks(
  editor: Editor,
  view: EditorView,
  ids: readonly string[],
  direction: 1 | -1,
): boolean {
  if (ids.length === 0 || !editor.can('moveBlocks', { ids, direction })) return false;

  flushSync(() => {
    editor.execute('moveBlocks', { ids, direction });
  });

  view.getElement(ids[0])?.scrollIntoView?.({ block: 'nearest' });

  return true;
}

/** Куда можно превратить блоки: тип и свойства пункта «Превратить в» (пункт slash-меню). */
interface ConvertTarget {
  readonly flavour: string;
  readonly props?: unknown;
}

/** Блоки ряда, которые можно превратить в `item` (правило — в движке, `convertibleIn`). */
export function convertibleIn(
  editor: Editor,
  ids: readonly string[],
  item: ConvertTarget,
): readonly string[] {
  return engineConvertibleIn(editor, ids, item);
}

/** Превращает блоки одной правкой (`convertBlocks`); блоки, которые не превращаются, остаются как были. */
export function convertBlocks(
  editor: Editor,
  ids: readonly string[],
  item: ConvertTarget,
): readonly string[] {
  let converted: readonly string[] = [];

  flushSync(() => {
    converted =
      editor.execute('convertBlocks', { ids, flavour: item.flavour, props: item.props as never })
        ?.ids ?? [];
  });

  return converted;
}

/** Блоки ряда, у которых есть фон. */
export const backgroundTargets = engineBackgroundTargets;

/** Текущий фон блоков: общий для всех, `undefined` без фона или когда он разный. */
export const commonBackground = engineCommonBackground;

/** Задаёт (или снимает, `null`) фон блокам ряда одной правкой (`setBlockBackgrounds`). */
export function setBackgrounds(
  editor: Editor,
  ids: readonly string[],
  color: string | null,
): readonly string[] {
  let changed: readonly string[] = [];

  flushSync(() => {
    changed = editor.execute('setBlockBackgrounds', { ids, background: color })?.ids ?? [];
  });

  return changed;
}

/** Фрагмент для буфера обмена: выбранные блоки целиком (`blocksFragment` движка). */
export function pickedFragment(editor: Editor, ids: readonly string[]): Fragment | null {
  return blocksFragment(editor, ids);
}
