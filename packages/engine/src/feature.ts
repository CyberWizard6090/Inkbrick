import type { BlockFlavour, BlockSchema } from '@inkbrick/document';

import type { AnyCommand } from './commands/Command';
import type { AnyBlockDefinition } from './controller/BlockController';
import { isBlockDefinition } from './controller/BlockController';
import type { AfterCommand } from './dispatcher/afterCommand';
import type { CommandGuard } from './dispatcher/guards';
import type { Editor } from './editor/Editor';

/**
 * Подключаемая возможность редактора (таблицы, колонки, оглавление…): всё, что ей нужно в движке, одним объектом.
 * Базовый движок о возможностях не знает — их подключает приложение:
 *
 * ```ts
 * const editor = new Editor({ features: [tableFeature, columnsFeature] });
 * ```
 *
 * Блок может сам сослаться на нужную ему возможность (`BlockDefinition.feature`): тогда `new Editor({ blocks })` с
 * этим блоком подключит и её. Возможность с одним именем подключается один раз.
 */
export interface EditorFeature {
  /** Имя: по нему повторное подключение той же возможности пропускается. */
  readonly name: string;
  /** Блоки возможности: схемы и определения с контроллерами (их команды, пункты меню, клавиши). */
  readonly blocks?: readonly (BlockSchema | AnyBlockDefinition)[];
  /** Команды, не привязанные к одному блоку (`moveBlockToSide` у колонок). */
  readonly commands?: readonly AnyCommand[];
  /** Общие правила перед каждой командой (см. `CommandGuard`). */
  readonly guards?: readonly CommandGuard[];
  /** Обработка после каждой выполненной команды, в её транзакции (см. `AfterCommand`). */
  readonly afterCommand?: readonly AfterCommand[];
  /** Вызывается, когда редактор создан и всё остальное подключено. */
  setup?(editor: Editor): void;
}

/** Объявляет возможность (только для вывода типов). */
export function defineFeature(feature: EditorFeature): EditorFeature {
  return feature;
}

const flavourOf = (item: BlockSchema | AnyBlockDefinition): BlockFlavour =>
  isBlockDefinition(item) ? item.schema.flavour : item.flavour;

/**
 * Собирает возможности из `features` и из блоков (`BlockDefinition.feature`) и блоки из `blocks` и возможностей.
 * Блоки из `blocks` главнее блоков возможности того же типа (например, определение `@inkbrick/react` с компонентом).
 */
export function resolveFeatures(
  features: readonly EditorFeature[],
  blocks: readonly (BlockSchema | AnyBlockDefinition)[],
): { features: EditorFeature[]; blocks: (BlockSchema | AnyBlockDefinition)[] } {
  const byName = new Map<string, EditorFeature>();
  const queue = [
    ...features,
    ...blocks.flatMap((item) => (isBlockDefinition(item) && item.feature ? [item.feature] : [])),
  ];

  for (const feature of queue) if (!byName.has(feature.name)) byName.set(feature.name, feature);

  const all = [...blocks];
  const seen = new Set(blocks.map(flavourOf));

  for (const feature of queue) {
    for (const item of feature.blocks ?? []) {
      const flavour = flavourOf(item);

      if (seen.has(flavour)) continue;

      seen.add(flavour);
      all.push(item);
    }
  }

  return { features: [...byName.values()], blocks: all };
}
