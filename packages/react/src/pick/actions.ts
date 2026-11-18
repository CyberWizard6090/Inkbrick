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

/** Расширяет выбор на соседа сверху или снизу от подвижного края; от якоря в обратную сторону выбор сужается. */
export function extendPick(editor: Editor, view: EditorView, direction: 1 | -1): boolean {
  const { anchor, focus } = view.picked.getState();

  if (!anchor || !focus) return false;

  const siblings = siblingsOf(editor, focus);
  const next = siblings[siblings.indexOf(focus) + direction];

  if (!next) return true;

  const run = runBetween(editor, anchor, next);

  if (!run) return true;

  view.picked.set(run, anchor, next);
  view.getElement(next)?.scrollIntoView?.({ block: 'nearest' });

  return true;
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
  const after = siblings.slice(siblings.indexOf(last) + 1).find((id) => !deletable.includes(id));
  const before = siblings
    .slice(0, siblings.indexOf(deletable[0]))
    .reverse()
    .find((id) => !deletable.includes(id));

  view.picked.clear();

  flushSync(() => {
    editor.batch(() => {
      for (const id of deletable) editor.execute('delete-block', { id });
    });
  });

  const target = after ?? before ?? parent;
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
 * Сдвигает блоки на одну позицию (перед предыдущим соседом или после следующего) одной правкой. `false`, если дальше
 * некуда или движок не принимает такой перенос.
 */
export function moveBlocks(
  editor: Editor,
  view: EditorView,
  ids: readonly string[],
  direction: 1 | -1,
): boolean {
  if (ids.length === 0) return false;

  const siblings = siblingsOf(editor, ids[0]);
  const first = siblings.indexOf(ids[0]);
  const last = siblings.indexOf(ids.at(-1)!);
  const neighbour = siblings[direction === -1 ? first - 1 : last + 1];

  if (!neighbour) return false;

  const position = direction === -1 ? 'before' : 'after';
  // Вверх переносим блоки по порядку перед соседом, вниз — с конца после соседа: порядок выбранных сохраняется.
  const order = direction === -1 ? [...ids] : [...ids].reverse();

  if (!order.every((id) => editor.can('moveBlock', { blockId: id, targetId: neighbour, position })))
    return false;

  flushSync(() => {
    editor.batch(() => {
      for (const id of order) {
        editor.dispatch({
          type: 'moveBlock',
          payload: { blockId: id, targetId: neighbour, position },
        });
      }
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

/** Фрагмент для буфера обмена: выбранные блоки целиком. */
export function pickedFragment(editor: Editor, ids: readonly string[]): Fragment | null {
  const first = editor.store.getBlock(ids[0]);
  const last = editor.store.getBlock(ids.at(-1)!);

  if (!first || !last) return null;

  return editor.copyFragment(
    { blockId: first.id, offset: 0 },
    { blockId: last.id, offset: editor.engine.inline.length(last.content) },
  );
}
