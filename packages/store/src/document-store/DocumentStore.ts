import type { BaseBlock, BlockId, Document } from '@inkbrick/document';

import { History, type HistoryMeta, type HistoryEntry, type HistoryOptions } from '../history';
import { DocumentWriter, type BlockMetaOptions } from '../writer';
import { Transaction } from '../transaction';

export type StoreListener = () => void;

export type ChangeListener = (blockIds: readonly BlockId[]) => void;

/**
 * Ошибка подписчика не должна ни прерывать уведомление остальных, ни превращать уже применённое изменение
 * в «неуспешное»: она сообщается отдельно, как необработанная ошибка (видна в консоли и в window.onerror).
 */
function reportListenerError(error: unknown): void {
  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(error);
    return;
  }

  queueMicrotask(() => {
    throw error;
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export interface TransactOptions<TResult> {
  /** Однотипные правки с одним ключом в пределах окна сливаются в один шаг undo. */
  mergeKey?: string;
  /** false — изменение не попадает в историю (программная инициализация, синхронизация). */
  history?: boolean;
  /** Данные шага (например, курсор до/после); вызывается после успешного выполнения. */
  describe?: (result: TResult) => HistoryMeta | undefined;
}

export interface HistoryStep {
  meta?: HistoryMeta;
}

export interface DocumentStoreOptions {
  history?: HistoryOptions;
  /**
   * Заполнять `BaseBlock.meta` (кто и когда создал/изменил блок). `true` — только время;
   * объект — ещё и автор (`user`). Выключено по умолчанию.
   */
  meta?: boolean | BlockMetaOptions;
}

export class DocumentStore {
  private readonly listeners = new Set<StoreListener>();

  private readonly blockListeners = new Map<BlockId, Set<StoreListener>>();

  private readonly changeListeners = new Set<ChangeListener>();

  private readonly writer: DocumentWriter;

  private readonly history: History;

  private version = 0;

  private historyVersion = 0;

  constructor(
    public readonly document: Document,
    options: DocumentStoreOptions = {},
  ) {
    this.writer = new DocumentWriter(
      document,
      options.meta === true ? {} : options.meta || undefined,
    );
    this.history = new History(options.history);
  }

  getVersion(): number {
    return this.version;
  }

  getHistoryVersion(): number {
    return this.historyVersion;
  }

  getBlock(id: BlockId): BaseBlock | undefined {
    return this.document.getBlock(id);
  }

  getChildren(parentId: BlockId): BaseBlock[] {
    return this.document.getChildren(parentId);
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeBlock(id: BlockId, listener: StoreListener): () => void {
    let listeners = this.blockListeners.get(id);

    if (!listeners) {
      listeners = new Set();
      this.blockListeners.set(id, listeners);
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0 && this.blockListeners.get(id) === listeners) {
        this.blockListeners.delete(id);
      }
    };
  }

  /**
   * Подписка на изменённые блоки (например, для хуков жизненного цикла блоков). Вызывается после коммита,
   * undo и redo — когда история уже записана и подписчики `subscribe` уведомлены, поэтому подписчик может
   * сам выполнять новые правки (они станут отдельным шагом истории).
   */
  subscribeChanges(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);

    return () => {
      this.changeListeners.delete(listener);
    };
  }

  createTransaction(
    options: { mergeKey?: string; history?: boolean; meta?: HistoryMeta } = {},
  ): Transaction {
    return new Transaction(this.writer, (transaction) => this.commit(transaction, options));
  }

  /**
   * Выполняет `fn` в транзакции. Исключение в `fn` (или в `describe`) откатывает все изменения и пробрасывается
   * дальше; иначе транзакция коммитится. Коммит не бросает: ошибки подписчиков сообщаются отдельно и на результат
   * не влияют — изменение уже применено и записано в историю.
   *
   * `fn` должна быть синхронной: транзакция закрывается сразу после её возврата, и изменения после `await`
   * в неё бы не попали. Promise в качестве результата отклоняется (с откатом).
   */
  transact<T>(fn: (transaction: Transaction) => T, options: TransactOptions<T> = {}): T {
    const commitOptions: { mergeKey?: string; history?: boolean; meta?: HistoryMeta } = {
      mergeKey: options.mergeKey,
      history: options.history,
    };
    const transaction = this.createTransaction(commitOptions);
    let result: T;

    try {
      result = fn(transaction);

      if (isThenable(result)) {
        throw new TypeError(
          'transact()/batch() callback must be synchronous: changes made after an await would escape the transaction',
        );
      }

      commitOptions.meta = options.describe?.(result);
    } catch (error) {
      transaction.rollback();
      throw error;
    }

    transaction.commit();

    return result;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  undo(): HistoryStep | undefined {
    const entry = this.history.popUndo();

    if (!entry) return undefined;

    const affected = this.replay(entry, 'undo');
    this.history.pushRedo(entry);
    this.touchHistory();
    this.emitChanges(affected);

    return { meta: entry.meta };
  }

  redo(): HistoryStep | undefined {
    const entry = this.history.popRedo();

    if (!entry) return undefined;

    const affected = this.replay(entry, 'redo');
    this.history.pushUndo(entry);
    this.touchHistory();
    this.emitChanges(affected);

    return { meta: entry.meta };
  }

  sealHistory(): void {
    this.history.seal();
  }

  clearHistory(): void {
    this.history.clear();
    this.touchHistory();
  }

  private replay(entry: HistoryEntry, direction: 'undo' | 'redo'): readonly BlockId[] {
    const affected = new Set<BlockId>();

    try {
      if (direction === 'undo') {
        for (let i = entry.changes.length - 1; i >= 0; i--) {
          entry.changes[i].revert(this.writer);
        }
      } else {
        for (const change of entry.changes) {
          change.apply(this.writer);
        }
      }
    } catch (error) {
      // Документ мог измениться вне истории — дальнейшие шаги недостоверны.
      this.history.clear();
      this.touchHistory();
      throw error;
    } finally {
      for (const change of entry.changes) {
        for (const id of change.getAffectedBlocks()) affected.add(id);
      }

      this.version++;

      for (const id of affected) this.notifyBlock(id);

      this.notify();
    }

    return [...affected];
  }

  private commit(
    transaction: Transaction,
    options: { mergeKey?: string; history?: boolean; meta?: HistoryMeta },
  ): void {
    if (transaction.isEmpty) {
      return;
    }

    this.version++;

    if (options.history !== false) {
      this.history.record({
        changes: transaction.getChanges(),
        mergeKey: options.mergeKey,
        meta: options.meta,
      });
      this.historyVersion++;
    }

    const changed = transaction.getChangedBlocks();

    for (const id of changed) {
      this.notifyBlock(id);
    }

    this.notify();
    this.emitChanges(changed);
  }

  private emitChanges(blockIds: readonly BlockId[]): void {
    if (this.changeListeners.size === 0 || blockIds.length === 0) return;

    for (const listener of [...this.changeListeners]) {
      try {
        listener(blockIds);
      } catch (error) {
        reportListenerError(error);
      }
    }
  }

  private touchHistory(): void {
    this.historyVersion++;
    this.notify();
  }

  private notify(): void {
    this.call(this.listeners);
  }

  private notifyBlock(id: BlockId): void {
    const listeners = this.blockListeners.get(id);

    if (listeners) this.call(listeners);
  }

  private call(listeners: ReadonlySet<StoreListener>): void {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        reportListenerError(error);
      }
    }
  }
}
