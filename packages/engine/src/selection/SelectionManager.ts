import type { BaseBlock, BlockId } from '@inkbrick/document';

import type { TableCellRef } from '../table/tableRange';
import { orderRange, type BlockPoint } from '../utils';

/** Выделение текста: от `anchor` (где начали) до `focus` (подвижный край). Совпадают — это каретка. */
export interface TextSelection {
  readonly type: 'text';
  readonly anchor: BlockPoint;
  readonly focus: BlockPoint;
}

/** Выбранные блоки целиком (рамка, Shift+стрелки по блокам, Esc): в порядке документа. */
export interface BlocksSelection {
  readonly type: 'blocks';
  readonly ids: readonly BlockId[];
}

/** Прямоугольник ячеек таблицы: от ячейки `anchor` до ячейки `head`. */
export interface CellsSelection {
  readonly type: 'cells';
  readonly tableId: BlockId;
  readonly anchor: TableCellRef;
  readonly head: TableCellRef;
}

/** Выделение редактора: текст, блоки или ячейки; `null` — выделения нет (фокус не в документе). */
export type SelectionState = TextSelection | BlocksSelection | CellsSelection | null;

/**
 * Откуда изменение: `api` — код приложения (`editor.selection.set`), `view` — пользователь в интерфейсе, `command` —
 * результат команды (каретка, которую она вернула), `history` — undo/redo, `document` — правка убрала блок или текст, на
 * который указывало выделение. Интерфейс переносит на экран только `api`: остальное он делает сам.
 */
export type SelectionOrigin = 'api' | 'view' | 'command' | 'history' | 'document';

export type SelectionListener = (selection: SelectionState, origin: SelectionOrigin) => void;

interface SelectionHost {
  readonly rootId: BlockId;
  getBlock(id: BlockId): BaseBlock | undefined;
}

const textLength = (block: BaseBlock) =>
  block.content.reduce((length, node) => length + node.insert.length, 0);

/**
 * Выделение редактора как данные: что выделено, независимо от того, есть ли интерфейс. Интерфейс (`@inkbrick/react`)
 * записывает сюда выделение пользователя и ставит на экран выделение, заданное кодом; без интерфейса (сервер, тесты)
 * его ставят команды — каретку из своего результата — и undo/redo. После каждой правки выделение проверяется: точки в
 * удалённых блоках пропадают, смещения за концом текста прижимаются к концу.
 */
export class SelectionManager {
  private state: SelectionState = null;

  private readonly listeners = new Set<SelectionListener>();

  constructor(private readonly host: SelectionHost) {}

  /** Текущее выделение. */
  get(): SelectionState {
    return this.state;
  }

  /** Каретка (выделение текста нулевой длины). */
  get isCollapsed(): boolean {
    const { state } = this;

    return (
      state?.type === 'text' &&
      state.anchor.blockId === state.focus.blockId &&
      state.anchor.offset === state.focus.offset
    );
  }

  /**
   * Выделение текста в порядке документа (`from` раньше `to`), какой бы край ни был подвижным; `null` — выделен не
   * текст.
   */
  range(): { readonly from: BlockPoint; readonly to: BlockPoint } | null {
    const { state } = this;

    if (state?.type !== 'text') return null;

    const ordered = orderRange(
      (id) => this.host.getBlock(id),
      this.host.rootId,
      state.anchor,
      state.focus,
    );

    return ordered ? { from: ordered.from, to: ordered.to } : null;
  }

  /**
   * Задаёт выделение. Указатель на несуществующий блок отклоняется (выделение не меняется, результат `false`);
   * смещение за концом текста прижимается к концу.
   */
  set(next: SelectionState, origin: SelectionOrigin = 'api'): boolean {
    const valid = next === null ? null : this.validate(next);

    if (next !== null && valid === null) return false;

    this.commit(valid, origin);

    return true;
  }

  caret(point: BlockPoint, origin: SelectionOrigin = 'api'): boolean {
    return this.set({ type: 'text', anchor: point, focus: point }, origin);
  }

  select(anchor: BlockPoint, focus: BlockPoint, origin: SelectionOrigin = 'api'): boolean {
    return this.set({ type: 'text', anchor, focus }, origin);
  }

  selectBlocks(ids: readonly BlockId[], origin: SelectionOrigin = 'api'): boolean {
    return this.set(ids.length > 0 ? { type: 'blocks', ids } : null, origin);
  }

  selectCells(
    tableId: BlockId,
    anchor: TableCellRef,
    head: TableCellRef = anchor,
    origin: SelectionOrigin = 'api',
  ): boolean {
    return this.set({ type: 'cells', tableId, anchor, head }, origin);
  }

  clear(origin: SelectionOrigin = 'api'): void {
    this.commit(null, origin);
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Проверяет выделение после правки документа: то, что пропало, убирается, смещения прижимаются к тексту. */
  revalidate(): void {
    if (this.state === null) return;

    const valid = this.validate(this.state);

    if (valid !== this.state) this.commit(valid, 'document');
  }

  private validate(selection: Exclude<SelectionState, null>): SelectionState {
    if (selection.type === 'text') {
      const anchor = this.point(selection.anchor);
      const focus = this.point(selection.focus);

      if (!anchor || !focus) return null;

      return anchor === selection.anchor && focus === selection.focus
        ? selection
        : { type: 'text', anchor, focus };
    }

    if (selection.type === 'blocks') {
      const ids = selection.ids.filter((id) => this.host.getBlock(id) !== undefined);

      if (ids.length === 0) return null;

      return ids.length === selection.ids.length ? selection : { type: 'blocks', ids };
    }

    const table = this.host.getBlock(selection.tableId);

    if (table?.flavour !== 'block:table') return null;

    const rows = table.children.length;
    const columns = rows > 0 ? (this.host.getBlock(table.children[0])?.children.length ?? 0) : 0;
    const clamp = (cell: TableCellRef): TableCellRef => ({
      row: Math.max(0, Math.min(cell.row, rows - 1)),
      column: Math.max(0, Math.min(cell.column, columns - 1)),
    });

    if (rows === 0 || columns === 0) return null;

    const anchor = clamp(selection.anchor);
    const head = clamp(selection.head);
    const same = (a: TableCellRef, b: TableCellRef) => a.row === b.row && a.column === b.column;

    return same(anchor, selection.anchor) && same(head, selection.head)
      ? selection
      : { ...selection, anchor, head };
  }

  /** Точка в существующем блоке; смещение — в пределах его текста. */
  private point(point: BlockPoint): BlockPoint | null {
    const block = this.host.getBlock(point.blockId);

    if (!block || !Number.isFinite(point.offset)) return null;

    const offset = Math.max(0, Math.min(Math.trunc(point.offset), textLength(block)));

    return offset === point.offset ? point : { blockId: point.blockId, offset };
  }

  private commit(next: SelectionState, origin: SelectionOrigin): void {
    if (same(this.state, next)) return;

    this.state = next;

    for (const listener of [...this.listeners]) listener(next, origin);
  }
}

function same(a: SelectionState, b: SelectionState): boolean {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;

  return JSON.stringify(a) === JSON.stringify(b);
}
