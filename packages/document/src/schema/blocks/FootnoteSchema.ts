import * as z from '../zod';

import type { BlockSchema } from '../BlockSchema';

export const FOOTNOTE = 'block:footnote';

export const footnotePropsSchema = z.object({
  /** Код сноски: на него ссылается атрибут `footnote` в тексте. Номер считается по порядку ссылок и здесь не хранится. */
  id: z.string().regex(/^[\w-]{1,64}$/),
});

export type FootnoteProps = z.infer<typeof footnotePropsSchema>;

/**
 * Текст сноски: обычный текстовый блок в конце заметки. Во встроенный набор не входит — подключается явно:
 * `new Editor({ blocks: footnoteBlocks })` из `@inkbrick/engine`.
 */
export const FootnoteSchema: BlockSchema<typeof footnotePropsSchema> = {
  flavour: FOOTNOTE,
  name: 'Footnote',
  icon: 'text',

  allowedParents: ['role:hub'],
  allowedChildren: [],
  enter: { nextFlavour: 'block:paragraph' },

  commands: [],
  shortcuts: [],
  rendererHint: 'footnote-block',

  propsSchema: footnotePropsSchema,
};

export const footnoteBlockSchemas: readonly BlockSchema[] = [FootnoteSchema];
