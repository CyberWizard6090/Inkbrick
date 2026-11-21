/**
 * Геометрия рамки обрезки. Рамка хранится в долях картинки (0…1 по ширине и высоте), поэтому не зависит от размера, в
 * котором картинка показана: те же числа годятся и для окна обрезки, и для холста, и для документа.
 */

/** Рамка обрезки: левый верхний угол и размер в долях картинки. */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Вся картинка, без обрезки. */
export const FULL_RECT: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Форма рамки: `free` — любые пропорции, `circle` — круг (вписан в квадрат), остальные — ширина:высота. У каждой
 * пропорции есть альбомный (`5:4`) и книжный (`4:5`) вариант.
 */
export const CROP_ASPECTS = [
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

export type CropAspect = (typeof CROP_ASPECTS)[number];

/** Пропорции, у которых есть книжный и альбомный вариант, в альбомном виде (так их показывает меню форм). */
export const CROP_RATIOS = ['5:4', '4:3', '7:5', '3:2', '5:3', '16:9'] as const;

export type CropRatio = (typeof CROP_RATIOS)[number];

/** Стороны и углы рамки, за которые её тянут. */
export const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

export type CropHandle = (typeof CROP_HANDLES)[number];

export const isCropAspect = (value: unknown): value is CropAspect =>
  (CROP_ASPECTS as readonly unknown[]).includes(value);

/** Отношение ширины к высоте в пикселях (`null` у свободной формы). */
export function aspectRatio(aspect: CropAspect): number | null {
  if (aspect === 'free') return null;
  if (aspect === 'circle') return 1;

  const [width, height] = aspect.split(':').map(Number);

  return width / height;
}

/** Книжная ли пропорция (выше, чем шире). */
export const isPortrait = (aspect: CropAspect): boolean => (aspectRatio(aspect) ?? 1) < 1;

/** Та же пропорция в нужной ориентации: `5:4` ↔ `4:5`. Квадрат, круг и свободная форма не меняются. */
export function oriented(aspect: CropAspect, portrait: boolean): CropAspect {
  const ratio = aspectRatio(aspect);

  if (ratio === null || ratio === 1 || ratio < 1 === portrait) return aspect;

  const [width, height] = aspect.split(':');

  return `${height}:${width}` as CropAspect;
}

/** Альбомный вид пропорции (`4:5` → `5:4`); у остальных форм — `null`. */
export function landscapeOf(aspect: CropAspect): CropRatio | null {
  const landscape = oriented(aspect, false);

  return (CROP_RATIOS as readonly string[]).includes(landscape) ? (landscape as CropRatio) : null;
}

/**
 * Пропорция рамки в долях картинки: ширина рамки к её высоте, где обе меряются долями своей стороны картинки.
 * `imageRatio` — отношение сторон самой картинки.
 */
export function relativeRatio(aspect: CropAspect, imageRatio: number): number | null {
  const ratio = aspectRatio(aspect);

  return ratio === null ? null : ratio / imageRatio;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Наименьший размер рамки в долях картинки по каждой стороне. */
export interface MinSize {
  readonly width: number;
  readonly height: number;
}

const NO_MIN: MinSize = { width: 0, height: 0 };

/** Рамка в пределах картинки и не меньше наименьшего размера. */
export function clampRect(rect: CropRect, min: MinSize = NO_MIN): CropRect {
  const width = clamp(rect.width, Math.min(min.width, 1), 1);
  const height = clamp(rect.height, Math.min(min.height, 1), 1);

  return {
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height,
  };
}

/** Сдвиг рамки целиком (в долях картинки); за край картинки рамка не уходит. */
export const moveRect = (rect: CropRect, dx: number, dy: number): CropRect =>
  clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy });

/**
 * Рамка после того, как её сторону или угол потянули на `dx`, `dy` (доли картинки). `ratio` — пропорция рамки в долях
 * картинки (`relativeRatio`) или `null` для свободной формы. Противоположная сторона (угол) стоит на месте; у
 * пропорциональной рамки, которую тянут за сторону, вторая ось растёт от центра.
 */
export function resizeRect(
  rect: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  min: MinSize = NO_MIN,
): CropRect {
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  if (ratio === null) {
    const left = west ? clamp(rect.x + dx, 0, right - min.width) : rect.x;
    const end = east ? clamp(right + dx, left + min.width, 1) : right;
    const top = north ? clamp(rect.y + dy, 0, bottom - min.height) : rect.y;
    const foot = south ? clamp(bottom + dy, top + min.height, 1) : bottom;

    return { x: left, y: top, width: end - left, height: foot - top };
  }

  const smallest = Math.max(min.width, min.height * ratio);

  if ((west || east) && (north || south)) {
    // Угол: противоположный угол на месте; размер берётся по той оси, по которой потянули сильнее.
    const anchorX = east ? rect.x : right;
    const anchorY = south ? rect.y : bottom;
    const byWidth = rect.width + (east ? dx : -dx);
    const byHeight = (rect.height + (south ? dy : -dy)) * ratio;
    const wanted = Math.abs(dx) >= Math.abs(dy * ratio) ? byWidth : byHeight;
    const largest = Math.min(east ? 1 - anchorX : anchorX, (south ? 1 - anchorY : anchorY) * ratio);
    const width = clamp(wanted, Math.min(smallest, largest), largest);
    const height = width / ratio;

    return {
      x: east ? anchorX : anchorX - width,
      y: south ? anchorY : anchorY - height,
      width,
      height,
    };
  }

  if (west || east) {
    // Сторона слева или справа: ширина меняется, высота следует за ней от центра рамки.
    const anchorX = east ? rect.x : right;
    const largest = Math.min(east ? 1 - anchorX : anchorX, ratio);
    const width = clamp(rect.width + (east ? dx : -dx), Math.min(smallest, largest), largest);
    const height = width / ratio;
    const centerY = rect.y + rect.height / 2;

    return {
      x: east ? anchorX : anchorX - width,
      y: clamp(centerY - height / 2, 0, 1 - height),
      width,
      height,
    };
  }

  // Сторона сверху или снизу.
  const anchorY = south ? rect.y : bottom;
  const largestHeight = Math.min(south ? 1 - anchorY : anchorY, 1 / ratio);
  const height = clamp(
    rect.height + (south ? dy : -dy),
    Math.min(smallest / ratio, largestHeight),
    largestHeight,
  );
  const width = height * ratio;
  const centerX = rect.x + rect.width / 2;

  return {
    x: clamp(centerX - width / 2, 0, 1 - width),
    y: south ? anchorY : anchorY - height,
    width,
    height,
  };
}

/**
 * Рамка нужной пропорции (в долях картинки): самая большая, что помещается в картинку, с центром там же, где был центр
 * рамки `rect` (насколько позволяют края). Без пропорции рамка не меняется.
 */
export function fitRatio(rect: CropRect, ratio: number | null): CropRect {
  if (ratio === null) return rect;

  let width = Math.min(1, ratio);
  let height = width / ratio;

  if (height > 1) {
    height = 1;
    width = ratio;
  }

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  return clampRect({ x: centerX - width / 2, y: centerY - height / 2, width, height });
}

const EPSILON = 1e-4;

/** Рамка — вся картинка. */
export const isFullRect = (rect: CropRect): boolean =>
  rect.x < EPSILON && rect.y < EPSILON && rect.width > 1 - EPSILON && rect.height > 1 - EPSILON;

/** Рамка с округлёнными долями (по умолчанию до 0,0001): так она не тянет в документ шум от деления. */
export function roundRect(rect: CropRect, digits = 4): CropRect {
  const factor = 10 ** digits;
  const round = (value: number) => Math.round(value * factor) / factor;

  return clampRect({
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  });
}

/** Размер рамки в пикселях картинки. */
export function pixelSize(
  rect: CropRect,
  natural: { readonly width: number; readonly height: number },
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(rect.width * natural.width)),
    height: Math.max(1, Math.round(rect.height * natural.height)),
  };
}
