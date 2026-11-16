import * as z from '../zod';

import type { BlockSchema } from '../BlockSchema';

export const TOC = 'block:toc';

export const tocPropsSchema = z.object({
  /** Самый глубокий уровень заголовков в оглавлении (1–6). */
  maxLevel: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
    .default(6),
});

export type TocProps = z.infer<typeof tocPropsSchema>;

/**
 * Оглавление: список заголовков документа со ссылками на них. В документе хранятся только настройки, сам список
 * собирается из заголовков при отрисовке и экспорте, поэтому всегда актуален.
 */
export const TocSchema: BlockSchema<typeof tocPropsSchema> = {
  flavour: TOC,
  name: 'Table of contents',
  icon: 'list',

  inline: false,
  allowedParents: ['role:hub'],
  allowedChildren: [],

  commands: [],
  shortcuts: [],
  rendererHint: 'toc-block',

  propsSchema: tocPropsSchema,
};

/**
 * Схема оглавления. Во встроенный набор не входит: подключается явно —
 * `new Editor({ blocks: tocBlocks })` из `@inkbrick/engine`.
 */
export const tocBlockSchemas: readonly BlockSchema[] = [TocSchema];
