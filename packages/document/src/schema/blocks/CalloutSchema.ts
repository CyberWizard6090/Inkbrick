import { z } from 'zod';
import { BlockSchema } from '../BlockSchema';

export const CALLOUT_TONES = ['info', 'warning', 'success', 'danger'] as const;

export const calloutPropsSchema = z.object({
  tone: z.enum(CALLOUT_TONES).default('info'),
  icon: z.string().max(16).optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
});

export type CalloutProps = z.infer<typeof calloutPropsSchema>;

export const CalloutSchema: BlockSchema<typeof calloutPropsSchema> = {
  flavour: 'block:callout',
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
