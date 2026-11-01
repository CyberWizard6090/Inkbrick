import { z } from 'zod';
import { BlockSchema } from '../BlockSchema';

export const codePropsSchema = z.object({
  /** Язык для подсветки (подсветку обеспечивает приложение); 'plain' — без языка. */
  language: z.string().default('plain'),
});

export type CodeProps = z.infer<typeof codePropsSchema>;

export const CodeSchema: BlockSchema<typeof codePropsSchema> = {
  flavour: 'block:code',
  name: 'Code',
  icon: 'code',

  allowedParents: ['role:hub'],
  allowedChildren: [],
  enter: { mode: 'newline' },

  commands: [],
  shortcuts: [],
  rendererHint: 'code-block',

  propsSchema: codePropsSchema,
};
