// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { Editor } from '@inkbrick/engine';

import {
  DocumentView,
  EditorProvider,
  createTranslator,
  defaultSlashItems,
  en,
  filterSlashItems,
  getLocales,
  registerLocale,
  resolveMessages,
  ru,
} from '../src';
import { formatImageError, ImageError } from '../src/images/ImageError';
import { interpolate } from '../src/i18n/translate';
import { resolveSlashItems } from '../src/slash/defaultSlashItems';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('built-in dictionaries', () => {
  it('Russian translates every English key and nothing else', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps the same {placeholders} in every translation', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('has no empty strings', () => {
    for (const value of [...Object.values(en), ...Object.values(ru)]) expect(value).not.toBe('');
  });

  it('English keeps the exact slash-item texts the default items had', () => {
    for (const item of defaultSlashItems) {
      expect(en[`slash.item.${item.id}.title` as keyof typeof en]).toBe(item.title);
      expect(en[`slash.item.${item.id}.description` as keyof typeof en]).toBe(item.description);
    }
  });
});

describe('interpolate', () => {
  it('substitutes {name} and leaves unknown placeholders as they are', () => {
    expect(interpolate('Heading {level}', { level: 2 })).toBe('Heading 2');
    expect(interpolate('{a} and {b}', { a: 'x' })).toBe('x and {b}');
    expect(interpolate('no params {a}')).toBe('no params {a}');
  });
});

describe('resolveMessages', () => {
  it('uses English by default and for unknown codes', () => {
    expect(resolveMessages()).toEqual(en);
    expect(resolveMessages({ locale: 'xx' })).toEqual(en);
  });

  it('selects a dictionary by code, ignoring case', () => {
    expect(resolveMessages({ locale: 'RU' })['menu.delete']).toBe(ru['menu.delete']);
  });

  it('falls back from a regional code to the base language', () => {
    expect(resolveMessages({ locale: 'ru-RU' })['menu.delete']).toBe(ru['menu.delete']);
  });

  it('fills the gaps of a partial dictionary from English', () => {
    const messages = resolveMessages({
      locale: 'tt',
      locales: { tt: { 'menu.delete': 'Бетерү' } },
    });

    expect(messages['menu.delete']).toBe('Бетерү');
    expect(messages['menu.duplicate']).toBe(en['menu.duplicate']);
  });

  it('applies point overrides on top of the language, and ignores undefined values', () => {
    const messages = resolveMessages({
      locale: 'ru',
      messages: { 'menu.delete': 'Убрать', 'menu.duplicate': undefined },
    });

    expect(messages['menu.delete']).toBe('Убрать');
    expect(messages['menu.duplicate']).toBe(ru['menu.duplicate']);
  });

  it('per-editor dictionaries beat globally registered ones', () => {
    registerLocale('zz-global', { 'menu.delete': 'global' });

    expect(resolveMessages({ locale: 'zz-global' })['menu.delete']).toBe('global');
    expect(
      resolveMessages({ locale: 'zz-global', locales: { 'zz-global': { 'menu.delete': 'own' } } })[
        'menu.delete'
      ],
    ).toBe('own');
  });
});

describe('registerLocale', () => {
  it('connects a dictionary under a code and lists it', () => {
    registerLocale('de-test', { 'menu.delete': 'Löschen' });

    expect(getLocales()).toEqual(expect.arrayContaining(['en', 'ru', 'de-test']));
    expect(resolveMessages({ locale: 'de-test' })['menu.delete']).toBe('Löschen');
  });
});

describe('createTranslator', () => {
  it('translates with parameters', () => {
    const t = createTranslator(resolveMessages({ locale: 'ru' }));

    expect(t('block.callout.label', { tone: 'успех' })).toBe(
      'Стиль заметки: успех. Нажмите, чтобы изменить',
    );
  });
});

describe('slash items', () => {
  const t = createTranslator(resolveMessages({ locale: 'ru' }));

  it('are localized, keep English search words and are found by Russian ones', () => {
    const items = resolveSlashItems(undefined, t);
    const heading = items.find((item) => item.id === 'heading-1')!;

    expect(heading.title).toBe('Заголовок 1');
    expect(heading.keywords).toEqual(expect.arrayContaining(['h1', 'title', 'заголовок']));
    expect(filterSlashItems(items, 'цитат').map((item) => item.id)).toEqual(['quote']);
    expect(filterSlashItems(items, 'h1').map((item) => item.id)).toContain('heading-1');
  });

  it('English output equals the original default items', () => {
    const items = resolveSlashItems(undefined, createTranslator(en));

    expect(
      items.map(({ title, description, keywords }) => ({ title, description, keywords })),
    ).toEqual(
      defaultSlashItems.map(({ title, description, keywords }) => ({
        title,
        description,
        keywords,
      })),
    );
  });

  it('application items are not translated and still replace defaults by id', () => {
    const custom = { id: 'quote', title: 'My quote', flavour: 'block:quote' };
    const items = resolveSlashItems([custom], t);

    expect(items.find((item) => item.id === 'quote')).toBe(custom);
  });
});

describe('image errors', () => {
  const tRu = createTranslator(resolveMessages({ locale: 'ru' }));

  it('are shown translated by code, with parameters', () => {
    const error = new ImageError('type', 'Unsupported image type "image/svg+xml"', {
      type: 'image/svg+xml',
    });

    expect(error.message).toContain('Unsupported image type');
    expect(
      formatImageError({ message: error.message, code: error.code, params: error.params }, tRu),
    ).toBe('Неподдерживаемый тип изображения «image/svg+xml»');
  });

  it('errors of the application uploader are shown as they are', () => {
    expect(formatImageError({ message: 'Upload failed' }, tRu)).toBe('Upload failed');
    expect(formatImageError({ message: '' }, tRu)).toBe(ru['image.error.generic']);
  });
});

describe('EditorProvider', () => {
  const render = (props: Record<string, unknown>) =>
    renderToString(
      <EditorProvider editor={new Editor()} {...props}>
        <DocumentView />
      </EditorProvider>,
    );

  it('renders the English hint by default', () => {
    expect(render({})).toContain('data-hint="Press / to open the menu"');
  });

  it('renders the selected language', () => {
    expect(render({ locale: 'ru' })).toContain('data-hint="Нажмите «/», чтобы открыть меню"');
  });

  it('accepts a dictionary only for this editor, and point overrides', () => {
    const html = render({ locale: 'tlh', locales: { tlh: { 'editor.hint': 'qagh' } } });

    expect(html).toContain('data-hint="qagh"');
    expect(render({ locale: 'ru', messages: { 'editor.hint': 'Пишите' } })).toContain(
      'data-hint="Пишите"',
    );
  });
});
