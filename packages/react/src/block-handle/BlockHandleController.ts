export type DropPosition = 'before' | 'after';

export interface BlockAnchor {
  readonly blockId: string;
  readonly x: number;
  readonly y: number;
}

export interface DropIndicatorRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export interface DragState {
  readonly blockId: string;
  readonly targetId: string | null;
  readonly position: DropPosition | null;
  readonly indicator: DropIndicatorRect | null;
}

export interface BlockHandleState {
  readonly hover: BlockAnchor | null;
  readonly menu: BlockAnchor | null;
  readonly drag: DragState | null;
}

const IDLE: BlockHandleState = Object.freeze({ hover: null, menu: null, drag: null });

const sameAnchor = (a: BlockAnchor | null, b: BlockAnchor | null) =>
  a === b || (!!a && !!b && a.blockId === b.blockId && a.x === b.x && a.y === b.y);

export class BlockHandleController {
  private state: BlockHandleState = IDLE;

  private readonly listeners = new Set<() => void>();

  getState = (): BlockHandleState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  setHover(hover: BlockAnchor | null): void {
    if (!sameAnchor(this.state.hover, hover)) this.set({ ...this.state, hover });
  }

  openMenu(menu: BlockAnchor): void {
    this.set({ ...this.state, menu });
  }

  closeMenu(): void {
    if (this.state.menu) this.set({ ...this.state, menu: null });
  }

  startDrag(blockId: string): void {
    this.set({
      ...this.state,
      menu: null,
      drag: { blockId, targetId: null, position: null, indicator: null },
    });
  }

  updateDrag(patch: Partial<Omit<DragState, 'blockId'>>): void {
    const drag = this.state.drag;

    if (!drag) return;

    const next = { ...drag, ...patch };
    const same =
      next.targetId === drag.targetId &&
      next.position === drag.position &&
      next.indicator?.left === drag.indicator?.left &&
      next.indicator?.top === drag.indicator?.top &&
      next.indicator?.width === drag.indicator?.width;

    if (!same) this.set({ ...this.state, drag: next });
  }

  endDrag(): void {
    if (this.state.drag) this.set({ ...this.state, drag: null });
  }

  private set(state: BlockHandleState): void {
    this.state = state;

    for (const listener of [...this.listeners]) listener();
  }
}
