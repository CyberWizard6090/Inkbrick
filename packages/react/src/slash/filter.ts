import type { SlashMenuItem } from './types';

function score(item: SlashMenuItem, query: string): number {
  const title = item.title.toLowerCase();
  const words = [
    title,
    ...title.split(/\s+/),
    ...(item.keywords ?? []).map((k) => k.toLowerCase()),
    item.id.toLowerCase(),
  ];

  if (title.startsWith(query)) return 4;
  if (words.some((w) => w.startsWith(query))) return 3;
  if (words.some((w) => w.includes(query))) return 1;

  return 0;
}

export function filterSlashItems(items: readonly SlashMenuItem[], query: string): SlashMenuItem[] {
  const q = query.trim().toLowerCase();

  if (q === '') return [...items];

  return items
    .map((item, index) => ({ item, index, score: score(item, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
