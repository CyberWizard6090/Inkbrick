/** Цвет в RGB: каналы 0–255, прозрачность `a` 0–1. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** Цвет в HSB (HSV): оттенок `h` 0–360, насыщенность `s` и яркость `v` 0–1, прозрачность `a` 0–1. */
export interface Hsva {
  readonly h: number;
  readonly s: number;
  readonly v: number;
  readonly a: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const HEX = /^#?([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;

/**
 * Разбирает цвет: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (решётка необязательна) или `rgb()` / `rgba()`. Что-то
 * другое — `null`.
 */
export function parseColor(value: string): Rgba | null {
  const text = value.trim();
  const hex = HEX.exec(text);

  if (hex) {
    let digits = hex[1];

    if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('');

    const channel = (at: number) => parseInt(digits.slice(at, at + 2), 16);

    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: digits.length === 8 ? channel(6) / 255 : 1,
    };
  }

  const rgb = RGB.exec(text);

  if (!rgb) return null;

  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);

  return {
    r: clamp(Math.round(Number(rgb[1])), 0, 255),
    g: clamp(Math.round(Number(rgb[2])), 0, 255),
    b: clamp(Math.round(Number(rgb[3])), 0, 255),
    a: clamp(alpha, 0, 1),
  };
}

const pair = (value: number) =>
  Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, '0');

/**
 * `#rrggbb`, а при прозрачности меньше 100 % — `#rrggbbaa`. С `alpha: 'always'` — всегда восемь цифр, с `'never'` —
 * всегда шесть.
 */
export function formatHex(
  { r, g, b, a }: Rgba,
  alpha: 'auto' | 'always' | 'never' = 'auto',
): string {
  const opacity = Math.round(clamp(a, 0, 1) * 255);
  const withAlpha = alpha === 'always' || (alpha === 'auto' && opacity < 255);

  return `#${pair(r)}${pair(g)}${pair(b)}${withAlpha ? pair(opacity) : ''}`;
}

export function rgbToHsv({ r, g, b, a }: Rgba): Hsva {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  let h = 0;

  if (delta > 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;

    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max, a };
}

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;
  const [red, green, blue] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255),
    a,
  };
}
