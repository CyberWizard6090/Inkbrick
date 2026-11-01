import { z } from 'zod';
import { BlockSchema } from '../BlockSchema';

export const pagePropsSchema = z.object({
  title: z.string().default('Untitled Page'),
});

export const PageSchema: BlockSchema<typeof pagePropsSchema> = {
  flavour: 'block:page',
  name: 'Page',
  role: 'root',
  allowedParents: [],
  allowedChildren: ['block:note'],
  commands: [],
  shortcuts: [],
  inline: false,
  icon: 'page-icon',
  rendererHint: 'container',

  propsSchema: pagePropsSchema,
};
