import { describe, expect, it } from 'vitest';

import { en as editorEn } from '../../packages/locales/src/en';
import { en as sandboxEn } from '../../apps/sandbox/src/i18n/en';
import { ru as sandboxRu } from '../../apps/sandbox/src/i18n/ru';
import { de } from '../../apps/sandbox/src/locales/de';

type Dictionary = Readonly<Record<string, string | undefined>>;

const PLACEHOLDER = /\{(\w+)\}/g;
const CYRILLIC = /[а-яё]/i;

/** Есть ли в строке слова: «{rows} × {columns}» состоит из одних подстановок и на всех языках одинакова. */
const hasWords = (value: string) => /[A-Za-z]/.test(value.replace(PLACEHOLDER, ''));

const placeholders = (value: string) => [...value.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

/**
 * Значения, которые одинаковы на всех языках по смыслу: названия форматов и сокращения. Остальное, что совпадает с
 * английским, — вероятно, непереведённая строка.
 */
const SAME_ON_ALL_LANGUAGES = /^(?:[A-Za-z0-9+#.\-/ ]{1,12}|.*(?:Markdown|JSON|LaTeX|HTML).*)$/;

interface Pair {
  readonly name: string;
  readonly en: Dictionary;
  readonly ru: Dictionary;
}

/** Все языки пакета словарей: файл `packages/locales/src/<код>.ts` с экспортом `<код>`. Новый язык проверяется сам. */
const editorLanguages = import.meta.glob<Record<string, Dictionary>>(
  '../../packages/locales/src/*.ts',
  {
    eager: true,
  },
);

const PAIRS: readonly Pair[] = [
  ...Object.entries(editorLanguages)
    .map(([path, module]) => ({
      code: path.slice(path.lastIndexOf('/') + 1, -'.ts'.length),
      module,
    }))
    .filter(({ code }) => code !== 'index' && code !== 'en')
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(({ code, module }) => ({
      name: `editor (@inkbrick/locales, ${code})`,
      en: editorEn,
      ru: module[code],
    })),
  { name: 'sandbox (apps/sandbox)', en: sandboxEn, ru: sandboxRu },
];

describe.each(PAIRS)('dictionaries: $name', ({ en, ru }) => {
  const keys = Object.keys(en);

  it('has the same keys in en and ru', () => {
    expect(Object.keys(ru).sort()).toEqual([...keys].sort());
  });

  it('has no empty or untrimmed values', () => {
    for (const [name, dictionary] of [
      ['en', en],
      ['ru', ru],
    ] as const) {
      const bad = Object.entries(dictionary).filter(
        ([, value]) => typeof value !== 'string' || value === '' || value !== value.trim(),
      );

      expect(bad.map(([key]) => `${name}: ${key}`)).toEqual([]);
    }
  });

  it('keeps the {placeholders} of every string in the translation', () => {
    const broken = keys.filter(
      (key) => placeholders(en[key]!).join() !== placeholders(ru[key] ?? '').join(),
    );

    expect(broken).toEqual([]);
  });

  it('has no string left untranslated in ru', () => {
    const untranslated = keys.filter(
      (key) =>
        en[key] === ru[key] &&
        hasWords(en[key]!) &&
        !SAME_ON_ALL_LANGUAGES.test(en[key]!) &&
        !CYRILLIC.test(ru[key] ?? ''),
    );

    expect(untranslated).toEqual([]);
  });

  it('has no Cyrillic in the English dictionary', () => {
    expect(keys.filter((key) => CYRILLIC.test(en[key]!))).toEqual([]);
  });
});

describe('dictionaries: editor and sandbox stay apart', () => {
  it('shares no key: editor strings belong to the package, sandbox strings to the sandbox', () => {
    const editorKeys = new Set(Object.keys(editorEn));
    const shared = Object.keys(sandboxEn).filter((key) => editorKeys.has(key));

    expect(shared).toEqual([]);
  });

  it('the sandbox does not translate editor strings and the editor has no sandbox ones', () => {
    // Строки демонстрации (меню песочницы, Debug-панель) в пакет не попадают: он их не использует.
    const sandboxOnly = Object.keys(editorEn).filter((key) =>
      /^(?:nav|debug|tools|settings|theme|demo|app|notice|reset|counter|shortcuts)\./.test(key),
    );

    expect(sandboxOnly).toEqual([]);
  });
});

describe('the German example dictionary (partial on purpose)', () => {
  const keys = Object.keys(de);

  it('only translates keys that exist in the editor dictionary', () => {
    expect(keys.filter((key) => !(key in editorEn))).toEqual([]);
  });

  it('keeps the {placeholders} and has no empty values', () => {
    const bad = keys.filter((key) => {
      const value = (de as Dictionary)[key];

      return (
        typeof value !== 'string' ||
        value === '' ||
        placeholders(value).join() !== placeholders(editorEn[key as keyof typeof editorEn]).join()
      );
    });

    expect(bad).toEqual([]);
  });
});
