import { useSyncExternalStore } from 'react';

import type { BaseBlock, TableProps, TableView } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { useEditorView } from '../hooks/useEditorView';

/** Код вида, которого нет в документе: таблица без списка видов. */
export const DEFAULT_VIEW_ID = 'default';

/** Виды таблицы; без списка — один вид без настроек. */
export const viewsOf = (props: TableProps): readonly TableView[] =>
  props.views ?? [{ id: DEFAULT_VIEW_ID }];

/** Настроен ли вид: скрытые столбцы, фильтры или сортировка. */
export const isCustomized = (view: TableView): boolean =>
  !!view.hidden?.some(Boolean) || !!view.filters?.some(Boolean) || !!view.sort;

/**
 * Открытый вид каждой таблицы. Хранится в окне, а не в документе: у каждого читателя свой открытый вид, переключение не
 * правка и не попадает в историю.
 */
class ActiveViews {
  private readonly ids = new Map<string, string>();

  private readonly listeners = new Set<() => void>();

  get = (tableId: string): string | undefined => this.ids.get(tableId);

  set(tableId: string, viewId: string): void {
    if (this.ids.get(tableId) === viewId) return;

    this.ids.set(tableId, viewId);
    for (const listener of [...this.listeners]) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  };
}

const registry = new WeakMap<EditorView, ActiveViews>();

const activeViewsOf = (view: EditorView): ActiveViews => {
  let active = registry.get(view);

  if (!active) {
    active = new ActiveViews();
    registry.set(view, active);
  }

  return active;
};

/** Открытый вид таблицы (первый, если выбранного уже нет) и функция переключения. */
export function useActiveView(table: BaseBlock): {
  readonly views: readonly TableView[];
  readonly active: TableView;
  readonly select: (id: string) => void;
} {
  const view = useEditorView();
  const store = activeViewsOf(view);
  const chosen = useSyncExternalStore(
    store.subscribe,
    () => store.get(table.id),
    () => undefined,
  );
  const views = viewsOf(table.props as TableProps);
  const active = views.find((candidate) => candidate.id === chosen) ?? views[0];

  return { views, active, select: (id) => store.set(table.id, id) };
}

export function selectView(view: EditorView, tableId: string, viewId: string): void {
  activeViewsOf(view).set(tableId, viewId);
}

let counter = 0;

/** Новый код вида: уникален в пределах таблицы и не зависит от порядка. */
export const newViewId = (): string =>
  `view-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Список видов, который запишется после `change`: список из одного вида без названия и настроек — это отсутствие списка
 * (пустой массив).
 */
function nextViews(
  table: BaseBlock,
  change: (views: readonly TableView[]) => readonly TableView[],
): readonly TableView[] {
  const next = change(viewsOf(table.props as TableProps));
  const plain = next.length === 1 && next[0].name === undefined && !isCustomized(next[0]);

  return plain ? [] : next;
}

/**
 * Меняет виды таблицы одной правкой. `change` получает текущие виды (для таблицы без списка — один вид по умолчанию) и
 * возвращает новые. `false`, если движок такой список не принимает.
 */
export function updateViews(
  editor: Editor,
  table: BaseBlock,
  change: (views: readonly TableView[]) => readonly TableView[],
): boolean {
  const views = nextViews(table, change);

  if (!editor.can('setTableViews', { blockId: table.id, views } as never)) return false;

  editor.dispatch({ type: 'setTableViews', payload: { blockId: table.id, views } } as never);

  return true;
}

const withView =
  (viewId: string, change: (view: TableView) => TableView) => (views: readonly TableView[]) =>
    views.map((view) => (view.id === viewId ? tidy(change(view)) : view));

/** Меняет один вид: `change` получает его и возвращает новый. */
export function updateView(
  editor: Editor,
  table: BaseBlock,
  viewId: string,
  change: (view: TableView) => TableView,
): boolean {
  return updateViews(editor, table, withView(viewId, change));
}

/** Примет ли движок такое изменение вида (для недоступных пунктов меню). */
export function canUpdateView(
  editor: Editor,
  table: BaseBlock,
  viewId: string,
  change: (view: TableView) => TableView,
): boolean {
  return editor.can('setTableViews', {
    blockId: table.id,
    views: nextViews(table, withView(viewId, change)),
  } as never);
}

/** Убирает из вида пустые настройки, чтобы он не хранил `hidden: [false, false]`. */
function tidy(view: TableView): TableView {
  const next: TableView = { id: view.id };

  if (view.name !== undefined && view.name !== '') next.name = view.name;
  if (view.hidden?.some(Boolean)) next.hidden = view.hidden;
  if (view.filters?.some(Boolean)) next.filters = view.filters;
  if (view.sort) next.sort = view.sort;

  return next;
}

/** Копия списка с элементом `index`, равным `value`; пустые места заполняются `fill`. */
export const setAt = <T>(list: readonly T[] | undefined, index: number, value: T, fill: T): T[] => {
  const next = Array.from(
    { length: Math.max(list?.length ?? 0, index + 1) },
    (_, i) => list?.[i] ?? fill,
  );

  next[index] = value;

  return next;
};
