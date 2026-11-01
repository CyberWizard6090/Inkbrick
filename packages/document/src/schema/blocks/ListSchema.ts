import { z } from 'zod';
import { BlockSchema } from '../BlockSchema';

export const listPropsSchema = z.object({
  type: z.enum(['bullet', 'ordered', 'todo']).default('bullet'),
  checked: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
});

export type ListProps = z.infer<typeof listPropsSchema>;

export const ListSchema: BlockSchema<typeof listPropsSchema> = {
  flavour: 'block:list',
  name: 'List Item',
  icon: 'bullet-list',

  allowedParents: () => true,
  enter: { exitWhenEmpty: true },
  indentable: true,
  allowedChildren: ['block:list', 'block:paragraph'],

  commands: ['indent-block', 'outdent-block', 'split-block'],
  shortcuts: ['Tab', 'Shift-Tab'],
  rendererHint: 'list-item-block',

  propsSchema: listPropsSchema,
};
