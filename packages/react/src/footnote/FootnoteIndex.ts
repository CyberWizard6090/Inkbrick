import { footnoteNumbers, type BaseBlock } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

/** Блоки документа в порядке чтения (обход в глубину), без корня. */
export function* documentBlocks(editor: Editor): Generator<BaseBlock> {
  const stack = [...editor.document.getBlock(editor.document.rootId)!.children].reverse();

  while (stack.length > 0) {
    const block = editor.store.getBlock(stack.pop()!);

    if (!block) continue;

    yield block;
    for (let i = block.children.length - 1; i >= 0; i--) stack.push(block.children[i]);
  }
}

interface Label {
  readonly id: string;
  readonly element: HTMLElement;
}

/** Где в документе ссылка на сноску: блок и смещение символа-объекта. */
export interface FootnoteReference {
  readonly blockId: string;
  readonly offset: number;
}

/**
 * Номера и места сносок одного редактора. Номер — порядок первой ссылки в документе, в модели его нет: правка текста
 * или перенос блока меняют номера сами. Индекс строится при первом обращении и пересчитывается после правок (не чаще
 * раза за такт), поэтому документ без сносок ничего не платит.
 */
export class FootnoteIndex {
  private numbers = new Map<string, number>();

  private references = new Map<string, FootnoteReference>();

  private definitions = new Map<string, string>();

  private fresh = false;

  private version = 0;

  /** Снимок, о котором подписчики уже знают: сравнивается с новым, чтобы не пропустить изменение, пересчитанное при отрисовке. */
  private published = '';

  private scheduled = 0;

  private readonly listeners = new Set<() => void>();

  private readonly labels = new Set<Label>();

  private unsubscribe: (() => void) | null = null;

  constructor(private readonly editor: Editor) {}

  private ensure(): void {
    if (this.fresh) return;

    const blocks = [...documentBlocks(this.editor)];
    const numbers = footnoteNumbers(blocks);
    const references = new Map<string, FootnoteReference>();
    const definitions = new Map<string, string>();

    for (const block of blocks) {
      if (block.flavour === 'block:footnote') {
        const id = block.props.id;

        // Если у двух сносок один код, первая главная.
        if (typeof id === 'string' && !definitions.has(id)) definitions.set(id, block.id);
      }

      let offset = 0;

      for (const node of block.content) {
        const id = node.attributes?.footnote;

        if (typeof id === 'string' && !references.has(id)) {
          references.set(id, { blockId: block.id, offset });
        }

        offset += node.insert.length;
      }
    }

    this.numbers = numbers;
    this.references = references;
    this.definitions = definitions;
    this.fresh = true;
  }

  numberOf(id: string): number | undefined {
    this.ensure();

    return this.numbers.get(id);
  }

  referenceOf(id: string): FootnoteReference | undefined {
    this.ensure();

    return this.references.get(id);
  }

  definitionOf(id: string): string | undefined {
    this.ensure();

    return this.definitions.get(id);
  }

  /** Растёт, когда номера или места сносок изменились: по нему перерисовываются подписчики. */
  getVersion = (): number => this.version;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.watch();

    return () => {
      this.listeners.delete(listener);
      this.unwatch();
    };
  };

  /** Метка ссылки в тексте: её цифра обновляется вместе с номерами. */
  addLabel(element: HTMLElement, id: string): void {
    this.labels.add({ id, element });
    this.watch();
    element.textContent = String(this.numberOf(id) ?? '?');
  }

  private watch(): void {
    if (this.unsubscribe) return;

    this.unsubscribe = this.editor.store.subscribe(() => {
      this.fresh = false;

      if (this.scheduled) return;

      this.scheduled = window.setTimeout(() => {
        this.scheduled = 0;
        this.refresh();
      }, 0);
    });
  }

  private unwatch(): void {
    if (this.listeners.size > 0 || this.labels.size > 0) return;

    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private refresh(): void {
    this.fresh = false;
    this.ensure();

    for (const label of [...this.labels]) {
      if (!label.element.isConnected) {
        this.labels.delete(label);
        continue;
      }

      label.element.textContent = String(this.numbers.get(label.id) ?? '?');
    }

    this.unwatch();

    const snapshot = JSON.stringify([...this.numbers, ...this.references, ...this.definitions]);

    if (snapshot !== this.published) {
      this.published = snapshot;
      this.version++;
      for (const listener of [...this.listeners]) listener();
    }
  }
}

const indexes = new WeakMap<Editor, FootnoteIndex>();

export function getFootnoteIndex(editor: Editor): FootnoteIndex {
  let index = indexes.get(editor);

  if (!index) {
    index = new FootnoteIndex(editor);
    indexes.set(editor, index);
  }

  return index;
}
