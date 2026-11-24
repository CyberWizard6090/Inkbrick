/**
 * Какие блоки сейчас затронуты непустым выделением. Подписка идёт на уровне отдельного блока:
 * при смене выделения перерисовываются только те блоки, у которых флаг `selected` изменился.
 */
export class BlockSelectionController {
  private selected: ReadonlySet<string> = new Set();

  private readonly listeners = new Set<() => void>();

  isSelected = (blockId: string): boolean => this.selected.has(blockId);

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  set(ids: readonly string[]): void {
    if (ids.length === this.selected.size && ids.every((id) => this.selected.has(id))) return;

    this.selected = new Set(ids);

    for (const listener of [...this.listeners]) listener();
  }
}
