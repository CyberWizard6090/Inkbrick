import * as z from '../zod';

import { blockBackgroundSchema } from './blockBackground';
import { BlockSchema } from '../BlockSchema';

export const quotePropsSchema = z.object({
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  /** Цвет фона блока: имя из `BLOCK_BACKGROUNDS` или `#rrggbb`; без него фона нет. */
  background: blockBackgroundSchema.optional(),
});

export const QuoteSchema: BlockSchema<typeof quotePropsSchema> = {
  flavour: 'block:quote',
  name: 'Quote',
  icon: 'quote',

  allowedParents: ['role:hub'],
  allowedChildren: [],
  enter: { exitWhenEmpty: true },

  commands: ['split-block'],
  shortcuts: [],
  rendererHint: 'quote-block',

  propsSchema: quotePropsSchema,
};
