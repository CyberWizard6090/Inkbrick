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
   * Версия схемы каждого flavour на момент сохранения. Нет записи — версия 1: так читаются снимки, записанные
   * до появления поля; `serializeDocument` заполняет его всегда.
   * По ней при загрузке запускаются миграции props (`BlockSchema.migrate`).
   */
  schemaVersions?: Record<string, number>;
}
