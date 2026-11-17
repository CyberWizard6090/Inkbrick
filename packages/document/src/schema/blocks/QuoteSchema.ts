import * as z from '../zod';

import { BLOCK_BACKGROUNDS } from '../../utils/colors';
import { BlockSchema } from '../BlockSchema';

export const quotePropsSchema = z.object({
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  /** Цвет фона блока (`BLOCK_BACKGROUNDS`); без него фона нет. */
  background: z.enum(BLOCK_BACKGROUNDS).optional(),
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
