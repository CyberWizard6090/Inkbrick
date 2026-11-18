import * as z from '../zod';

import { blockBackgroundSchema } from './blockBackground';
import { BlockSchema } from '../BlockSchema';

export const headingPropsSchema = z.object({
  level: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
    .default(1),
  align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  /** Цвет фона блока: имя из `BLOCK_BACKGROUNDS` или `#rrggbb`; без него фона нет. */
  background: blockBackgroundSchema.optional(),
  /** Блоки после заголовка до следующего заголовка того же или более высокого уровня скрыты (сворачивание). */
  collapsed: z.boolean().optional(),
});

export type HeadingProps = z.infer<typeof headingPropsSchema>;

export const HeadingSchema: BlockSchema = {
  flavour: 'block:heading',
  name: 'Heading',
  icon: 'heading',

  allowedParents: ['role:hub'],
  enter: { nextFlavour: 'block:paragraph' },
  allowedChildren: [],

  commands: ['toggle-paragraph', 'split-block'],
  shortcuts: ['Mod-Alt-1', 'Mod-Alt-2', 'Mod-Alt-3'],
  rendererHint: 'heading-block',

  propsSchema: headingPropsSchema,
};
