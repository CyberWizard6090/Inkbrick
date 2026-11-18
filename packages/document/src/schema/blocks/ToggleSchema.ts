import * as z from '../zod';

import { blockBackgroundSchema } from './blockBackground';

import type { BlockSchema } from '../BlockSchema';

export const TOGGLE = 'block:toggle';

export const togglePropsSchema = z.object({
  /** Раскрыт ли блок: вложенные блоки видны только в раскрытом. По умолчанию раскрыт. */
  open: z.boolean().optional(),
  /** Цвет фона блока: имя из `BLOCK_BACKGROUNDS` или `#rrggbb`; без него фона нет. */
  background: blockBackgroundSchema.optional(),
});

export type ToggleProps = z.infer<typeof togglePropsSchema>;

/** Блоки, которые можно вложить в toggle: обычное содержимое, но не контейнеры документа и не части составных блоков. */
const NESTED = new Set([
  'block:paragraph',
  'block:heading',
  'block:list',
  'block:quote',
  'block:callout',
  'block:code',
  'block:divider',
  'block:image',
  'block:formula',
  'block:toc',
  'block:table',
  TOGGLE,
]);

/**
 * Переключатель: строка заголовка и вложенные блоки, которые показываются только в раскрытом состоянии.
 * Состояние (`open`) хранится в документе и входит в историю правок.
 */
export const ToggleSchema: BlockSchema<typeof togglePropsSchema> = {
  flavour: TOGGLE,
  name: 'Toggle',
  icon: 'chevron-right',

  allowedParents: () => true,
  allowedChildren: (flavour) => NESTED.has(flavour),
  enter: { nextFlavour: 'block:paragraph' },
  indentable: true,

  commands: ['split-block'],
  shortcuts: [],
  rendererHint: 'toggle-block',

  propsSchema: togglePropsSchema,
};

/**
 * Схема переключателя. Во встроенный набор не входит: подключается явно —
 * `new Editor({ blocks: toggleBlocks })` из `@inkbrick/engine`.
 */
export const toggleBlockSchemas: readonly BlockSchema[] = [ToggleSchema];
