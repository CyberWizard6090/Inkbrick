import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CROP,
  coverSize,
  cropOf,
  cropProps,
  frameRatio,
  isDefaultCrop,
  panBy,
  placement,
  zoomed,
} from '../src/images/crop';

describe('crop math', () => {
  it('the frame ratio is set by the aspect, or comes from the picture for the original', () => {
    expect(frameRatio('16:9', 2)).toBeCloseTo(16 / 9, 5);
    expect(frameRatio('1:1', null)).toBe(1);
    expect(frameRatio('auto', 2)).toBe(2);
    expect(frameRatio('auto', null)).toBeCloseTo(16 / 9, 5);
  });

  it('the picture covers the frame: a wide one to the frame height, a tall one to the width', () => {
    // 2:1 в квадрате: по высоте точно кадр, по ширине вдвое больше.
    expect(coverSize(1, 2, 1)).toEqual({ width: 200, height: 100 });
    // 1:2 в квадрате: по ширине кадр, по высоте вдвое больше.
    expect(coverSize(1, 0.5, 1)).toEqual({ width: 100, height: 200 });
    // Масштаб умножает оба размера.
    expect(coverSize(1, 2, 2)).toEqual({ width: 400, height: 200 });
    // Пока картинка не загружена, она точно по кадру.
    expect(coverSize(1.5, null, 1)).toEqual({ width: 100, height: 100 });
  });

  it('the placement shows the center by default and the edges at 0 and 100', () => {
    const center = placement(DEFAULT_CROP, 1, 2);

    expect(center).toMatchObject({ width: 200, height: 100, left: -50, top: -0 });

    expect(placement({ ...DEFAULT_CROP, x: 0 }, 1, 2).left).toBe(-0);
    expect(placement({ ...DEFAULT_CROP, x: 100 }, 1, 2).left).toBe(-100);
  });

  it('dragging moves the picture one to one with the pointer', () => {
    const box = { width: 300, height: 300 };
    // Картинка 2:1 в квадрате 300 × 300: её ширина 600, выступает на 300 пикселей.
    const moved = panBy({ ...DEFAULT_CROP, aspect: '1:1' }, -150, 0, box, 1, 2);

    // Сдвиг влево на 150 пикселей показывает правую часть: из 300 пикселей запаса 150 — половина.
    expect(moved.x).toBeCloseTo(100, 5);
    expect(panBy(moved, 9999, 0, box, 1, 2).x).toBe(0);
    // По высоте картинка точно по кадру, запаса нет: сдвига нет.
    expect(panBy(DEFAULT_CROP, 0, 80, box, 1, 2).y).toBe(50);
  });

  it('the zoom stays within the limits of the schema', () => {
    expect(zoomed(DEFAULT_CROP, 99).zoom).toBe(5);
    expect(zoomed(DEFAULT_CROP, 0.1).zoom).toBe(1);
    expect(zoomed(DEFAULT_CROP, 2.5).zoom).toBe(2.5);
  });

  it('reads the props of a block and replaces wrong values', () => {
    expect(cropOf({})).toEqual(DEFAULT_CROP);
    expect(cropOf({ aspect: '4:3', zoom: 2, cropX: 10, cropY: 90 })).toEqual({
      aspect: '4:3',
      zoom: 2,
      x: 10,
      y: 90,
    });
    expect(cropOf({ aspect: 'diagonal', zoom: 'x', cropX: 500, cropY: -5 })).toEqual({
      ...DEFAULT_CROP,
      aspect: 'auto',
      x: 100,
      y: 0,
    });
    expect(isDefaultCrop(DEFAULT_CROP)).toBe(true);
    expect(isDefaultCrop({ ...DEFAULT_CROP, zoom: 1.5 })).toBe(false);
  });

  it('writes the crop rounded, including the defaults, so a reset overwrites the old values', () => {
    expect(cropProps({ aspect: '1:1', zoom: 1.23456, x: 33.3333, y: 50 })).toEqual({
      aspect: '1:1',
      zoom: 1.23,
      cropX: 33.3,
      cropY: 50,
    });
    expect(cropProps(DEFAULT_CROP)).toEqual({ aspect: 'auto', zoom: 1, cropX: 50, cropY: 50 });
  });
});
