import type { BlockId } from '@inkbrick/document';
import type { DocumentWriter } from '../writer';

/**
 * Атомарное изменение документа. `apply` запоминает всё необходимое для
 * `revert`, поэтому транзакцию можно откатить (и позже построить undo/redo).
 */
export interface Change {
  apply(writer: DocumentWriter): void;

  /** Отменяет ранее выполненный `apply`. Вызывается в обратном порядке. */
  revert(writer: DocumentWriter): void;

  getAffectedBlocks(): readonly BlockId[];
}
