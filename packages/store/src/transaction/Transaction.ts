import type { BaseBlock, BlockId } from '@inkbrick/document';

import type { DocumentWriter } from '../writer';
import type { Change } from '../changes';

type TransactionState = 'open' | 'committed' | 'rolledBack';

/**
 * Группа изменений, применяемых атомарно. Все записи в документ идут только
 * через `apply(change)`, поэтому store точно знает, какие блоки изменились.
 */
export class Transaction {
  private readonly changes: Change[] = [];

  private readonly changedBlocks = new Set<BlockId>();

  private state: TransactionState = 'open';

  constructor(
    private readonly writer: DocumentWriter,
    private readonly onCommit: (transaction: Transaction) => void,
  ) {}

  apply(change: Change): void {
    this.assertOpen('apply a change to');

    change.apply(this.writer);

    this.changes.push(change);

    for (const id of change.getAffectedBlocks()) {
      this.changedBlocks.add(id);
    }
  }

  getBlock(id: BlockId): BaseBlock | undefined {
    return this.writer.getBlock(id);
  }

  getChanges(): readonly Change[] {
    return this.changes;
  }

  getChangedBlocks(): readonly BlockId[] {
    return [...this.changedBlocks];
  }

  get isEmpty(): boolean {
    return this.changes.length === 0;
  }

  /**
   * Закрывает транзакцию: изменения остаются применёнными, store записывает историю и уведомляет подписчиков.
   * После коммита откат невозможен; ошибки подписчиков сюда не доходят (их изолирует store).
   */
  commit(): void {
    this.assertOpen('commit');

    this.state = 'committed';

    this.onCommit(this);
  }

  rollback(): void {
    this.assertOpen('roll back');

    this.state = 'rolledBack';

    for (let i = this.changes.length - 1; i >= 0; i--) {
      this.changes[i].revert(this.writer);
    }

    this.changes.length = 0;
    this.changedBlocks.clear();
  }

  private assertOpen(action: string): void {
    if (this.state !== 'open') {
      throw new Error(`Cannot ${action} a ${this.state} transaction`);
    }
  }
}
