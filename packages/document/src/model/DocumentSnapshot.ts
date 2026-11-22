import { BaseBlock } from './BaseBlock';
import { BlockId } from './BlockId';

/** Версия формата самого снимка (конверта `{ rootId, blocks, … }`); нет поля — версия 1. */
export const SNAPSHOT_VERSION = 1;

export interface DocumentSnapshot {
  /** Версия формата снимка. Снимок новее поддерживаемого `validateSnapshot` отклоняет. */
  version?: number;

  rootId: BlockId;

  blocks: Record<BlockId, BaseBlock>;

  /**
   * Версия схемы каждого flavour на момент сохранения. Главная — версия у самого блока (`BaseBlock.version`); эта
   * запись нужна снимкам, записанным до неё. Нет ни той, ни другой — версия 1. `serializeDocument` заполняет обе.
   */
  schemaVersions?: Record<string, number>;
}
