import type { BaseBlock, BlockId } from '../model';

/**
 * Хранилище блоков документа (плоская карта + дерево через children/parentId).
 *
 * Публичное API — только чтение. Мутации (`_`-методы) предназначены для
 * `@inkbrick/store` (DocumentWriter) и не должны вызываться напрямую из UI.
 */
export class Document {
  private readonly blocks = new Map<BlockId, BaseBlock>();

  constructor(public readonly rootId: BlockId) {}

  getBlock(id: BlockId): BaseBlock | undefined {
    return this.blocks.get(id);
  }

  hasBlock(id: BlockId): boolean {
    return this.blocks.has(id);
  }

  getChildren(parentId: BlockId): BaseBlock[] {
    const parent = this.getBlock(parentId);
    if (!parent) return [];

    return parent.children
      .map((id) => this.getBlock(id))
      .filter((block): block is BaseBlock => block !== undefined);
  }

  getNextSibling(blockId: BlockId): BaseBlock | undefined {
    const siblings = this.getSiblings(blockId);
    if (!siblings) return undefined;

    const { parent, index } = siblings;
    if (index === -1 || index + 1 >= parent.children.length) return undefined;

    return this.getBlock(parent.children[index + 1]);
  }

  getPreviousSibling(blockId: BlockId): BaseBlock | undefined {
    const siblings = this.getSiblings(blockId);
    if (!siblings) return undefined;

    const { parent, index } = siblings;
    if (index <= 0) return undefined;

    return this.getBlock(parent.children[index - 1]);
  }

  dump(): Record<BlockId, BaseBlock> {
    return Object.fromEntries(this.blocks);
  }

  _setBlock(block: BaseBlock): void {
    this.blocks.set(block.id, block);
  }

  _replaceBlock(block: BaseBlock): void {
    this.blocks.set(block.id, block);
  }

  _deleteBlock(id: BlockId): void {
    this.blocks.delete(id);
  }

  /**
   * Добавляет ссылку на потомка. Инварианты дерева: блок числится ровно в одном родителе, его `parentId`
   * указывает на этого родителя, и блок не может стать потомком самого себя.
   */
  _insertChild(parentId: BlockId, index: number, childId: BlockId): void {
    const parent = this.requireBlock(parentId);

    if (parent.children.includes(childId)) {
      throw new Error(`Block "${childId}" is already a child of "${parentId}"`);
    }

    const child = this.blocks.get(childId);

    if (child && child.parentId !== parentId) {
      throw new Error(
        `Block "${childId}" belongs to "${String(child.parentId)}", not "${parentId}": move it instead`,
      );
    }

    for (let id: BlockId | null = parentId; id; id = this.blocks.get(id)?.parentId ?? null) {
      if (id === childId) throw new Error(`Block "${childId}" cannot be placed inside itself`);
    }

    const safeIndex = Math.max(0, Math.min(index, parent.children.length));

    /*
     * Новый объект: React/useSyncExternalStore сравнивает ссылки, поэтому
     * мутировать массив children на месте нельзя.
     */
    this._replaceBlock({
      ...parent,
      children: [
        ...parent.children.slice(0, safeIndex),
        childId,
        ...parent.children.slice(safeIndex),
      ],
    });
  }

  _removeChild(parentId: BlockId, childId: BlockId): void {
    const parent = this.requireBlock(parentId);

    this._replaceBlock({
      ...parent,
      children: parent.children.filter((id) => id !== childId),
    });
  }

  _moveChild(fromParent: BlockId, toParent: BlockId, childId: BlockId, index: number): void {
    const child = this.requireBlock(childId);
    const fromIndex = this.requireBlock(fromParent).children.indexOf(childId);

    this._removeChild(fromParent, childId);
    // parentId меняется до вставки: _insertChild проверяет, что блок принадлежит новому родителю.
    this._replaceBlock({ ...child, parentId: toParent });

    try {
      this._insertChild(toParent, index, childId);
    } catch (error) {
      // Недопустимый перенос (например, в собственного потомка) не должен оставить блок без родителя.
      this._replaceBlock(child);
      if (fromIndex !== -1) this._insertChild(fromParent, fromIndex, childId);
      throw error;
    }
  }

  private requireBlock(id: BlockId): BaseBlock {
    const block = this.blocks.get(id);
    if (!block) throw new Error(`Block "${id}" not found`);
    return block;
  }

  private getSiblings(blockId: BlockId): { parent: BaseBlock; index: number } | undefined {
    const block = this.getBlock(blockId);
    if (!block?.parentId) return undefined;

    const parent = this.getBlock(block.parentId);
    if (!parent) return undefined;

    return { parent, index: parent.children.indexOf(blockId) };
  }
}
