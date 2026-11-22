import { flushSync } from 'react-dom';

import type { CaretResult, Editor, Fragment } from '@inkbrick/engine';
import { BLOCK_BACKGROUNDS, getBlockBackgroundColor } from '@inkbrick/document';

import type { EditorView } from '../editing/EditorView';

/**
 * Блок, который выбирают целиком: блок под кареткой, а для частей составных блоков (ячейка и строка таблицы) — сама таблица.
 */
export function pickableBlock(editor: Editor, blockId: string): string | undefined {
  let block = editor.store.getBlock(blockId);

  while (block && (block.flavour === 'block:table-cell' || block.flavour === 'block:table-row')) {
    block = block.parentId ? editor.store.getBlock(block.parentId) : undefined;
  }

  const parent = block?.parentId ? editor.store.getBlock(block.parentId) : undefined;

  // Корень, страница и заметка сами блоками не выбираются.
  return block && parent && parent.flavour !== 'block:page' ? block.id : undefined;
}

/** Блок верхнего уровня заметки, в котором лежит `blockId` (или он сам). */
export function topBlock(editor: Editor, blockId: string): string | undefined {
  for (
    let block = editor.store.getBlock(blockId);
    block?.parentId;
    block = editor.store.getBlock(block.parentId)
  ) {
    if (editor.store.getBlock(block.parentId)?.flavour === 'block:note') return block.id;
  }

  return undefined;
}

/** Соседи блока (дети его родителя) в порядке документа. */
function siblingsOf(editor: Editor, blockId: string): readonly string[] {
  const parent = editor.store.getBlock(blockId)?.parentId;

  return parent ? (editor.store.getBlock(parent)?.children ?? []) : [];
}

/** Подряд идущие соседи от `a` до `b` включительно; `undefined`, если блоки не соседи. */
export function runBetween(editor: Editor, a: string, b: string): readonly string[] | undefined {
  const siblings = siblingsOf(editor, a);
  const from = siblings.indexOf(a);
  const to = siblings.indexOf(b);

  if (from < 0 || to < 0) return undefined;

  return siblings.slice(Math.min(from, to), Math.max(from, to) + 1);
}

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
export function targetsOf(view: EditorView, blockId: string): readonly string[] {
  const { ids } = view.picked.getState();

  return ids.length > 1 && ids.includes(blockId) ? ids : [blockId];
}

/** Удаляет блоки одной правкой; каретка — на ближайший оставшийся блок. Блоки, которые нельзя удалить, остаются. */
export function deleteBlocks(editor: Editor, view: EditorView, ids: readonly string[]): boolean {
  const deletable = ids.filter((id) => editor.can('delete-block', { id }));

  if (deletable.length === 0) return false;

  const last = deletable.at(-1)!;
  const parent = editor.store.getBlock(last)?.parentId;
  const siblings = parent ? (editor.store.getBlock(parent)?.children ?? []) : [];
  const removing = new Set(deletable);
  const after = siblings.slice(siblings.indexOf(last) + 1).find((id) => !removing.has(id));
  const before = siblings
    .slice(0, siblings.indexOf(deletable[0]))
    .reverse()
    .find((id) => !removing.has(id));

  view.picked.clear();

  flushSync(() => {
    editor.batch(() => {
      // Одной командой: по одному удаление тысяч выбранных блоков росло бы квадратично.
      editor.execute('delete-blocks', { ids: deletable });
    });
  });

  // Удалены все блоки родителя: редактор оставляет в нём один пустой абзац, каретка идёт в него (а не в сам родитель,
  // у которого нет редактируемого элемента: Firefox и Safari в этом случае теряют каретку и ввод уходит в пустоту).
  const target =
    after ?? before ?? (parent ? editor.store.getBlock(parent)?.children[0] : undefined) ?? parent;
  const block = target ? editor.store.getBlock(target) : undefined;

  if (block) {
    const focusable = after ? 0 : editor.engine.inline.length(block.content);

    view.placeCaret(block.id, focusable);
  }

  return true;
}

/** Дублирует блоки одной правкой: копии идут сразу после последнего из выбранных, в том же порядке. */
export function duplicateBlocks(
  editor: Editor,
  view: EditorView,
  ids: readonly string[],
): readonly string[] {
  const copies: string[] = [];

  flushSync(() => {
    editor.batch(() => {
      for (const id of ids) {
        if (!editor.can('duplicateBlock', { blockId: id })) continue;

        const copy = editor.dispatch({ type: 'duplicateBlock', payload: { blockId: id } }) as
          CaretResult | undefined;

        if (copy) copies.push(copy.blockId);
      }

      // Копия встаёт сразу после своего оригинала; собираем их блоком после последнего оригинала.
      let after = ids.at(-1)!;

      for (const copy of copies) {
        if (editor.can('moveBlock', { blockId: copy, targetId: after, position: 'after' })) {
          editor.dispatch({
            type: 'moveBlock',
            payload: { blockId: copy, targetId: after, position: 'after' },
          });
          after = copy;
        }
      }
    });
  });

  if (copies.length > 0) pickRun(view, copies);

  return copies;
}

/**
 * Сдвигает блоки на одну позицию (перед предыдущим соседом или после следующего) одной правкой; выбор вразброс сдвигается
 * блок за блоком, порядок выбранных сохраняется. `false`, если дальше некуда или движок не принимает такой перенос.
 */
export function moveBlocks(
  editor: Editor,
  view: EditorView,
  ids: readonly string[],
  direction: 1 | -1,
): boolean {
  if (ids.length === 0) return false;

  const chosen = new Set(ids);
  const moves: { blockId: string; targetId: string; position: 'before' | 'after' }[] = [];
  const position = direction === -1 ? 'before' : 'after';
  // Вверх идём по порядку, вниз — с конца: блок упирается в тот, что уже стоит у края, и не обгоняет его.
  const order = direction === -1 ? [...ids] : [...ids].reverse();
  const level = [...siblingsOf(editor, ids[0])];

  for (const blockId of order) {
    const at = level.indexOf(blockId);
    const targetId = level[at + direction];

    if (!targetId || chosen.has(targetId)) continue;

    moves.push({ blockId, targetId, position });
    level.splice(at, 1);
    level.splice(level.indexOf(targetId) + (direction === -1 ? 0 : 1), 0, blockId);
  }

  if (moves.length === 0) return false;
  if (!moves.every((move) => editor.can('moveBlock', move))) return false;

  flushSync(() => {
    editor.batch(() => {
      for (const move of moves) editor.dispatch({ type: 'moveBlock', payload: move });
    });
  });

  view.getElement(ids[0])?.scrollIntoView?.({ block: 'nearest' });

  return true;
}

/** Куда можно превратить блоки: тип и свойства пункта «Превратить в» (пункт slash-меню). */
interface ConvertTarget {
  readonly flavour: string;
  readonly props?: unknown;
}

/**
 * Блоки ряда, которые можно превратить в `item`; остальные пропускаются. В тип без текста (разделитель, таблица) превращается
 * только один блок: такой тип вставляется рядом и сдвигает остальные, ряд бы развалился.
 */
export function convertibleIn(
  editor: Editor,
  ids: readonly string[],
  item: ConvertTarget,
): readonly string[] {
  if (ids.length > 1 && editor.schema.getBlockSchema(item.flavour)?.inline === false) return [];

  return ids.filter((blockId) =>
    editor.can('convertBlock', { blockId, flavour: item.flavour, props: item.props as never }),
  );
}

/** Превращает блоки одной правкой (один шаг undo); блоки, которые не превращаются, остаются как были. */
export function convertBlocks(
  editor: Editor,
  ids: readonly string[],
  item: ConvertTarget,
): readonly string[] {
  const targets = convertibleIn(editor, ids, item);

  if (targets.length === 0) return targets;

  flushSync(() => {
    editor.batch(() => {
      for (const blockId of targets) {
        editor.dispatch({
          type: 'convertBlock',
          payload: { blockId, flavour: item.flavour, props: item.props as never },
        });
      }
    });
  });

  return targets;
}

/** Блоки ряда, у которых есть фон (движок принимает `background`); остальные пропускаются. */
export function backgroundTargets(editor: Editor, ids: readonly string[]): readonly string[] {
  return ids.filter((blockId) =>
    editor.can('setBlockProps', { blockId, props: { background: BLOCK_BACKGROUNDS[0] } }),
  );
}

/** Текущий фон блоков (имя из палитры или `#rrggbb`): общий для всех, `undefined` без фона или когда он разный. */
export function commonBackground(editor: Editor, ids: readonly string[]): string | undefined {
  const colors = new Set(ids.map((id) => getBlockBackgroundColor(editor.store.getBlock(id)!)));

  return colors.size === 1 ? [...colors][0] : undefined;
}

/** Задаёт (или снимает, `null`) фон блокам ряда одной правкой; блоки без фона пропускаются. */
export function setBackgrounds(
  editor: Editor,
  ids: readonly string[],
  color: string | null,
): readonly string[] {
  const targets = backgroundTargets(editor, ids);

  if (targets.length === 0) return targets;

  flushSync(() => {
    editor.batch(() => {
      for (const blockId of targets) {
        editor.dispatch({
          type: 'setBlockProps',
          payload: { blockId, props: { background: color ?? undefined } as never },
        });
      }
    });
  });

  return targets;
}

/** Самый глубокий последний потомок блока (или он сам): конец блока вместе со вложенными. */
function lastDescendant(editor: Editor, blockId: string) {
  let block = editor.store.getBlock(blockId);

  for (let last = block?.children.at(-1); last; last = block?.children.at(-1))
    block = editor.store.getBlock(last);

  return block;
}

/** Фрагмент для буфера обмена: выбранные блоки целиком; блоки, выбранные вразброс, идут подряд, без тех, что между ними. */
export function pickedFragment(editor: Editor, ids: readonly string[]): Fragment | null {
  const blocks: Fragment['blocks'] = [];
  const place = new Map(siblingsOf(editor, ids[0]).map((id, index) => [id, index]));
  let start = 0;

  for (let i = 1; i <= ids.length; i++) {
    if (i < ids.length && place.get(ids[i]) === place.get(ids[i - 1])! + 1) continue;

    const first = editor.store.getBlock(ids[start]);
    const last = lastDescendant(editor, ids[i - 1]);

    start = i;

    if (!first || !last) return null;

    const part = editor.copyFragment(
      { blockId: first.id, offset: 0 },
      { blockId: last.id, offset: editor.engine.inline.length(last.content) },
    );

    if (!part) return null;

    blocks.push(...part.blocks);
  }

  return { blocks };
}
