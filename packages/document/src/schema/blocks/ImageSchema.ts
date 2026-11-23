import * as z from '../zod';
import { BlockSchema } from '../BlockSchema';
import { isSafeImageUrl } from '../../utils/url';

/**
 * Форма обрезки: `free` — любые пропорции, `circle` — круг, остальные — ширина:высота (альбомная и книжная
 * ориентация — отдельные значения). Совпадает с `CROP_ASPECTS` пакета `@inkbrick/dom/image-tools`.
 */
export const IMAGE_ASPECTS = [
  'free',
  'circle',
  '1:1',
  '5:4',
  '4:5',
  '4:3',
  '3:4',
  '7:5',
  '5:7',
  '3:2',
  '2:3',
  '5:3',
  '3:5',
  '16:9',
  '9:16',
] as const;

export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

/** Отношение ширины к высоте для формы (`null` у свободной). */
export function imageAspectRatio(aspect: ImageAspect): number | null {
  if (aspect === 'free') return null;
  if (aspect === 'circle') return 1;

  const [width, height] = aspect.split(':').map(Number);

  return width / height;
}

const imageUrl = () =>
  z
    .string()
    .refine(
      (value: string) => value === '' || isSafeImageUrl(value),
      'Unsafe or unsupported image URL',
    )
    .default('');

const percent = (value: number) => z.number().min(0).max(100).default(value);

export const imagePropsSchema = z.object({
  /**
   * Показываемая картинка; пустой — блок ещё без изображения (показывается выбор). После обрезки — файл обрезки, а
   * оригинал лежит в `originalSrc`. Проверяется схемой.
   */
  src: imageUrl(),
  /**
   * Оригинал, из которого сделан файл обрезки (`src`); пустой — `src` и есть оригинал. Повторная обрезка всегда идёт от
   * оригинала.
   */
  originalSrc: imageUrl(),
  alt: z.string().max(1000).default(''),
  /** Подпись; блок показывает её, когда она не пустая или включена кнопкой (`showCaption`). */
  caption: z.string().max(2000).default(''),
  showCaption: z.boolean().default(false),
  /** Ширина в процентах от ширины документа. */
  width: z.number().min(10).max(100).default(100),
  align: z.enum(['left', 'center', 'right']).default('center'),
  /** Форма обрезки. */
  aspect: z.enum(IMAGE_ASPECTS).default('free'),
  /**
   * Рамка обрезки в процентах оригинала: левый верхний угол и размер. Если файл обрезки сделать не удалось (картинка с
   * чужого сервера без CORS), блок обрезает оригинал стилем по этим числам.
   */
  cropX: percent(0),
  cropY: percent(0),
  cropWidth: percent(100),
  cropHeight: percent(100),
});

export type ImageProps = z.output<typeof imagePropsSchema>;

export const ImageSchema: BlockSchema<typeof imagePropsSchema> = {
  flavour: 'block:image',
  version: 1,
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
