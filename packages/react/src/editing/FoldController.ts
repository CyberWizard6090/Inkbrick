import type { BlockId } from '@inkbrick/document';

/**
 * Какие блоки сейчас скрыты свёрнутыми заголовками и каким именно. Подписка идёт на уровне блока: при сворачивании
 * перерисовываются только блоки, у которых изменилось «скрыт или нет». Без сворачивания заголовков он всегда пуст.
 */
export class FoldController {
  private hidden: ReadonlyMap<BlockId, BlockId> = new Map();

  private hiders: ReadonlySet<BlockId> = new Set();

  private readonly listeners = new Map<BlockId, Set<() => void>>();

  private readonly all = new Set<() => void>();

  /** Сколько блоков скрылось или показалось при последнем изменении: большие разделы сворачиваются без анимации. */
  changed = 0;

  /** Блоки, показанные последним изменением (раздел развернули): их при монтировании анимирует `BlockRenderer`. */
  private revealedPending = new Set<BlockId>();

  private revealTimer: ReturnType<typeof setTimeout> | undefined;

  /** Блоки, у которых сейчас идёт анимация сворачивания (`true`) или разворачивания (`false`). */
  private readonly moving = new Map<BlockId, boolean>();

  /** Блоки, у которых сейчас смонтирован `BlockRenderer`: только их скрытие можно анимировать. */
  private readonly mounted = new Set<BlockId>();

  private scheduled = false;

  /** Виртуальный рендерер: рисует только блоки у экрана, поэтому анимируется не весь раздел, а то, что на странице. */
  windowed = false;

  /** Растёт при каждом изменении набора скрытых блоков: по нему подписываются те, кому нужен весь набор целиком. */
  version = 0;

  isHidden = (blockId: BlockId): boolean => this.hidden.has(blockId);

  /**
   * Блок показан последним изменением, то есть появился при разворачивании раздела, и ещё не анимировался. Отметка
   * расходуется при первом же вопросе: иначе блок плавно «вырастал» бы при каждой прокрутке к нему.
   */
  consumeRevealed(blockId: BlockId): boolean {
    return this.revealedPending.delete(blockId);
  }

  /** Идёт ли сейчас хоть одна анимация сворачивания или разворачивания. */
  get isMoving(): boolean {
    return this.moving.size > 0;
  }

  /** Блок уходит или появляется с анимацией: его высоту сейчас измерять нельзя, а уходящий блок ещё нужен на странице. */
  isAnimating = (blockId: BlockId): boolean => this.moving.has(blockId);

  /** Блок скрыт, но ещё уходит с анимацией: рендерер должен его пока рисовать. */
  isLeaving = (blockId: BlockId): boolean => this.moving.get(blockId) === true;

  /** Блоки, которые сейчас уходят. */
  leavingIds(): readonly BlockId[] {
    return [...this.moving].filter(([, leaving]) => leaving).map(([id]) => id);
  }

  /**
   * Можно ли анимировать блок. Обычный рендерер рисует весь раздел, и раздел больше `limit` блоков сворачивается сразу
   * целиком; виртуальный рисует только блоки у экрана, поэтому там ограничено число одновременных анимаций.
   */
  canAnimate(limit: number): boolean {
    return this.windowed ? this.moving.size <= limit : this.changed <= limit;
  }

  /** `BlockRenderer` блока смонтирован; возвращает отмену. Незаконченная анимация уходящего блока снимается вместе с ним. */
  register(blockId: BlockId): () => void {
    this.mounted.add(blockId);

    return () => {
      this.mounted.delete(blockId);
      this.setMoving(blockId, null);
    };
  }

  /** Блок начал (`leaving`: уходить, иначе появляться) или закончил (`null`) анимацию. */
  setMoving(blockId: BlockId, leaving: boolean | null): void {
    if (leaving === null) {
      if (!this.moving.delete(blockId)) return;
    } else {
      this.moving.set(blockId, leaving);
      this.expire(blockId, leaving);
    }

    this.touch();
  }

  /** Отметка анимации не должна жить вечно (блок могли убрать, анимацию отменить): через 2 секунды она снимается сама. */
  private expire(blockId: BlockId, leaving: boolean): void {
    setTimeout(() => {
      if (this.moving.get(blockId) === leaving) {
        this.moving.delete(blockId);
        this.touch();
      }
    }, 2000);
  }

  /** Растим версию и будим подписчиков на весь набор — не чаще раза за такт, сколько бы блоков ни менялось сразу. */
  private touch(): void {
    if (this.scheduled) return;

    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.version += 1;
      for (const listener of [...this.all]) listener();
    });
  }

  /** Заголовок, который скрывает блок. */
  hiddenBy(blockId: BlockId): BlockId | undefined {
    return this.hidden.get(blockId);
  }

  /** Заголовок сейчас что-то скрывает. */
  isFolding(blockId: BlockId): boolean {
    return this.hiders.has(blockId);
  }

  get size(): number {
    return this.hidden.size;
  }

  subscribe = (blockId: BlockId) => {
    return (listener: () => void): (() => void) => {
      let set = this.listeners.get(blockId);

      if (!set) this.listeners.set(blockId, (set = new Set()));

      set.add(listener);

      return () => {
        set!.delete(listener);

        if (set!.size === 0 && this.listeners.get(blockId) === set) this.listeners.delete(blockId);
      };
    };
  };

  subscribeAll = (listener: () => void): (() => void) => {
    this.all.add(listener);

    return () => {
      this.all.delete(listener);
    };
  };

  set(next: ReadonlyMap<BlockId, BlockId>): void {
    const changed: BlockId[] = [];

    for (const [id, by] of next) if (this.hidden.get(id) !== by) changed.push(id);
    for (const id of this.hidden.keys()) if (!next.has(id)) changed.push(id);

    if (changed.length === 0) return;

    this.revealedPending = new Set(changed.filter((id) => !next.has(id)));
    // Блок, который окажется на странице позже, чем кончилась анимация (прокрутили к нему), не должен «вырастать».
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => this.revealedPending.clear(), 800);

    // Блок, скрытый только что и ещё нарисованный, помечается уходящим сразу: виртуальный рендерер в этом же такте
    // не должен его выбросить, пока он не успел сообщить об анимации.
    for (const id of changed) {
      if (next.has(id) && !this.hidden.has(id) && this.mounted.has(id)) {
        this.moving.set(id, true);
        this.expire(id, true);
      } else if (!next.has(id)) this.moving.delete(id);
    }

    this.hidden = next;
    this.hiders = new Set(next.values());
    this.changed = changed.length;
    this.version += 1;

    for (const id of changed)
      for (const listener of [...(this.listeners.get(id) ?? [])]) listener();
    for (const listener of [...this.all]) listener();
  }
}
