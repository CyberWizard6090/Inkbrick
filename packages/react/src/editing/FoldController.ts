import type { BlockId } from '@inkbrick/document';

/**
 * Какие блоки сейчас скрыты свёрнутыми заголовками и каким именно. Подписка идёт на уровне блока: при сворачивании
 * перерисовываются только блоки, у которых изменилось «скрыт или нет». Без сворачивания заголовков он всегда пуст.
 */
export class FoldController {
  private hidden: ReadonlyMap<BlockId, BlockId> = new Map();

  private hiders: ReadonlySet<BlockId> = new Set();

  private readonly listeners = new Map<BlockId, Set<() => void>>();

  private readonly all = new Set<() => void>();

  isHidden = (blockId: BlockId): boolean => this.hidden.has(blockId);

  /** Заголовок, который скрывает блок. */
  hiddenBy(blockId: BlockId): BlockId | undefined {
    return this.hidden.get(blockId);
  }

  /** Заголовок сейчас что-то скрывает. */
  isFolding(blockId: BlockId): boolean {
    return this.hiders.has(blockId);
  }

  get size(): number {
    return this.hidden.size;
  }

  subscribe = (blockId: BlockId) => {
    return (listener: () => void): (() => void) => {
      let set = this.listeners.get(blockId);

      if (!set) this.listeners.set(blockId, (set = new Set()));

      set.add(listener);

      return () => {
        set!.delete(listener);

        if (set!.size === 0 && this.listeners.get(blockId) === set) this.listeners.delete(blockId);
      };
    };
  };

  subscribeAll = (listener: () => void): (() => void) => {
    this.all.add(listener);

    return () => {
      this.all.delete(listener);
    };
  };

  set(next: ReadonlyMap<BlockId, BlockId>): void {
    const changed: BlockId[] = [];

    for (const [id, by] of next) if (this.hidden.get(id) !== by) changed.push(id);
    for (const id of this.hidden.keys()) if (!next.has(id)) changed.push(id);

    if (changed.length === 0) return;

    this.hidden = next;
    this.hiders = new Set(next.values());

    for (const id of changed)
      for (const listener of [...(this.listeners.get(id) ?? [])]) listener();
    for (const listener of [...this.all]) listener();
  }
}
