import type { RangeFormats } from '@inkbrick/engine';

import type { DocSelection } from '../editing/selection';
import type { ToolbarPanel } from './types';

export interface ToolbarState {
  readonly visible: boolean;
  readonly position: { readonly x: number; readonly y: number } | null;
  readonly formats: RangeFormats | null;
  readonly range: DocSelection | null;
  readonly linkOpen: boolean;
  readonly panel: ToolbarPanel | null;
}

const HIDDEN: ToolbarState = Object.freeze({
  visible: false,
  position: null,
  formats: null,
  range: null,
  linkOpen: false,
  panel: null,
});

function sameFormats(a: RangeFormats | null, b: RangeFormats | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.bold === b.bold &&
      a.italic === b.italic &&
      a.underline === b.underline &&
      a.strike === b.strike &&
      a.code === b.code &&
      a.link === b.link &&
      a.color === b.color &&
      a.backgroundColor === b.backgroundColor &&
      a.align === b.align)
  );
}

export class ToolbarController {
  private state: ToolbarState = HIDDEN;

  private readonly listeners = new Set<() => void>();

  getState = (): ToolbarState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  show(range: DocSelection, formats: RangeFormats, position: { x: number; y: number }): void {
    const prev = this.state;
    const same =
      prev.visible &&
      sameFormats(prev.formats, formats) &&
      prev.position?.x === position.x &&
      prev.position?.y === position.y &&
      prev.range?.from.blockId === range.from.blockId &&
      prev.range?.from.offset === range.from.offset &&
      prev.range?.to.blockId === range.to.blockId &&
      prev.range?.to.offset === range.to.offset;

    if (!same) this.set({ ...prev, visible: true, position, formats, range });
  }

  hide(): void {
    if (this.state.visible) this.set(HIDDEN);
  }

  openLink(): void {
    if (this.state.visible && !this.state.linkOpen) {
      this.set({ ...this.state, linkOpen: true, panel: null });
    }
  }

  togglePanel(panel: ToolbarPanel): void {
    if (!this.state.visible || this.state.linkOpen) return;

    this.set({ ...this.state, panel: this.state.panel === panel ? null : panel });
  }

  closePanel(): void {
    if (this.state.panel) this.set({ ...this.state, panel: null });
  }

  closeLink(): void {
    if (this.state.linkOpen) this.set({ ...this.state, linkOpen: false });
  }

  private set(state: ToolbarState): void {
    this.state = state;

    for (const listener of [...this.listeners]) listener();
  }
}
