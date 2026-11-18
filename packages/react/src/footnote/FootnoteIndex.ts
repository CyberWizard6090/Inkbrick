import type { BaseBlock } from '@inkbrick/document';
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

/** Коды сносок, на которые ссылается текст блока, по порядку (с повторами). */
function referencedIds(block: BaseBlock): string[] {
  const ids: string[] = [];

  for (const node of block.content) {
    const id = node.attributes?.footnote;

    if (typeof id === 'string') ids.push(id);
  }

  return ids;
}

/** Код сноски, если блок — текст сноски. */
const definedId = (block: BaseBlock): string | undefined =>
  block.flavour === 'block:footnote' && typeof block.props.id === 'string'
    ? block.props.id
    : undefined;

/** Участвует ли блок в нумерации: ссылается на сноски или сам текст сноски. */
const touchesFootnotes = (block: BaseBlock): boolean =>
  block.flavour === 'block:footnote' ||
  block.content.some((node) => typeof node.attributes?.footnote === 'string');

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Номера и места сносок одного редактора. Номер — порядок первой ссылки в документе, в модели его нет: правка текста
 * или перенос блока меняют номера сами. Индекс строится при первом обращении; после правки он смотрит только на
 * изменённые блоки и обходит весь документ заново, лишь когда правка задела сноски или их порядок (вставка ссылки,
 * перенос блока со сноской). Обычный набор текста стоит O(изменённых блоков), документ без сносок ничего не платит.
 */
export class FootnoteIndex {
  private numbers = new Map<string, number>();

  private references = new Map<string, FootnoteReference>();

  private definitions = new Map<string, string>();

  /** Блоки на момент последнего обхода (блоки неизменяемы: изменённый блок — новый объект). */
  private seen = new Map<string, BaseBlock>();

  /** Блоки со ссылками на сноски и тексты сносок. */
  private marked = new Set<string>();

  private fresh = false;

  /** Версия хранилища, которой соответствует индекс. */
  private synced = -1;

  private version = 0;

  /** Снимок, о котором подписчики уже знают: сравнивается с новым, чтобы не пропустить изменение, пересчитанное при отрисовке. */
  private published = '';

  private scheduled: ReturnType<typeof setTimeout> | 0 = 0;

  private readonly listeners = new Set<() => void>();

  private readonly labels = new Set<Label>();

  private unsubscribe: (() => void) | null = null;

  constructor(private readonly editor: Editor) {}

  private ensure(): void {
    const current = this.editor.store.getVersion();

    if (this.fresh && this.synced === current) return;

    // Хранилище ушло вперёд, а об изменённых блоках ещё не сообщило (отрисовка до уведомления): обход целиком, а
    // подписчики узнают о новых номерах после такта.
    if (this.fresh) this.schedule();

    this.rebuild();
  }

  private rebuild(): void {
    const numbers = new Map<string, number>();
    const references = new Map<string, FootnoteReference>();
    const definitions = new Map<string, string>();
    const seen = new Map<string, BaseBlock>();
    const marked = new Set<string>();

    for (const block of documentBlocks(this.editor)) {
      seen.set(block.id, block);

      const defined = definedId(block);

      // Если у двух сносок один код, первая главная.
      if (block.flavour === 'block:footnote') marked.add(block.id);
      if (defined !== undefined && !definitions.has(defined)) definitions.set(defined, block.id);

      let offset = 0;

      for (const node of block.content) {
        const id = node.attributes?.footnote;

        if (typeof id === 'string') {
          marked.add(block.id);
          if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
          if (!references.has(id)) references.set(id, { blockId: block.id, offset });
        }

        offset += node.insert.length;
      }
    }

    this.numbers = numbers;
    this.references = references;
    this.definitions = definitions;
    this.seen = seen;
    this.marked = marked;
    this.fresh = true;
    this.synced = this.editor.store.getVersion();
  }

  /** Есть ли в поддереве блока что-то о сносках (по текущему состоянию, а для удалённых блоков — по прошлому обходу). */
  private subtreeTouches(id: string): boolean {
    if (this.marked.has(id)) return true;

    const stack = [id];

    while (stack.length > 0) {
      const next = stack.pop()!;
      // Удалённого блока в хранилище уже нет: его потомки — по прошлому обходу.
      const block = this.editor.store.getBlock(next) ?? this.seen.get(next);

      if (!block) continue;
      if (this.marked.has(block.id) || touchesFootnotes(block)) return true;
      stack.push(...block.children);
    }

    return false;
  }

  /** Меняет ли смена списка потомков порядок сносок: смотрит только на отрезок, где старый и новый списки расходятся. */
  private childrenTouch(before: readonly string[], after: readonly string[]): boolean {
    let head = 0;

    while (head < before.length && head < after.length && before[head] === after[head]) head++;

    let tail = 0;

    while (
      tail < before.length - head &&
      tail < after.length - head &&
      before[before.length - 1 - tail] === after[after.length - 1 - tail]
    ) {
      tail++;
    }

    const window = new Set([
      ...before.slice(head, before.length - tail),
      ...after.slice(head, after.length - tail),
    ]);

    for (const id of window) if (this.subtreeTouches(id)) return true;

    return false;
  }

  /**
   * Правка блоков: можно ли обновить индекс на месте. `false` — правка задела сноски или их порядок, нужен обход.
   * Ссылки в блоке, где набор сносок не изменился, получают новые смещения.
   */
  private patch(ids: readonly string[]): boolean {
    for (const id of ids) {
      const now = this.editor.store.getBlock(id);
      const before = this.seen.get(id);

      if (now === before) continue;

      if (!now) {
        // Удалённый блок: его потомки удаляются той же правкой и тоже есть в списке.
        if (this.marked.has(id)) return false;
        this.seen.delete(id);
        continue;
      }

      if (!before) {
        if (this.subtreeTouches(id)) return false;
        this.seen.set(id, now);
        continue;
      }

      if (now.parentId !== before.parentId && this.subtreeTouches(id)) return false;
      if (now.children !== before.children && this.childrenTouch(before.children, now.children)) {
        return false;
      }
      if (
        definedId(now) !== definedId(before) ||
        touchesFootnotes(now) !== touchesFootnotes(before)
      ) {
        return false;
      }

      if (now.content !== before.content && this.marked.has(id)) {
        const refs = referencedIds(now);

        if (!sameIds(refs, referencedIds(before))) return false;
        this.moveReferences(now);
      }

      this.seen.set(id, now);
    }

    return true;
  }

  /** Новые смещения ссылок блока, для которых он — первое упоминание. */
  private moveReferences(block: BaseBlock): void {
    let offset = 0;
    const done = new Set<string>();

    for (const node of block.content) {
      const id = node.attributes?.footnote;

      if (typeof id === 'string' && !done.has(id)) {
        done.add(id);
        if (this.references.get(id)?.blockId === block.id) {
          this.references.set(id, { blockId: block.id, offset });
        }
      }

      offset += node.insert.length;
    }
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

    this.unsubscribe = this.editor.store.subscribeChanges((ids) => {
      if (!this.fresh) {
        this.schedule();
        return;
      }

      // Индекс уже пересчитан под эту версию (отрисовка опередила уведомление): об изменении позаботился ensure.
      if (this.synced === this.editor.store.getVersion()) return;

      const references = this.references;

      if (this.patch(ids)) {
        this.synced = this.editor.store.getVersion();
        // Номера прежние; сдвинулись только ссылки — подписчикам сообщит сравнение снимков.
        if (references.size > 0 && ids.some((id) => this.marked.has(id))) this.schedule();
        return;
      }

      this.fresh = false;
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.scheduled) return;

    this.scheduled = globalThis.setTimeout(() => {
      this.scheduled = 0;
      this.refresh();
    }, 0);
  }

  private unwatch(): void {
    if (this.listeners.size > 0 || this.labels.size > 0) return;

    this.unsubscribe?.();
    this.unsubscribe = null;
    // Без подписки правки не отслеживаются: при следующем обращении индекс строится заново.
    this.fresh = false;
  }

  private refresh(): void {
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
