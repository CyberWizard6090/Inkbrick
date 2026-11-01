import { z } from 'zod';
import { BlockSchema } from '../BlockSchema';
import { MAX_FORMULA_LENGTH } from '../../utils/formula';

export const formulaPropsSchema = z.object({
  /** Код формулы на LaTeX; пустой — блок ещё без формулы (показывается редактор). */
  latex: z.string().max(MAX_FORMULA_LENGTH).default(''),
});

export type FormulaProps = z.infer<typeof formulaPropsSchema>;

export const FormulaSchema: BlockSchema<typeof formulaPropsSchema> = {
  flavour: 'block:formula',
  name: 'Formula',
  icon: 'sigma',
  inline: false,
  allowedParents: ['role:hub'],
  allowedChildren: [],
  commands: [],
  shortcuts: [],
  rendererHint: 'formula-block',
  propsSchema: formulaPropsSchema,
};
