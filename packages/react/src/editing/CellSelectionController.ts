import type { BlockId } from '@inkbrick/document';
import type { TableCellRef, TableRange } from '@inkbrick/engine';

export interface CellSelection {
  readonly tableId: BlockId;
  /** Ячейка, с которой началось выделение, и ячейка, до которой оно протянуто. */
  readonly anchor: TableCellRef;
  readonly head: TableCellRef;
  readonly range: TableRange;
  readonly ids: ReadonlySet<BlockId>;
}

/**
 * Выделение ячеек таблицы прямоугольником. Живёт отдельно от выделения текста в браузере: пока оно есть, выделенных
 * символов в документе нет, а копирование, вырезание и удаление относятся к ячейкам. Подписка идёт на уровне ячейки.
 */
export class CellSelectionController {
  private state: CellSelection | null = null;

  private readonly listeners = new Set<() => void>();

  get = (): CellSelection | null => this.state;

  isSelected = (cellId: BlockId): boolean => this.state?.ids.has(cellId) ?? false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  set(next: CellSelection | null): void {
    if (this.state === next) return;

    this.state = next;

    for (const listener of [...this.listeners]) listener();
  }

  clear(): void {
    this.set(null);
  }
}
