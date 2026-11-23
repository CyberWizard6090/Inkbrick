import * as z from '../zod';

import { blockBackgroundSchema } from './blockBackground';
import { BlockSchema } from '../BlockSchema';

export const CALLOUT_TONES = ['info', 'warning', 'success', 'danger'] as const;

export const calloutPropsSchema = z.object({
  tone: z.enum(CALLOUT_TONES).default('info'),
  icon: z.string().max(16).optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  /** Цвет фона блока: имя из `BLOCK_BACKGROUNDS` или `#rrggbb`; без него фона нет. */
  background: blockBackgroundSchema.optional(),
});

export type CalloutProps = z.output<typeof calloutPropsSchema>;

export const CalloutSchema: BlockSchema<typeof calloutPropsSchema> = {
  flavour: 'block:callout',
  version: 1,
  name: 'Callout',
  icon: 'callout',

  allowedParents: ['role:hub'],
  allowedChildren: [],
  enter: { exitWhenEmpty: true },

  commands: [],
  shortcuts: [],
  rendererHint: 'callout-block',

  propsSchema: calloutPropsSchema,
};
