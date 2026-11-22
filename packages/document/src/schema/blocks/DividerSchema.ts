import * as z from '../zod';
import { BlockSchema } from '../BlockSchema';

export const dividerPropsSchema = z.object({});

export const DividerSchema: BlockSchema<typeof dividerPropsSchema> = {
  flavour: 'block:divider',
  version: 1,
  name: 'Divider',
  icon: 'divider',

  inline: false,
  allowedParents: ['role:hub'],
  allowedChildren: [],

  commands: [],
  shortcuts: [],
  rendererHint: 'divider-block',

  propsSchema: dividerPropsSchema,
};
