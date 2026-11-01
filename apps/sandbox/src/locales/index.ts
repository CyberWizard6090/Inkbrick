import { getLocales, registerLocale } from '@inkbrick/react';

import { de } from './de';

registerLocale('de', de);

const STORAGE_KEY = 'inkbrick-sandbox-locale';

export const availableLocales = (): string[] => getLocales();

export function initialLocale(): string {
  let saved: string | null = null;

  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage может быть недоступен (приватный режим): язык просто не запоминается.
  }

  const wanted = new URLSearchParams(window.location.search).get('lang') ?? saved ?? 'en';

  return availableLocales().includes(wanted) ? wanted : 'en';
}

export function persistLocale(locale: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // см. выше
  }

  const url = new URL(window.location.href);

  url.searchParams.set('lang', locale);
  window.history.replaceState(null, '', url);
}

export function localeName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);

    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}
