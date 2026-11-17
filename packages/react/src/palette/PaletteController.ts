import type { EditorView } from '../editing/EditorView';
import { readDocSelection, type DocSelection } from '../editing/selection';

export interface PaletteState {
  readonly open: boolean;
  /** Выделение в документе в момент открытия: после закрытия фокус и выделение возвращаются на него. */
  readonly selection: DocSelection | null;
  /** Растёт при каждом открытии: палитра по нему очищает запрос и переносит фокус в строку ввода. */
  readonly nonce: number;
}

const IDLE: PaletteState = { open: false, selection: null, nonce: 0 };

/** Состояние палитры команд одного редактора: открыта ли она и какое выделение было до открытия. */
export class PaletteController {
  private state: PaletteState = IDLE;

  private readonly listeners = new Set<() => void>();

  constructor(private readonly view: EditorView) {}

  getState = (): PaletteState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  };

  open(): void {
    const root = this.view.getRoot();

    this.set({
      open: true,
      selection: root ? readDocSelection(root) : null,
      nonce: this.state.nonce + 1,
    });
  }

  close(): void {
    if (this.state.open) this.set({ ...this.state, open: false });
  }

  toggle(): void {
    if (this.state.open) this.close();
    else this.open();
  }

  /** Закрывает палитру и возвращает выделение в документ. */
  closeAndRestore(): void {
    const { selection } = this.state;

    this.close();
    if (selection) this.view.placeSelection(selection.from, selection.to);
  }

  private set(state: PaletteState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

const controllers = new WeakMap<EditorView, PaletteController>();

export function getPaletteController(view: EditorView): PaletteController {
  let controller = controllers.get(view);

  if (!controller) {
    controller = new PaletteController(view);
    controllers.set(view, controller);
  }

  return controller;
}
