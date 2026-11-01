import type { BlockComponent, BlockComponentRegistry } from '../ui/types';
import { defaultBlockComponents } from './defaultBlockComponents';

function lookup(registry: BlockComponentRegistry, flavour: string): BlockComponent | undefined {
  // hasOwn: ключи вроде "constructor" или "__proto__" не должны находить прототипные свойства.
  return Object.hasOwn(registry, flavour) ? registry[flavour] : undefined;
}

export function resolveBlockComponent(
  flavour: string,
  custom: BlockComponentRegistry,
): BlockComponent | undefined {
  return lookup(custom, flavour) ?? lookup(defaultBlockComponents, flavour);
}
