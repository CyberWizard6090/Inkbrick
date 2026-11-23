import { IMAGE_ASPECTS, type ImageAspect } from '@inkbrick/document';

/** Рамка обрезки в долях оригинала (как `CropRect` из `@inkbrick/dom/image-tools`). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Обрезка блока: рамка и форма. */
export interface BlockCrop {
  readonly rect: Rect;
  readonly aspect: ImageAspect;
}

export const FULL: Rect = { x: 0, y: 0, width: 1, height: 1 };

const EPSILON = 1e-4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const number = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Обрезка из свойств блока; неверные значения заменяются значениями по умолчанию. */
export function cropOf(props: Readonly<Record<string, unknown>>): BlockCrop {
  const aspect = (IMAGE_ASPECTS as readonly unknown[]).includes(props.aspect)
    ? (props.aspect as ImageAspect)
    : 'free';
  const width = clamp(number(props.cropWidth, 100), 1, 100) / 100;
  const height = clamp(number(props.cropHeight, 100), 1, 100) / 100;

  return {
    aspect,
    rect: {
      x: clamp(number(props.cropX, 0) / 100, 0, 1 - width),
      y: clamp(number(props.cropY, 0) / 100, 0, 1 - height),
      width,
      height,
    },
  };
}

export const isFullRect = (rect: Rect): boolean =>
  rect.x < EPSILON && rect.y < EPSILON && rect.width > 1 - EPSILON && rect.height > 1 - EPSILON;

/** Картинка обрезана: рамка меньше картинки или форма — круг. */
export const isCropped = (crop: BlockCrop): boolean =>
  crop.aspect === 'circle' || !isFullRect(crop.rect);

const percent = (fraction: number) => Math.round(fraction * 10_000) / 100;

/** Свойства блока для записи обрезки (проценты с точностью до сотых). */
export const cropProps = (rect: Rect, aspect: ImageAspect) => ({
  aspect,
  cropX: percent(rect.x),
  cropY: percent(rect.y),
  cropWidth: percent(rect.width),
  cropHeight: percent(rect.height),
});

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Оригинал картинки: `originalSrc`, а если его нет — сам `src`. */
export const originalOf = (props: Readonly<Record<string, unknown>>): string =>
  text(props.originalSrc) || text(props.src);

/**
 * Обрезка стилем (нет файла обрезки): пропорции кадра и положение картинки в нём, в процентах кадра. `natural` —
 * размер оригинала в пикселях.
 */
export function styleCrop(
  rect: Rect,
  natural: { readonly width: number; readonly height: number },
): { ratio: number; left: number; top: number; width: number; height: number } {
  return {
    ratio: (rect.width * natural.width) / (rect.height * natural.height),
    left: (-rect.x / rect.width) * 100,
    top: (-rect.y / rect.height) * 100,
    width: 100 / rect.width,
    height: 100 / rect.height,
  };
}
