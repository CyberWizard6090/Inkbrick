import type { BaseBlock, BlockId, BlockMeta, Document } from '@inkbrick/document';

/** `meta` блоков до структурной правки: по ним откат восстанавливает их значения. */
export type SavedMeta = Map<BlockId, BlockMeta | undefined>;

export interface BlockMetaOptions {
  user?: () => string | undefined;
  now?: () => number;
}

/**
 * Единственная точка записи в Document. Используется Change-объектами
 * внутри транзакции; наружу (в UI) не экспортируется.
 */
export class DocumentWriter {
  constructor(
    private readonly document: Document,
    private readonly meta?: BlockMetaOptions,
  ) {}

  /**
   * Возвращает блок с обновлёнными `meta` (если опция включена): `createdAt/By` берутся у предыдущей версии
   * блока, `updatedAt/By` — текущие. Вызывается только при прямом применении изменения: откат (undo)
   * восстанавливает прежний блок вместе с его `meta`.
   */
  stamp(block: BaseBlock, previous?: BaseBlock): BaseBlock {
    if (!this.meta) return block;

    const now = (this.meta.now ?? Date.now)();
    const user = this.meta.user?.();
    const created = previous?.meta ?? block.meta;
    const meta: BlockMeta = {
      createdAt: created?.createdAt ?? now,
      ...(created?.createdBy !== undefined || user !== undefined
        ? { createdBy: created?.createdBy ?? user }
        : {}),
      updatedAt: now,
      ...(user !== undefined ? { updatedBy: user } : {}),
    };

    return { ...block, meta };
  }

  /**
   * Структурные правки (вставка, удаление, перенос потомка) тоже меняют блоки: у родителей — `children`, у
   * перенесённого блока — `parentId`. `touch` отмечает их `updatedAt/By` и возвращает прежние `meta` для отката;
   * без опции `meta` ничего не делает.
   */
  touch(ids: readonly BlockId[]): SavedMeta | undefined {
    if (!this.meta) return undefined;

    const saved: SavedMeta = new Map();

    for (const id of new Set(ids)) {
      const block = this.document.getBlock(id);

      if (!block) continue;

      saved.set(id, block.meta);
      this.document._setBlock(this.stamp(block, block));
    }

    return saved;
  }

  restoreMeta(saved: SavedMeta | undefined): void {
    if (!saved) return;

    for (const [id, meta] of saved) {
      const block = this.document.getBlock(id);

      if (!block) continue;

      const { meta: _current, ...rest } = block;

      this.document._setBlock(meta ? { ...rest, meta } : rest);
    }
  }

  getBlock(id: BlockId): BaseBlock | undefined {
    return this.document.getBlock(id);
  }

  setBlock(block: BaseBlock): void {
    this.document._setBlock(block);
  }

  deleteBlock(id: BlockId): void {
    this.document._deleteBlock(id);
  }

  insertChild(parentId: BlockId, index: number, childId: BlockId): void {
    this.document._insertChild(parentId, index, childId);
  }

  removeChild(parentId: BlockId, childId: BlockId): void {
    this.document._removeChild(parentId, childId);
  }

  moveChild(fromParent: BlockId, toParent: BlockId, childId: BlockId, index: number): void {
    this.document._moveChild(fromParent, toParent, childId, index);
  }
}
