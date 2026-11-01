import type { ReactNode } from 'react';

import type { Editor } from '@inkbrick/engine';

import { Icon } from '../icons/Icon';
import { ICON_SHAPES, type IconName } from '../icons/lucide';
import type { KeyBinding, KeymapContext } from '../keymap/types';
import type { SlashMenuItem } from '../slash/types';

export function iconByName(name: string | undefined): ReactNode {
  return name && Object.hasOwn(ICON_SHAPES, name) ? <Icon name={name as IconName} /> : undefined;
}

export function controllerSlashItems(editor: Editor): SlashMenuItem[] {
  return editor.controllers.entries().flatMap(([flavour, controller]) =>
    (controller.slashItems ?? []).map<SlashMenuItem>((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      keywords: item.keywords,
      icon: iconByName(item.icon),
      flavour,
      props: item.props,
    })),
  );
}

function controlledBlockAt(context: KeymapContext, flavour: string) {
  const selection = context.selection();
  const block = selection && context.editor.store.getBlock(selection.from.blockId);

  return block?.flavour === flavour ? block : undefined;
}

export function controllerKeymap(editor: Editor): KeyBinding[] {
  return editor.controllers.entries().flatMap(([flavour, controller]) =>
    (controller.keymap ?? []).map<KeyBinding>((binding) => ({
      id: binding.id,
      keys: binding.keys,
      when: (context) => controlledBlockAt(context, flavour) !== undefined,
      run: (context) => {
        const block = controlledBlockAt(context, flavour);

        return block ? binding.run(context.editor.controllers.contextOf(block)) : false;
      },
    })),
  );
}

/**
 * Объединяет пункты по id: пункт из `preferred` заменяет одноимённый из `base`.
 * Порядок: сначала `base`, затем `preferred` (или наоборот — `'preferred-first'`, для клавиш: проверяются раньше).
 */
export function mergeById<T extends { readonly id: string }>(
  base: readonly T[],
  preferred: readonly T[],
  order: 'base-first' | 'preferred-first' = 'base-first',
): T[] {
  const ids = new Set(preferred.map((item) => item.id));
  const rest = base.filter((item) => !ids.has(item.id));

  return order === 'base-first' ? [...rest, ...preferred] : [...preferred, ...rest];
}
