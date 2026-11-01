import { z } from 'zod';
import { BlockSchema } from '../BlockSchema';
import { isSafeImageUrl } from '../../utils/url';

export const imagePropsSchema = z.object({
  /** Адрес картинки; пустой — блок ещё без изображения (показывается выбор). Проверяется схемой. */
  src: z
    .string()
    .refine(
      (value: string) => value === '' || isSafeImageUrl(value),
      'Unsafe or unsupported image URL',
    )
    .default(''),
  alt: z.string().max(1000).default(''),
  caption: z.string().max(2000).default(''),
  /** Ширина в процентах от ширины документа. */
  width: z.number().min(10).max(100).default(100),
  align: z.enum(['left', 'center', 'right']).default('center'),
});

export type ImageProps = z.infer<typeof imagePropsSchema>;

export const ImageSchema: BlockSchema<typeof imagePropsSchema> = {
  flavour: 'block:image',
  name: 'Image',
  icon: 'image',

  inline: false,
  allowedParents: ['role:hub'],
  allowedChildren: [],

  commands: [],
  shortcuts: [],
  rendererHint: 'image-block',

  propsSchema: imagePropsSchema,
};
