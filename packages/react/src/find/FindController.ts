import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { findPoint } from '../editing/selection';
import { highlightsSupported, setHighlight } from '../editing/highlights';
import { findMatches, replaceMatches, type FindMatch } from './search';

export interface FindState {
  readonly open: boolean;
  /** Показана ли строка замены. */
  readonly replace: boolean;
  readonly query: string;
  readonly replacement: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly matches: readonly FindMatch[];
  /** Индекс текущего совпадения в `matches`; -1, если совпадений нет. */
  readonly current: number;
  /** Растёт при каждом открытии (в том числе повторном): панель по нему переносит фокус в строку запроса. */
  readonly nonce: number;
}

const IDLE: FindState = {
  open: false,
  replace: false,
  query: '',
  replacement: '',
  caseSensitive: false,
  wholeWord: false,
  matches: [],
  current: -1,
  nonce: 0,
};

export const HIGHLIGHT = 'inkbrick-find';
export const HIGHLIGHT_CURRENT = 'inkbrick-find-current';

/**
 * Состояние поиска и замены одного редактора: запрос, параметры, совпадения и текущее совпадение. Подсветка
 * рисуется CSS Custom Highlight API (`::highlight(inkbrick-find)`), документ при этом не меняется; в браузерах без
 * него остаётся только переход к совпадениям.
 */
export class FindController {
  private state: FindState = IDLE;

  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly editor: Editor,
    private readonly view: EditorView,
  ) {}

  getState = (): FindState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<FindState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  open(replace = false, query?: string): void {
    this.set({
      open: true,
      replace: replace || this.state.replace,
      nonce: this.state.nonce + 1,
      ...(query ? { query } : {}),
    });
    this.search(true);
  }

  close(): void {
    this.set({ open: false, matches: [], current: -1 });
    this.view.viewport.reveal([]);
    this.paint();
  }

  toggleReplace(): void {
    this.set({ replace: !this.state.replace });
  }

  setQuery(query: string): void {
    this.set({ query });
    this.search(true);
  }

  setReplacement(replacement: string): void {
    this.set({ replacement });
  }

  setOptions(options: { caseSensitive?: boolean; wholeWord?: boolean }): void {
    this.set(options);
    this.search(true);
  }

  /** Пересчитывает совпадения (после правки документа); текущее остаётся рядом с прежним местом. */
  refresh(): void {
    if (this.state.open) this.search(false);
  }

  private search(jump: boolean): void {
    const { query, caseSensitive, wholeWord, matches: before, current: was } = this.state;
    const matches = findMatches(this.editor, query, { caseSensitive, wholeWord });
    let current = matches.length === 0 ? -1 : 0;

    if (!jump && was >= 0 && matches.length > 0) {
      const previous = before[was];
      const at = matches.findIndex((item) =>
        item.blockId === previous?.blockId ? item.from >= previous.from : false,
      );

      current = at >= 0 ? at : Math.min(was, matches.length - 1);
    }

    this.set({ matches, current });
    if (jump) this.reveal();
    else this.paint();
  }

  go(delta: 1 | -1): void {
    const { matches, current } = this.state;

    if (matches.length === 0) return;

    this.set({ current: (current + delta + matches.length) % matches.length });
    this.reveal();
  }

  /** Заменяет текущее совпадение и переходит к следующему. */
  replaceCurrent(): void {
    const { matches, current, replacement } = this.state;
    const match = matches[current];

    if (!match) return;

    replaceMatches(this.editor, [match], replacement);
    this.search(false);
    this.reveal();
  }

  replaceAll(): number {
    const count = replaceMatches(this.editor, this.state.matches, this.state.replacement);

    this.search(false);

    return count;
  }

  /** Показывает текущее совпадение: просит отрисовать его блок (виртуальный рендерер) и прокручивает к нему. */
  private reveal(): void {
    const match = this.state.matches[this.state.current];

    this.paint();

    if (!match) return;

    if (!this.view.getElement(match.blockId)) {
      this.view.viewport.reveal([match.blockId]);
      // Блок появится после отрисовки: подсвечиваем и прокручиваем ещё раз.
      requestAnimationFrame(() => {
        this.paint();
        this.scrollToCurrent();
      });
      return;
    }

    this.scrollToCurrent();
  }

  private scrollToCurrent(): void {
    const match = this.state.matches[this.state.current];
    const range = match && this.rangeOf(match);

    (
      range?.startContainer.parentElement ?? this.view.getElement(match?.blockId ?? '')
    )?.scrollIntoView?.({
      block: 'center',
    });
  }

  private rangeOf({ blockId, from, to }: FindMatch): Range | null {
    const element = this.view.getElement(blockId);
    const start = element && findPoint(element, from);
    const end = element && findPoint(element, to);

    if (!start || !end) return null;

    const range = globalThis.document.createRange();

    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    return range;
  }

  /** Перерисовывает подсветку по текущему состоянию; вызывается и после перерисовки блоков (прокрутка, правка). */
  paint(): void {
    if (!highlightsSupported()) return;

    const { matches, current, open } = this.state;

    if (!open || matches.length === 0) {
      setHighlight(HIGHLIGHT, this, []);
      setHighlight(HIGHLIGHT_CURRENT, this, []);
      return;
    }

    const all: Range[] = [];
    let now: Range | null = null;

    matches.forEach((match, index) => {
      const range = this.rangeOf(match);

      if (!range) return;
      if (index === current) now = range;
      else all.push(range);
    });

    // Подсветка общая для страницы: совпадения поиска в других редакторах остаются.
    setHighlight(HIGHLIGHT, this, all);
    setHighlight(HIGHLIGHT_CURRENT, this, now ? [now] : []);
  }

  /** Закрывает поиск и ставит курсор на текущее совпадение: выделенное совпадение удобно сразу править. */
  closeAndSelect(): void {
    const match = this.state.matches[this.state.current];

    this.close();

    if (match)
      this.view.placeSelection(
        { blockId: match.blockId, offset: match.from },
        { blockId: match.blockId, offset: match.to },
      );
    else this.view.getRoot()?.focus({ preventScroll: true });
  }
}

const controllers = new WeakMap<EditorView, FindController>();

export function getFindController(editor: Editor, view: EditorView): FindController {
  let controller = controllers.get(view);

  if (!controller) {
    controller = new FindController(editor, view);
    controllers.set(view, controller);
  }

  return controller;
}
