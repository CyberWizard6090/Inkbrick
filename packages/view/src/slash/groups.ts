import type { SlashMenuItem } from './types';

/** Группы пунктов меню в порядке показа; остальные (свои) идут за ними в порядке появления, пункты без группы — последними. */
export const SLASH_GROUPS: readonly string[] = ['basic', 'media', 'advanced'];

/**
 * Пункты по группам: сначала `basic`, `media`, `advanced`, затем свои группы, затем без группы. Порядок внутри группы
 * сохраняется.
 */
export function orderByGroup<T extends SlashMenuItem>(items: readonly T[]): T[] {
  const custom: string[] = [];

  for (const { group } of items) {
    if (group && !SLASH_GROUPS.includes(group) && !custom.includes(group)) custom.push(group);
  }

  const order = [...SLASH_GROUPS, ...custom];
  const rank = (group: string | undefined) => (group ? order.indexOf(group) : order.length);

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.group) - rank(b.item.group) || a.index - b.index)
    .map(({ item }) => item);
}
