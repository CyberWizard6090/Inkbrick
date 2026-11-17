import { describe, expect, it } from 'vitest';

import { keyBetween } from '../src';
import { keysBetween } from '../src/order';

describe('keysBetween', () => {
  it('gives ascending keys inside the bounds', () => {
    for (const [a, b] of [
      [null, null],
      ['a', null],
      [null, 'm'],
      ['a', 'b'],
      ['zzz', null],
    ] as const) {
      const keys = keysBetween(a, b, 200);

      expect(keys).toHaveLength(200);
      expect(new Set(keys).size).toBe(200);
      expect([...keys].sort()).toEqual(keys);

      if (a !== null) expect(keys[0] > a).toBe(true);
      if (b !== null) expect(keys[199] < b).toBe(true);
    }
  });

  it('keeps keys short when thousands of blocks are added in a row', () => {
    const keys = keysBetween(null, null, 20_000);

    expect(Math.max(...keys.map((key) => key.length))).toBeLessThanOrEqual(5);
    expect([...keys].sort()).toEqual(keys);
  });

  it('is what one call at a time cannot do: appending one by one grows the keys', () => {
    let key: string | null = null;

    for (let i = 0; i < 4000; i++) key = keyBetween(key, null);

    expect(key!.length).toBeGreaterThan(500);
  });

  it('returns nothing for zero', () => {
    expect(keysBetween('a', 'b', 0)).toEqual([]);
  });
});
