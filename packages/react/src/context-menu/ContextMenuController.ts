import type { DocSelection } from '../editing/selection';

export interface ContextMenuState {
  /** Точка, где открыто меню (координаты окна), или `null` — меню закрыто. */
  readonly position: { readonly x: number; readonly y: number } | null;
  /** Выделение документа в момент открытия: фокус может уйти в меню, а действия выполняются над ним. */
  readonly selection: DocSelection | null;
}

const CLOSED: ContextMenuState = Object.freeze({ position: null, selection: null });

export class ContextMenuController {
  private state: ContextMenuState = CLOSED;

  private readonly listeners = new Set<() => void>();

  getState = (): ContextMenuState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  open(x: number, y: number, selection: DocSelection | null = null): void {
    this.set({ position: { x, y }, selection });
  }

  close(): void {
    if (this.state.position) this.set(CLOSED);
  }

  private set(state: ContextMenuState): void {
    this.state = state;

    for (const listener of [...this.listeners]) listener();
  }
}
