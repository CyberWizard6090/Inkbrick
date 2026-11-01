import {
  createId,
  MAX_NESTING_DEPTH,
  type BaseBlock,
  type BlockId,
  type BlockProps,
  type SchemaRegistry,
} from '@inkbrick/document';
import {
  DeleteBlockChange,
  InsertChildChange,
  MoveChildChange,
  RemoveChildChange,
  SetBlockChange,
  UpdateBlockChange,
  type Transaction,
} from '@inkbrick/store';

export interface CreateBlockOptions {
  flavour: string;
  parentId: BlockId | null;
  props?: BlockProps;
  content?: BaseBlock['content'];
}

export class BlockEngine {
  constructor(private readonly schema: SchemaRegistry) {}

  /** Создаёт (но не вставляет) блок; props дополняются значениями по умолчанию из схемы. */
  create(options: CreateBlockOptions): BaseBlock {
    return {
      id: `${options.flavour.replace('block:', '')}-${createId()}`,
      flavour: options.flavour,
      parentId: options.parentId,
      children: [],
      content: options.content ?? [],
      props: this.schema.createProps(options.flavour, options.props),
    };
  }

  insert(tx: Transaction, parentId: BlockId, index: number, block: BaseBlock): void {
    if (!tx.getBlock(parentId)) {
      throw new Error(`Block "${parentId}" not found`);
    }

    if (!this.schema.validateRelation(tx.getBlock(parentId)!.flavour, block.flavour)) {
      throw new Error(
        `"${block.flavour}" cannot be placed inside "${tx.getBlock(parentId)!.flavour}"`,
      );
    }

    tx.apply(new SetBlockChange({ ...block, parentId }));
    tx.apply(new InsertChildChange(parentId, index, block.id));
  }

  update(tx: Transaction, id: BlockId, updater: (block: BaseBlock) => BaseBlock): void {
    const block = this.require(tx, id);
    const updated = updater(block);

    tx.apply(new SetBlockChange(updated));
  }

  updateContent(tx: Transaction, id: BlockId, content: BaseBlock['content']): void {
    this.require(tx, id);
    tx.apply(new UpdateBlockChange(id, { content }));
  }

  morph(tx: Transaction, id: BlockId, flavour: string, props?: BlockProps): void {
    const block = this.require(tx, id);

    if (block.parentId) {
      const parent = this.require(tx, block.parentId);

      if (!this.schema.validateRelation(parent.flavour, flavour)) {
        throw new Error(`"${flavour}" cannot be placed inside "${parent.flavour}"`);
      }
    }

    tx.apply(
      new UpdateBlockChange(id, { flavour, props: this.schema.createProps(flavour, props) }),
    );
  }

  remove(tx: Transaction, id: BlockId): void {
    const block = this.require(tx, id);

    if (block.parentId) {
      tx.apply(new RemoveChildChange(block.parentId, id));
    }

    this.deleteSubtree(tx, id);
  }

  move(tx: Transaction, id: BlockId, parentId: BlockId, index: number): void {
    const block = this.require(tx, id);
    this.require(tx, parentId);

    if (!block.parentId) {
      throw new Error(`Block "${id}" has no parent and cannot be moved`);
    }

    if (this.isDescendant(tx, parentId, id)) {
      throw new Error(`Cannot move block "${id}" into its own descendant "${parentId}"`);
    }

    if (!this.fitsDepth(tx, parentId, id)) {
      throw new Error(
        `Moving "${id}" into "${parentId}" exceeds the nesting limit (${MAX_NESTING_DEPTH})`,
      );
    }

    const target = tx.getBlock(parentId)!;

    if (
      this.schema.hasBlock(block.flavour) &&
      this.schema.hasBlock(target.flavour) &&
      !this.schema.validateRelation(target.flavour, block.flavour)
    ) {
      throw new Error(`"${block.flavour}" cannot be placed inside "${target.flavour}"`);
    }

    tx.apply(new MoveChildChange(block.parentId, parentId, id, index));
  }

  /**
   * Поместится ли блок `id` вместе со всем поддеревом внутрь `parentId`, не превысив `MAX_NESTING_DEPTH`.
   * Перенос, который не углубляет блок (Shift+Tab, перенос выше), разрешён всегда — даже в документе,
   * который уже глубже предела (например, загружен извне).
   */
  fitsDepth(tx: Transaction, parentId: BlockId, id: BlockId): boolean {
    const depthOf = (blockId: BlockId | null | undefined) => {
      let depth = 0;

      // Ограничение в условии цикла заодно защищает от зацикленного (повреждённого) дерева.
      for (
        let current = blockId ? tx.getBlock(blockId) : undefined;
        current?.parentId && depth <= MAX_NESTING_DEPTH;
        current = tx.getBlock(current.parentId)
      ) {
        depth++;
      }

      return depth;
    };
    const depth = depthOf(parentId);

    if (depth <= depthOf(tx.getBlock(id)?.parentId)) return true;

    // Высота поддерева переносимого блока (сам блок — уровень 1), обход по уровням без рекурсии.
    let height = 0;
    let level: BlockId[] = [id];

    while (level.length > 0 && depth + height <= MAX_NESTING_DEPTH) {
      height++;
      level = level.flatMap((blockId) => tx.getBlock(blockId)?.children ?? []);
    }

    return depth + height <= MAX_NESTING_DEPTH;
  }

  private deleteSubtree(tx: Transaction, id: BlockId): void {
    const block = tx.getBlock(id);
    if (!block) return;

    for (const childId of block.children) {
      this.deleteSubtree(tx, childId);
    }

    tx.apply(new DeleteBlockChange(id));
  }

  private isDescendant(tx: Transaction, candidateId: BlockId, ancestorId: BlockId): boolean {
    let current = tx.getBlock(candidateId);

    while (current) {
      if (current.id === ancestorId) return true;
      current = current.parentId ? tx.getBlock(current.parentId) : undefined;
    }

    return false;
  }

  private require(tx: Transaction, id: BlockId): BaseBlock {
    const block = tx.getBlock(id);

    if (!block) {
      throw new Error(`Block "${id}" not found`);
    }

    return block;
  }
}
