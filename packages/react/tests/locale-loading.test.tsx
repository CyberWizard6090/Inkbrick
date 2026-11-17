import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { localeLoaders } from '@inkbrick/locales';

import { getLocales, isLocaleLoaded, preloadLocale, registerLocale, resolveMessages } from '../src';
import { mountEditor } from './harness';

afterEach(() => {
  cleanup();
  vi.resetModules();
});

/** Свежая копия модуля переводов: у неё ещё ничего не загружено, как в приложении при первом запуске. */
const fresh = () => {
  vi.resetModules();

  return import('../src/i18n/translate');
};

describe('languages that load on demand', () => {
  it('lists them before they are loaded, but only English is there at the start', async () => {
    const translate = await fresh();

    expect(translate.getLocales()).toEqual(expect.arrayContaining(['en', 'ru']));
    expect(translate.isLocaleLoaded('en')).toBe(true);
    expect(translate.isLocaleLoaded('ru')).toBe(false);
    // Пока язык не загружен, интерфейс на английском: недостающие ключи берутся из него.
    expect(translate.resolveMessages({ locale: 'ru' })['editor.label']).toBe('Document');
  });

  it('preloadLocale brings the translation in, once, and region codes load the base language', async () => {
    const translate = await fresh();

    await translate.preloadLocale('ru-RU');

    expect(translate.isLocaleLoaded('ru')).toBe(true);
    expect(translate.resolveMessages({ locale: 'ru' })['editor.label']).toBe('Документ');
    expect(translate.resolveMessages({ locale: 'ru-RU' })['editor.label']).toBe('Документ');

    await expect(translate.preloadLocale('ru')).resolves.toBeUndefined();
  });

  it('does nothing for English, an unknown code, or a language the application registered itself', async () => {
    const translate = await fresh();

    await translate.preloadLocale('en');
    await translate.preloadLocale('zz');
    expect(translate.isLocaleLoaded('zz')).toBe(false);

    translate.registerLocale('ru', { 'editor.label': 'Мой документ' });
    await translate.preloadLocale('ru');

    // Свой словарь не затирается загруженным.
    expect(translate.resolveMessages({ locale: 'ru' })['editor.label']).toBe('Мой документ');
  });

  it('lists English first, then the built-in languages, then the ones the application registered', async () => {
    const translate = await fresh();

    translate.registerLocale('zz-app', { 'editor.label': 'zz' });

    expect(translate.getLocales()).toEqual(['en', 'ru', 'zz-app']);
  });

  it('a registered language is listed once', () => {
    registerLocale('de-test', { 'editor.label': 'Dokument' });

    expect(getLocales().filter((code) => code === 'de-test')).toHaveLength(1);
    expect(getLocales().filter((code) => code === 'ru')).toHaveLength(1);
  });
});

describe('the provider and a language that is still loading', () => {
  const locales = localeLoaders as Record<string, () => Promise<Record<string, string>>>;

  it('shows English first and the translation when the language arrives', async () => {
    let arrive!: () => void;
    const gate = new Promise<void>((resolve) => (arrive = resolve));

    locales.xx = () => gate.then(() => ({ 'editor.hint': 'XX hint' }));

    expect(isLocaleLoaded('xx')).toBe(false);

    const { root } = mountEditor(['text'], { locale: 'xx' });
    const hint = () => root.querySelector('[data-hint]')?.getAttribute('data-hint');

    // Подсказка пустого блока: каретки нет — смотрим словарь через resolveMessages, пока язык не пришёл.
    expect(resolveMessages({ locale: 'xx' })['editor.hint']).toBe('Press / to open the menu');
    expect(hint() ?? 'Press / to open the menu').toBe('Press / to open the menu');

    await act(async () => {
      arrive();
      await preloadLocale('xx');
    });

    expect(isLocaleLoaded('xx')).toBe(true);
    expect(resolveMessages({ locale: 'xx' })['editor.hint']).toBe('XX hint');

    delete locales.xx;
  });
});
