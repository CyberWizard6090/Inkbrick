import * as z from '../zod';

import { blockBackgroundSchema } from './blockBackground';
import { BlockSchema } from '../BlockSchema';

export const listPropsSchema = z.object({
  type: z.enum(['bullet', 'ordered', 'todo']).default('bullet'),
  checked: z.boolean().optional(),
  /** Вложенные блоки пункта скрыты (сворачивание пунктов списка). Хранится в документе и входит в историю правок. */
  collapsed: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  /** Цвет фона блока: имя из `BLOCK_BACKGROUNDS` или `#rrggbb`; без него фона нет. */
  background: blockBackgroundSchema.optional(),
});

export type ListProps = z.infer<typeof listPropsSchema>;

export const ListSchema: BlockSchema<typeof listPropsSchema> = {
  flavour: 'block:list',
  version: 1,
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
