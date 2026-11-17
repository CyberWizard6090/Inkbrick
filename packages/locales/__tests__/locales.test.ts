import { describe, expect, it } from 'vitest';

import { en, localeLoaders } from '../src';

describe('@inkbrick/locales', () => {
  it('exports the English reference with the keys the editor uses', () => {
    expect(en['editor.hint']).toBe('Press / to open the menu');
    expect(Object.keys(en).length).toBeGreaterThan(200);
  });

  it('loads Russian on demand and it has the same keys as English', async () => {
    const ru = await localeLoaders.ru();

    expect(ru['editor.label']).toBe('Документ');
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('has a loader for every language except English, and none for English', () => {
    expect(Object.keys(localeLoaders)).toEqual(['ru']);
    expect(localeLoaders.en).toBeUndefined();
  });
});
