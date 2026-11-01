import { defaultKeymap } from './defaultKeymap';
import { matchesShortcut } from './shortcut';
import type { KeyBinding, KeymapContext } from './types';

/**
 * Собирает итоговый список привязок: свои привязки с `id` стандартной занимают её место, остальные идут
 * перед стандартными (проверяются первыми).
 */
export function resolveKeymap(custom: readonly KeyBinding[] = []): readonly KeyBinding[] {
  if (custom.length === 0) return defaultKeymap;

  const overrides = new Map(custom.map((binding) => [binding.id, binding]));
  const defaultIds = new Set(defaultKeymap.map((binding) => binding.id));

  return [
    ...custom.filter((binding) => !defaultIds.has(binding.id)),
    ...defaultKeymap.map((binding) => overrides.get(binding.id) ?? binding),
  ];
}

export function unbind(id: string): KeyBinding {
  return { id, keys: [], run: () => false };
}

export function handleKeyDown(bindings: readonly KeyBinding[], context: KeymapContext): boolean {
  const { event } = context;

  for (const binding of bindings) {
    const keys = typeof binding.keys === 'string' ? [binding.keys] : binding.keys;

    if (!keys.some((spec) => matchesShortcut(event, spec))) continue;
    if (binding.when && !binding.when(context)) continue;

    if (binding.run(context) === false) continue;

    event.preventDefault();

    return true;
  }

  return false;
}
