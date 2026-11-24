type HighlightRegistry = {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
};
type HighlightConstructor = new (...ranges: Range[]) => unknown;

const registry = (): HighlightRegistry | undefined =>
  (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;

const constructor = (): HighlightConstructor | undefined =>
  (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight;

/** Диапазоны каждой подсветки по владельцам (редакторам): реестр CSS один на страницу, а редакторов может быть несколько. */
const owners = new Map<string, Map<object, readonly Range[]>>();

/** Есть ли в браузере CSS Custom Highlight API. */
export const highlightsSupported = (): boolean => !!registry() && !!constructor();

/**
 * Задаёт диапазоны подсветки `name` (`::highlight(name)`) от имени `owner` — обычно редактора. Подсветки других владельцев
 * с тем же именем сохраняются: в реестр уходит их объединение. Пустой список убирает диапазоны владельца; когда их не
 * остаётся ни у кого, подсветка удаляется из реестра.
 */
export function setHighlight(name: string, owner: object, ranges: readonly Range[]): void {
  const highlights = registry();
  const Highlight = constructor();

  if (!highlights || !Highlight) return;

  let byOwner = owners.get(name);

  if (ranges.length > 0) {
    if (!byOwner) owners.set(name, (byOwner = new Map()));
    byOwner.set(owner, ranges);
  } else {
    byOwner?.delete(owner);
  }

  const all = byOwner ? [...byOwner.values()].flat() : [];

  if (all.length > 0) {
    highlights.set(name, new Highlight(...all));
  } else {
    owners.delete(name);
    highlights.delete(name);
  }
}
