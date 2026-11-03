import type { Change } from '../changes';

export interface HistoryMeta {
  before?: unknown;
  after?: unknown;
}

export interface HistoryEntry {
  changes: Change[];
  mergeKey?: string;
  timestamp: number;
  meta?: HistoryMeta;
}

export interface HistoryOptions {
  /** Максимум шагов undo (по умолчанию 200). */
  limit?: number;
  /** Окно, в течение которого однотипные правки (набор текста) сливаются в один шаг, мс (по умолчанию 1000). */
  mergeWindowMs?: number;
  now?: () => number;
}

export interface RecordInput {
  changes: readonly Change[];
  mergeKey?: string;
  /**
   * Окно слияния для этой записи вместо `HistoryOptions.mergeWindowMs`; `Infinity` — сливать независимо от времени.
   * Нужно связанным правкам, между которыми проходит неизвестное время (вставка картинки и её загрузка).
   */
  mergeWindowMs?: number;
  meta?: HistoryMeta;
}

export class History {
  private readonly undoStack: HistoryEntry[] = [];

  private readonly redoStack: HistoryEntry[] = [];

  private sealed = true;

  private readonly limit: number;

  private readonly mergeWindowMs: number;

  private readonly now: () => number;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 200;
    this.mergeWindowMs = options.mergeWindowMs ?? 1000;
    this.now = options.now ?? (() => Date.now());
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  record(input: RecordInput): void {
    const timestamp = this.now();
    const top = this.undoStack.at(-1);

    if (
      top &&
      !this.sealed &&
      input.mergeKey !== undefined &&
      top.mergeKey === input.mergeKey &&
      timestamp - top.timestamp <= (input.mergeWindowMs ?? this.mergeWindowMs)
    ) {
      top.changes.push(...input.changes);
      top.timestamp = timestamp;
      top.meta = { before: top.meta?.before, after: input.meta?.after };
    } else {
      this.undoStack.push({
        changes: [...input.changes],
        mergeKey: input.mergeKey,
        timestamp,
        meta: input.meta,
      });

      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }

    this.redoStack.length = 0;
    this.sealed = false;
  }

  seal(): void {
    this.sealed = true;
  }

  popUndo(): HistoryEntry | undefined {
    this.seal();
    return this.undoStack.pop();
  }

  popRedo(): HistoryEntry | undefined {
    this.seal();
    return this.redoStack.pop();
  }

  pushRedo(entry: HistoryEntry): void {
    this.redoStack.push(entry);
  }

  pushUndo(entry: HistoryEntry): void {
    this.undoStack.push(entry);
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.sealed = true;
  }
}
