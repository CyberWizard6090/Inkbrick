/**
 * Выбранные блоки целиком (Esc в блоке, Shift+стрелки, рамка мышью, Ctrl/Cmd+клик по ручке): соседи одного родителя,
 * подряд или вразброс. Это не выделение текста: действия (удалить, дублировать, перенести, копировать) применяются
 * к блокам, а не к символам.
 */
export interface PickedState {
  /** Блоки в порядке документа. */
  readonly ids: readonly string[];
  /** Блок, с которого начали (остаётся на месте при расширении). */
  readonly anchor: string | null;
  /** Блок, который расширяют стрелками (подвижный край). */
  readonly focus: string | null;
}

const NONE: PickedState = { ids: [], anchor: null, focus: null };

export class PickedBlocksController {
  private state: PickedState = NONE;

  private ids: ReadonlySet<string> = new Set();

  private readonly listeners = new Set<() => void>();

  /** Вызывается после каждого изменения, до слушателей: ставит `data-picked` на нарисованные блоки одним проходом. */
  constructor(private readonly onChange: () => void = () => {}) {}

  getState = (): PickedState => this.state;

  has = (blockId: string): boolean => this.ids.has(blockId);

  get size(): number {
    return this.state.ids.length;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  set(
    ids: readonly string[],
    anchor: string | null = ids[0] ?? null,
    focus = ids.at(-1) ?? null,
  ): void {
    const same =
      ids.length === this.state.ids.length &&
      ids.every((id, index) => id === this.state.ids[index]) &&
      anchor === this.state.anchor &&
      focus === this.state.focus;

    if (same) return;

    this.state = ids.length === 0 ? NONE : { ids, anchor, focus };
    this.ids = new Set(ids);

    this.onChange();

    for (const listener of [...this.listeners]) listener();
  }

  clear(): void {
    if (this.state.ids.length > 0) this.set([]);
  }
}
