import * as z from '../zod';

import { BLOCK_BACKGROUNDS } from '../../utils/colors';
import { BlockSchema } from '../BlockSchema';

export const paragraphPropsSchema = z.object({
  alignment: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  /** Цвет фона блока (`BLOCK_BACKGROUNDS`); без него фона нет. */
  background: z.enum(BLOCK_BACKGROUNDS).optional(),
});

export const ParagraphSchema: BlockSchema<typeof paragraphPropsSchema> = {
  flavour: 'block:paragraph',
  name: 'Paragraph',
  icon: 'text',
  allowedParents: () => true,
  allowedChildren: [],
  commands: ['toggle-heading', 'toggle-list', 'split-block'],
  shortcuts: ['Mod-Alt-0'],
  rendererHint: 'text-block',

  propsSchema: paragraphPropsSchema,
};
