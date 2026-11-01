import { afterEach, describe, expect, it } from 'vitest';

import { createId } from '../src';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createId', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
  });

  it('returns unique v4 UUIDs', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId()));

    expect(ids.size).toBe(500);
    for (const id of ids) expect(UUID.test(id)).toBe(true);
  });

  it('works without crypto.randomUUID (http:// on a LAN address is not a secure context)', () => {
    const real = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: real.getRandomValues.bind(real) },
    });

    const id = createId();

    expect(UUID.test(id)).toBe(true);
    expect(createId()).not.toBe(id);
  });

  it('works even without crypto at all', () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });

    expect(UUID.test(createId())).toBe(true);
  });
});
