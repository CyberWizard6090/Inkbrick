import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { en, localeLoaders } from '../src';

/** Файлы языков пакета: всё в `src`, кроме входа и английского эталона (`ru.ts` → `ru`). */
const languages = readdirSync(fileURLToPath(new URL('../src', import.meta.url)))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.slice(0, -'.ts'.length))
  .filter((code) => code !== 'index' && code !== 'en')
  .sort();

describe('@inkbrick/locales', () => {
  it('exports the English reference with the keys the editor uses', () => {
    expect(en['editor.hint']).toBe('Press / to open the menu');
    expect(Object.keys(en).length).toBeGreaterThan(200);
  });

  it('has a loader for every language file, none for English and none without a file', () => {
    expect(languages.length).toBeGreaterThan(0);
    expect(Object.keys(localeLoaders).sort()).toEqual(languages);
    expect(localeLoaders.en).toBeUndefined();
  });

  it.each(languages)('loads %s on demand with the same keys as English', async (code) => {
    const dictionary = await localeLoaders[code]();

    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort());
  });

  it('loads Russian', async () => {
    expect((await localeLoaders.ru())['editor.label']).toBe('Документ');
  });
});
