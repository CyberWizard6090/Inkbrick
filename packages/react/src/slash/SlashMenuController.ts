export interface SlashMenuState {
  readonly open: boolean;
  readonly blockId: string | null;
  readonly slashOffset: number;
  readonly query: string;
  readonly activeIndex: number;
  readonly position: { readonly x: number; readonly y: number } | null;
}

const CLOSED: SlashMenuState = Object.freeze({
  open: false,
  blockId: null,
  slashOffset: 0,
  query: '',
  activeIndex: 0,
  position: null,
});

export class SlashMenuController {
  private state: SlashMenuState = CLOSED;

  private readonly listeners = new Set<() => void>();

  getState = (): SlashMenuState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  open(blockId: string, slashOffset: number): void {
    this.set({ ...CLOSED, open: true, blockId, slashOffset });
  }

  close(): void {
    if (this.state.open) this.set(CLOSED);
  }

  update(patch: Partial<Pick<SlashMenuState, 'query' | 'activeIndex' | 'position'>>): void {
    if (!this.state.open) return;

    const next = { ...this.state, ...patch };
    const same =
      next.query === this.state.query &&
      next.activeIndex === this.state.activeIndex &&
      next.position?.x === this.state.position?.x &&
      next.position?.y === this.state.position?.y;

    if (!same) this.set(next);
  }

  move(delta: number, count: number): void {
    if (!this.state.open || count === 0) return;

    this.update({ activeIndex: (this.state.activeIndex + delta + count) % count });
  }

  private set(state: SlashMenuState): void {
    this.state = state;

    for (const listener of [...this.listeners]) listener();
  }
}
