import { BaseBlock } from './BaseBlock';
import { BlockId } from './BlockId';

export interface DocumentSnapshot {
  rootId: BlockId;

  blocks: Record<BlockId, BaseBlock>;

  /**
   * Версия схемы каждого flavour на момент сохранения (нет записи — версия 1).
   * По ней при загрузке запускаются миграции props (`BlockSchema.migrate`).
   */
  schemaVersions?: Record<string, number>;
}
