import {
  IMAGE_ASPECTS,
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  imageAspectRatio,
  type ImageAspect,
} from '@inkbrick/document';

/** Кадрирование картинки: пропорции кадра, масштаб и положение показанной части (проценты, 50 — по центру). */
export interface Crop {
  readonly aspect: ImageAspect;
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_CROP: Crop = { aspect: 'auto', zoom: 1, x: 50, y: 50 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Кадрирование из свойств блока; неверные значения заменяются значениями по умолчанию. */
export function cropOf(props: Readonly<Record<string, unknown>>): Crop {
  const number = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const aspect = (IMAGE_ASPECTS as readonly unknown[]).includes(props.aspect)
    ? (props.aspect as ImageAspect)
    : 'auto';

  return {
    aspect,
    zoom: clamp(number(props.zoom, 1), IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX),
    x: clamp(number(props.cropX, 50), 0, 100),
    y: clamp(number(props.cropY, 50), 0, 100),
  };
}

export const isDefaultCrop = (crop: Crop) =>
  crop.aspect === 'auto' && crop.zoom === 1 && crop.x === 50 && crop.y === 50;

/** Свойства блока для записи кадрирования; значения по умолчанию записываются тоже, чтобы сбросить прежние. */
export const cropProps = (crop: Crop) => ({
  aspect: crop.aspect,
  zoom: Math.round(crop.zoom * 100) / 100,
  cropX: Math.round(crop.x * 10) / 10,
  cropY: Math.round(crop.y * 10) / 10,
});

/** Отношение ширины к высоте кадра: заданное пропорциями или (для «оригинала») у самой картинки. */
export function frameRatio(aspect: ImageAspect, natural: number | null): number {
  return imageAspectRatio(aspect) ?? natural ?? 16 / 9;
}

/**
 * Размер картинки в кадре в процентах от кадра: она закрывает кадр целиком (как `object-fit: cover`), умноженная на
 * масштаб. `natural` — отношение сторон самой картинки (`null`, пока она не загружена: тогда она точно по кадру).
 */
export function coverSize(
  frame: number,
  natural: number | null,
  zoom: number,
): { width: number; height: number } {
  const ratio = natural ?? frame;
  const width = ratio >= frame ? (ratio / frame) * 100 : 100;
  const height = ratio >= frame ? 100 : (frame / ratio) * 100;

  return { width: width * zoom, height: height * zoom };
}

/** Положение картинки в кадре: `left` и `top` в процентах от кадра (отрицательные: картинка больше кадра). */
export function placement(
  crop: Crop,
  frame: number,
  natural: number | null,
): { left: number; top: number; width: number; height: number } {
  const size = coverSize(frame, natural, crop.zoom);

  return {
    ...size,
    left: -(crop.x / 100) * (size.width - 100),
    top: -(crop.y / 100) * (size.height - 100),
  };
}

/**
 * Сдвиг картинки пальцем или мышью: `dx`, `dy` — смещение в пикселях, `box` — размер кадра в пикселях. Картинка идёт
 * за указателем один к одному; там, где она не выходит за кадр, сдвига нет.
 */
export function panBy(
  crop: Crop,
  dx: number,
  dy: number,
  box: { readonly width: number; readonly height: number },
  frame: number,
  natural: number | null,
): Crop {
  const size = coverSize(frame, natural, crop.zoom);
  const overflowX = ((size.width - 100) / 100) * box.width;
  const overflowY = ((size.height - 100) / 100) * box.height;

  return {
    ...crop,
    x: overflowX > 0.5 ? clamp(crop.x - (dx / overflowX) * 100, 0, 100) : crop.x,
    y: overflowY > 0.5 ? clamp(crop.y - (dy / overflowY) * 100, 0, 100) : crop.y,
  };
}

/** Новый масштаб в пределах схемы. */
export const zoomed = (crop: Crop, zoom: number): Crop => ({
  ...crop,
  zoom: clamp(zoom, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX),
});
