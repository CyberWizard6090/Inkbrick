import { describe, expect, it } from 'vitest';

import { fitWidths } from '../src/table/fitWidths';

const sum = (widths: readonly (number | null | undefined)[]) =>
  widths.reduce<number>((total, width) => total + (width ?? 0), 0);

describe('fitWidths', () => {
  it('leaves widths that fit as they are', () => {
    const widths = [100, 200, undefined];

    expect(fitWidths(widths, 500)).toBe(widths);
  });

  it('shrinks the set widths in proportion when they are wider than the page', () => {
    const fitted = fitWidths([300, 600, 300], 600);

    expect(sum(fitted)).toBeLessThanOrEqual(600);
    expect(fitted[1]).toBeGreaterThan(fitted[0] as number);
    expect(fitted[0]).toBe(fitted[2]);
  });

  it('keeps room for columns without a width: they are never pushed out of the page', () => {
    const fitted = fitWidths([400, 400, null, null], 500);

    expect(fitted[2]).toBeNull();
    expect(sum(fitted) + 2 * 40).toBeLessThanOrEqual(500);
  });

  it('never goes under the minimum width and takes the excess from the widest', () => {
    const fitted = fitWidths([1000, 45, 45, 45], 220);

    expect(Math.min(...(fitted as number[]))).toBeGreaterThanOrEqual(40);
    expect(sum(fitted)).toBeLessThanOrEqual(220);
    expect(fitted[0]).toBeGreaterThan(fitted[1] as number);
  });

  it('does nothing without a known page width', () => {
    const widths = [500, 500];

    expect(fitWidths(widths, Number.POSITIVE_INFINITY)).toBe(widths);
    expect(fitWidths(widths, 0)).toBe(widths);
  });
});
