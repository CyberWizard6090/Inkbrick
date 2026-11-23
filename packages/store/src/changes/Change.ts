import type { BlockId } from '@inkbrick/document';
import type { DocumentWriter } from '../writer';

/**
 * Атомарное изменение документа. `apply` запоминает всё необходимое для
 * `revert`, поэтому транзакцию можно откатить (и позже построить undo/redo).
 */
export interface Change {
  /**
   * Применяет изменение. Контракт атомарности: изменение либо применилось полностью, либо бросило исключение и
   * документ не изменился. Транзакция обеспечивает это сама (`DocumentWriter.atomically`), если изменение пишет в
   * документ только через `writer`.
   */
  apply(writer: DocumentWriter): void;

  /** Отменяет ранее выполненный `apply`. Вызывается в обратном порядке. */
  revert(writer: DocumentWriter): void;

  getAffectedBlocks(): readonly BlockId[];
}
