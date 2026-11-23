import { describe, expect, it } from 'vitest';

import {
  MAX_WIDTH,
  MIN_WIDTH,
  changedColumns,
  columnsToWrite,
  resized,
  roundWidths,
  widthRange,
} from '../src/table/controls/columnWidths';

describe('column width math', () => {
  it('a border between columns moves two neighbours and keeps their sum', () => {
    expect(resized([100, 100, 100], 0, 30, Infinity)).toEqual([130, 70, 100]);
    // Не уже минимума ни с одной стороны.
    expect(resized([100, 100, 100], 0, 500, Infinity)).toEqual([200 - MIN_WIDTH, MIN_WIDTH, 100]);
    expect(resized([100, 100, 100], 1, -500, Infinity)).toEqual([100, MIN_WIDTH, 200 - MIN_WIDTH]);
  });

  it('the right edge of the last column grows the table only while it fits the page', () => {
    expect(resized([100, 100], 1, 50, Infinity)).toEqual([100, 150]);
    expect(resized([100, 100], 1, 500, 260)).toEqual([100, 160]);
    // Сжать можно всегда, даже если таблица уже шире страницы.
    expect(resized([100, 300], 1, -100, 250)).toEqual([100, 200]);
    expect(resized([100, 100], 1, 5000, Infinity)[1]).toBe(MAX_WIDTH);
  });

  it('rounding keeps the total width', () => {
    const widths = [100.4, 100.4, 100.4, 99.8];

    expect(roundWidths(widths).reduce((a, b) => a + b, 0)).toBe(401);
    // Лишний пиксель достаётся столбцу с самой большой дробной частью; каждый отличается от исходного меньше чем на 1.
    expect(roundWidths([10.2, 10.2, 10.9])).toEqual([10, 10, 11]);
    widths.forEach((width, index) =>
      expect(Math.abs(roundWidths(widths)[index] - width)).toBeLessThan(1),
    );
  });

  it('writes every column while the table fits the page, only the changed ones when it was fitted', () => {
    expect(changedColumns([100, 100, 100], [130, 70, 100])).toEqual([0, 1]);
    expect(columnsToWrite([100, 100, 100], [130, 70, 100], Infinity)).toEqual([0, 1, 2]);
    expect(columnsToWrite([400, 400, 400], [430, 370, 400], 600)).toEqual([0, 1]);
    expect(columnsToWrite([100, 100], [100, 100], Infinity)).toEqual([]);
  });

  it('the slider range: up to the neighbour minimum, or up to the page for the last column', () => {
    expect(widthRange([100, 100, 100], 0, Infinity)).toEqual({
      min: MIN_WIDTH,
      max: 200 - MIN_WIDTH,
    });
    expect(widthRange([100, 100], 1, 260)).toEqual({ min: MIN_WIDTH, max: 160 });
  });
});
