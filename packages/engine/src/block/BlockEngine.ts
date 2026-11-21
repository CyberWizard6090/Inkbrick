import {
  createId,
  MAX_NESTING_DEPTH,
  type BaseBlock,
  type BlockId,
  type BlockProps,
  type BlockTemplate,
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

  /**
   * Создаёт начальных потомков блока по `BlockSchema.scaffold` (таблица 3×3), если у блока их ещё нет.
   * Вызывается там, где блок создаёт пользователь; возвращает, появились ли потомки.
   */
  scaffold(tx: Transaction, id: BlockId): boolean {
    const block = this.require(tx, id);
    const templates = this.schema.getBlockSchema(block.flavour)?.scaffold?.(block.props) ?? [];

    if (block.children.length > 0 || templates.length === 0) return false;

    this.build(tx, id, templates);

    return true;
  }

  /** Вставляет блоки по заготовкам в конец `parentId`. */
  build(tx: Transaction, parentId: BlockId, templates: readonly BlockTemplate[]): BlockId[] {
    return templates.map((template) => {
      const block = this.create({ flavour: template.flavour, parentId, props: template.props });

      this.insert(tx, parentId, this.require(tx, parentId).children.length, block);
      this.build(tx, block.id, template.children ?? []);

      return block.id;
    });
  }

  update(tx: Transaction, id: BlockId, updater: (block: BaseBlock) => BaseBlock): void {
    const block = this.require(tx, id);
    const updated = updater(block);

    // Блок не изменился — изменения нет: иначе в истории остался бы пустой шаг, и Ctrl+Z «ничего не делал».
    if (sameValue(updated, block)) return;

    tx.apply(new SetBlockChange(updated));
  }

  updateContent(tx: Transaction, id: BlockId, content: BaseBlock['content']): void {
    const block = this.require(tx, id);

    if (sameValue(content, block.content)) return;

    tx.apply(new UpdateBlockChange(id, { content }));
  }

  /**
   * Меняет тип блока. Потомки, которых новый тип не допускает (например, вложенный список
   * у пункта, ставшего параграфом), поднимаются на уровень блока — сразу после него, в прежнем порядке.
   * Если потомок не подходит ни новому типу, ни родителю блока, бросает ошибку.
   */
  morph(tx: Transaction, id: BlockId, flavour: string, props?: BlockProps): void {
    const block = this.require(tx, id);
    const parent = block.parentId ? this.require(tx, block.parentId) : undefined;

    if (parent && !this.schema.validateRelation(parent.flavour, flavour)) {
      throw new Error(`"${flavour}" cannot be placed inside "${parent.flavour}"`);
    }

    const misfits = block.children.filter((childId) => {
      const child = tx.getBlock(childId);

      return (
        !!child &&
        this.schema.hasBlock(child.flavour) &&
        !this.schema.validateRelation(flavour, child.flavour)
      );
    });

    if (misfits.length > 0) {
      if (!parent) {
        throw new Error(`"${flavour}" cannot contain the children of "${id}"`);
      }

      for (const childId of misfits) {
        const child = tx.getBlock(childId)!;

        if (!this.schema.validateRelation(parent.flavour, child.flavour)) {
          throw new Error(`"${child.flavour}" fits neither "${flavour}" nor "${parent.flavour}"`);
        }
      }

      misfits.forEach((childId, placed) => {
        const siblings = tx.getBlock(parent.id)!.children;
        this.move(tx, childId, parent.id, siblings.indexOf(id) + 1 + placed);
      });
    }

    const next = this.schema.createProps(flavour, props);

    if (flavour === block.flavour && sameValue(next, block.props)) return;

    tx.apply(new UpdateBlockChange(id, { flavour, props: next }));
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

/** Равенство JSON-значений блока (props, содержимое) без учёта порядка ключей; `undefined` в объекте — как отсутствие ключа. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    const list = b as unknown[];

    return a.length === list.length && a.every((item, index) => sameValue(item, list[index]));
  }

  const keys = (value: object) =>
    Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined);
  const left = keys(a);
  const right = keys(b);

  return (
    left.length === right.length &&
    left.every((key) =>
      sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}
