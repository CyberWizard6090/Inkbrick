import { describe, expect, it } from 'vitest';

import {
  CROP_ASPECTS,
  FULL_RECT,
  aspectRatio,
  clampRect,
  fitRatio,
  isCropAspect,
  isFullRect,
  isPortrait,
  landscapeOf,
  moveRect,
  oriented,
  pixelSize,
  relativeRatio,
  resizeRect,
  roundRect,
  type CropRect,
} from '../src';

const close = (actual: CropRect, expected: CropRect) => {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(actual[key]).toBeCloseTo(expected[key], 6);
  }
};

describe('shapes', () => {
  it('every ratio has a landscape and a portrait value; circle and square are 1:1', () => {
    expect(aspectRatio('free')).toBeNull();
    expect(aspectRatio('circle')).toBe(1);
    expect(aspectRatio('1:1')).toBe(1);
    expect(aspectRatio('16:9')).toBeCloseTo(16 / 9);
    expect(isPortrait('9:16')).toBe(true);
    expect(isPortrait('free')).toBe(false);

    expect(oriented('5:4', true)).toBe('4:5');
    expect(oriented('4:5', false)).toBe('5:4');
    expect(oriented('5:4', false)).toBe('5:4');
    expect(oriented('1:1', true)).toBe('1:1');
    expect(oriented('circle', true)).toBe('circle');

    expect(landscapeOf('3:5')).toBe('5:3');
    expect(landscapeOf('circle')).toBeNull();
    expect(CROP_ASPECTS.every(isCropAspect)).toBe(true);
    expect(isCropAspect('auto')).toBe(false);
  });

  it('a ratio in fractions of the picture accounts for the picture shape', () => {
    // Квадрат на картинке 2:1 занимает половину ширины и всю высоту.
    expect(relativeRatio('1:1', 2)).toBe(0.5);
    expect(relativeRatio('free', 2)).toBeNull();
  });
});

describe('moving and clamping', () => {
  it('the frame stays inside the picture', () => {
    expect(moveRect({ x: 0.5, y: 0.5, width: 0.4, height: 0.4 }, 0.5, -1)).toEqual({
      x: 0.6,
      y: 0,
      width: 0.4,
      height: 0.4,
    });
    expect(
      clampRect({ x: -1, y: 2, width: 3, height: 0.001 }, { width: 0.1, height: 0.1 }),
    ).toEqual({ x: 0, y: 0.9, width: 1, height: 0.1 });
  });
});

describe('resizing', () => {
  const rect = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

  it('free: the edges follow the pointer, the opposite edge stays', () => {
    close(resizeRect(rect, 'e', 0.1, 0.3, null), { x: 0.2, y: 0.2, width: 0.5, height: 0.4 });
    close(resizeRect(rect, 'nw', -0.1, -0.1, null), { x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
    // За край картинки и меньше наименьшего размера не уходит.
    close(resizeRect(rect, 'w', -1, 0, null), { x: 0, y: 0.2, width: 0.6, height: 0.4 });
    close(resizeRect(rect, 's', 0, -1, null, { width: 0.05, height: 0.05 }), {
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.05,
    });
  });

  it('a fixed ratio: a corner keeps the opposite corner, the size follows the larger move', () => {
    close(resizeRect(rect, 'se', 0.2, 0, 1), { x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
    close(resizeRect(rect, 'se', 0, -0.2, 1), { x: 0.2, y: 0.2, width: 0.2, height: 0.2 });
    close(resizeRect(rect, 'nw', -0.5, -0.5, 1), { x: 0, y: 0, width: 0.6, height: 0.6 });
    // Ограничивает ближайший край: справа места 0,4, снизу 0,4 → не больше 0,8 при 2:1 по высоте.
    close(resizeRect(rect, 'se', 1, 0, 2), { x: 0.2, y: 0.2, width: 0.8, height: 0.4 });
  });

  it('a fixed ratio: a side grows the other axis from the center of the frame', () => {
    close(resizeRect(rect, 'e', 0.2, 0, 1), { x: 0.2, y: 0.1, width: 0.6, height: 0.6 });
    close(resizeRect(rect, 'n', 0, -0.2, 1), { x: 0.1, y: 0, width: 0.6, height: 0.6 });
    close(resizeRect(rect, 'w', 0.3, 0, 1, { width: 0.1, height: 0.1 }), {
      x: 0.5,
      y: 0.35,
      width: 0.1,
      height: 0.1,
    });
    // Ширина упирается в высоту картинки: 1:1 не шире, чем картинка высока.
    close(resizeRect({ x: 0, y: 0, width: 0.5, height: 0.5 }, 's', 0, 1, 1), {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
});

describe('fitting a ratio', () => {
  it('the largest frame of the ratio, centered where the frame was', () => {
    close(fitRatio(FULL_RECT, 0.5), { x: 0.25, y: 0, width: 0.5, height: 1 });
    close(fitRatio(FULL_RECT, 2), { x: 0, y: 0.25, width: 1, height: 0.5 });
    close(fitRatio({ x: 0, y: 0, width: 0.2, height: 0.2 }, 0.5), {
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect(fitRatio(FULL_RECT, null)).toBe(FULL_RECT);
  });

  it('rounding, the whole picture and the size in pixels', () => {
    expect(roundRect({ x: 1 / 3, y: 0, width: 2 / 3, height: 1 })).toEqual({
      x: 0.3333,
      y: 0,
      width: 0.6667,
      height: 1,
    });
    expect(isFullRect(FULL_RECT)).toBe(true);
    expect(isFullRect({ x: 0, y: 0, width: 0.99, height: 1 })).toBe(false);
    expect(
      pixelSize({ x: 0, y: 0, width: 0.5, height: 0.001 }, { width: 401, height: 300 }),
    ).toEqual({ width: 201, height: 1 });
  });
});
