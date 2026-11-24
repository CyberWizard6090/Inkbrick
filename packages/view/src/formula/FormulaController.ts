export type FormulaEditorMode = 'insert' | 'edit';

export interface FormulaEditorState {
  readonly open: boolean;
  readonly mode: FormulaEditorMode;
  readonly blockId: string;
  readonly from: number;
  readonly to: number;
  readonly latex: string;
  readonly position: { readonly x: number; readonly y: number; readonly top: number };
}

const CLOSED: FormulaEditorState = Object.freeze({
  open: false,
  mode: 'insert',
  blockId: '',
  from: 0,
  to: 0,
  latex: '',
  position: { x: 0, y: 0, top: 0 },
});

export class FormulaController {
  private state: FormulaEditorState = CLOSED;

  private readonly listeners = new Set<() => void>();

  getState = (): FormulaEditorState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  open(state: Omit<FormulaEditorState, 'open'>): void {
    this.set({ ...state, open: true });
  }

  close(): void {
    if (this.state.open) this.set(CLOSED);
  }

  private set(state: FormulaEditorState): void {
    this.state = state;

    for (const listener of [...this.listeners]) listener();
  }
}
