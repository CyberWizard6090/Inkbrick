import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';

import { createTranslator, resolveMessages, registerLocale } from '../src';

afterEach(cleanup);

describe('the dictionary of the provider adds to the connected language instead of replacing it', () => {
  it('own keys win, the rest comes from the connected language, then from English', () => {
    registerLocale('xx', { 'editor.label': 'Document XX', 'editor.hint': 'Hint XX' });

    const t = createTranslator(
      resolveMessages({
        locale: 'xx',
        locales: { xx: { 'editor.hint': 'Own hint', 'app.key': 'App' } },
      }),
    );

    expect(t('editor.hint')).toBe('Own hint');
    expect(t('editor.label')).toBe('Document XX');
    expect(t('block.list.done')).toBe('Done');
    expect(t('app.key' as never)).toBe('App');
  });

  it('a key that is nowhere comes back as itself', () => {
    expect(createTranslator(resolveMessages())('no.such.key' as never)).toBe('no.such.key');
  });
});
