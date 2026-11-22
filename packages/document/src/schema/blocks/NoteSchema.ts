import * as z from '../zod';
import { BlockSchema } from '../BlockSchema';

export const notePropsSchema = z.object({});

export const NoteSchema: BlockSchema<typeof notePropsSchema> = {
  flavour: 'block:note',
  version: 1,
  name: 'Note',

  role: 'hub',
  allowedParents: ['block:page'],
  // Любой блок, который сам разрешает note в allowedParents (включая пользовательские).
  allowedChildren: '*',
  fillWhenEmpty: 'block:paragraph',

  commands: [],
  shortcuts: [],
  inline: false,
  icon: 'note-icon',
  rendererHint: 'editor-root',

  propsSchema: notePropsSchema,
};
