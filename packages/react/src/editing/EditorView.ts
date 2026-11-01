import type { BlockId } from '@inkbrick/document';

import { BlockHandleController } from '../block-handle/BlockHandleController';
import { UploadTracker } from '../images/UploadTracker';
import { BlockSelectionController } from './BlockSelectionController';
import { FormulaController } from '../formula/FormulaController';
import { CaretController } from './CaretController';
import { SlashMenuController } from '../slash/SlashMenuController';
import { ToolbarController } from '../toolbar/ToolbarController';
import { ViewportController } from './ViewportController';
import { setDomSelection, type DocPoint } from './selection';

/**
 * Связь модели с DOM: корневой редактируемый элемент и элементы текстовых блоков.
 * Нужна, чтобы после изменения модели вернуть курсор/выделение на место.
 */
export class EditorView {
  private readonly elements = new Map<BlockId, HTMLElement>();

  private root: HTMLElement | null = null;

  readonly slash = new SlashMenuController();

  readonly uploads = new UploadTracker();

  readonly selection = new BlockSelectionController();

  readonly caret = new CaretController();

  readonly blocks = new BlockHandleController();

  readonly formula = new FormulaController();

  readonly toolbar = new ToolbarController();

  readonly viewport = new ViewportController();

  pointerDown = false;

  private pending: { from: DocPoint; to: DocPoint } | null = null;

  setRoot(element: HTMLElement | null): () => void {
    this.root = element;

    return () => {
      if (this.root === element) this.root = null;
    };
  }

  getRoot(): HTMLElement | null {
    return this.root;
  }

  register(id: BlockId, element: HTMLElement): () => void {
    this.elements.set(id, element);

    const pending = this.pending;

    if (
      pending &&
      this.elements.has(pending.from.blockId) &&
      this.elements.has(pending.to.blockId)
    ) {
      // Регистрация идёт раньше, чем блок заполнит текст (тоже в layout-эффекте): ставим после фиксации.
      queueMicrotask(() => {
        if (this.pending === pending) this.placeSelection(pending.from, pending.to);
      });
    }

    return () => {
      // Не удаляем, если за это время зарегистрировали другой элемент для того же id.
      if (this.elements.get(id) === element) {
        this.elements.delete(id);
      }
    };
  }

  getElement(id: BlockId): HTMLElement | undefined {
    return this.elements.get(id);
  }

  placeCaret(id: BlockId, offset: number): void {
    this.placeSelection({ blockId: id, offset }, { blockId: id, offset });
  }

  placeSelection(from: DocPoint, to: DocPoint): void {
    const start = this.elements.get(from.blockId);
    const end = this.elements.get(to.blockId);

    if (!start || !end) {
      // Блок за пределами окна виртуального рендерера: просим отрисовать его и ставим выделение,
      // когда он зарегистрируется (прокрутка к нему — ниже, через scrollIntoView).
      this.pending = this.viewport.reveal([from.blockId, to.blockId]) ? { from, to } : null;
      return;
    }

    this.pending = null;

    // Фокус принадлежит корню: отдельные блоки не являются редактируемыми элементами.
    if (this.root && globalThis.document.activeElement !== this.root) {
      this.root.focus({ preventScroll: true });
    }

    setDomSelection(start, from.offset, end, to.offset);

    end.scrollIntoView?.({ block: 'nearest' });
  }
}
