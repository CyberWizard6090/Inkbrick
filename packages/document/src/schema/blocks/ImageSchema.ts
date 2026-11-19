import * as z from '../zod';
import { BlockSchema } from '../BlockSchema';
import { isSafeImageUrl } from '../../utils/url';

/** Соотношение сторон кадра: `auto` — как у самой картинки, остальные — ширина:высота. */
export const IMAGE_ASPECTS = [
  'auto',
  '1:1',
  '4:3',
  '3:2',
  '16:9',
  '21:9',
  '3:4',
  '2:3',
  '9:16',
] as const;

export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

/** Пределы масштаба кадрирования (1 — картинка целиком в кадре). */
export const IMAGE_ZOOM_MIN = 1;
export const IMAGE_ZOOM_MAX = 5;

/** Отношение ширины к высоте для `aspect` (`null` у `auto`). */
export function imageAspectRatio(aspect: ImageAspect): number | null {
  if (aspect === 'auto') return null;

  const [width, height] = aspect.split(':').map(Number);

  return width / height;
}

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
  /**
   * Кадрирование без изменения самой картинки (оригинал остаётся целым, поэтому его можно кадрировать заново):
   * соотношение сторон кадра, масштаб и положение (в процентах, 50 — по центру) показанной части.
   */
  aspect: z.enum(IMAGE_ASPECTS).default('auto'),
  zoom: z.number().min(IMAGE_ZOOM_MIN).max(IMAGE_ZOOM_MAX).default(1),
  cropX: z.number().min(0).max(100).default(50),
  cropY: z.number().min(0).max(100).default(50),
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
