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
 *
 * Атомарность изменения: пока идёт `atomically(fn)`, writer запоминает прежнюю версию каждого блока, который
 * записывает. Если `fn` бросает исключение на полпути (недопустимая вставка, ошибка колбэка `meta.user` / `meta.now`),
 * все уже сделанные записи откатываются, и документ остаётся ровно таким, каким был до изменения.
 */
export class DocumentWriter {
  /** Прежние версии блоков, записанных текущим `atomically` (`undefined` — блока не было). */
  private journal: Map<BlockId, BaseBlock | undefined> | null = null;

  constructor(
    private readonly document: Document,
    private readonly meta?: BlockMetaOptions,
  ) {}

  /**
   * Выполняет `fn` атомарно: либо все её записи остаются, либо (при исключении) ни одной — исключение пробрасывается
   * дальше. Вложенный вызов входит во внешний.
   */
  atomically(fn: () => void): void {
    if (this.journal) return fn();

    const journal = new Map<BlockId, BaseBlock | undefined>();

    this.journal = journal;

    try {
      fn();
    } catch (error) {
      for (const [id, previous] of [...journal].reverse()) {
        if (previous) this.document._setBlock(previous);
        else this.document._deleteBlock(id);
      }

      throw error;
    } finally {
      this.journal = null;
    }
  }

  /** Запоминает блоки до первой записи в них (только внутри `atomically`). */
  private remember(...ids: BlockId[]): void {
    if (!this.journal) return;

    for (const id of ids) {
      if (!this.journal.has(id)) this.journal.set(id, this.document.getBlock(id));
    }
  }

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
      this.remember(id);
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

      this.remember(id);
      this.document._setBlock(meta ? { ...rest, meta } : rest);
    }
  }

  getBlock(id: BlockId): BaseBlock | undefined {
    return this.document.getBlock(id);
  }

  setBlock(block: BaseBlock): void {
    this.remember(block.id);
    this.document._setBlock(block);
  }

  deleteBlock(id: BlockId): void {
    this.remember(id);
    this.document._deleteBlock(id);
  }

  insertChild(parentId: BlockId, index: number, childId: BlockId): void {
    this.remember(parentId);
    this.document._insertChild(parentId, index, childId);
  }

  removeChild(parentId: BlockId, childId: BlockId): void {
    this.remember(parentId);
    this.document._removeChild(parentId, childId);
  }

  removeChildren(parentId: BlockId, childIds: ReadonlySet<BlockId>): void {
    this.remember(parentId);
    this.document._removeChildren(parentId, childIds);
  }

  restoreChildren(parentId: BlockId, children: readonly BlockId[]): void {
    this.remember(parentId);
    this.document._restoreChildren(parentId, children);
  }

  moveChild(fromParent: BlockId, toParent: BlockId, childId: BlockId, index: number): void {
    this.remember(fromParent, toParent, childId);
    this.document._moveChild(fromParent, toParent, childId, index);
  }
}
