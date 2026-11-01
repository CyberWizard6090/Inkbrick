import { z } from 'zod';
import { BlockSchema } from '../BlockSchema';

export const quotePropsSchema = z.object({
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
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
