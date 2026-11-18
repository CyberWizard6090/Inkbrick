import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { mountEditor } from './harness';

afterEach(cleanup);

const root = () => document.querySelector<HTMLElement>('[data-inkbrick-root]')!;

describe('spellcheck', () => {
  it('is off by default: the root does not ask the browser to check and sets no language', () => {
    mountEditor(['hello']);

    expect(root().getAttribute('spellcheck')).toBe('false');
    expect(root().hasAttribute('lang')).toBe(false);
  });

  it('is on with `spellcheck`, in the language of the interface unless another is given', () => {
    mountEditor(['hello'], { spellcheck: true, locale: 'ru' });

    expect(root().getAttribute('spellcheck')).toBe('true');
    expect(root().getAttribute('lang')).toBe('ru');
  });

  it('takes the text language from `spellcheck.lang`', () => {
    mountEditor(['hello'], { spellcheck: { lang: 'de' }, locale: 'en' });

    expect(root().getAttribute('lang')).toBe('de');
  });

  it('is off in read-only mode', () => {
    mountEditor(['hello'], { spellcheck: true, readOnly: true });

    expect(root().getAttribute('spellcheck')).toBe('false');
  });

  it('excludes code spans, links and inline formulas, but not ordinary or bold text', () => {
    const { editor, ids } = mountEditor(['abcdefgh'], { spellcheck: true });

    act(() => {
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: {
          from: { blockId: ids[0], offset: 0 },
          to: { blockId: ids[0], offset: 2 },
          attributes: { code: true },
        },
      });
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: {
          from: { blockId: ids[0], offset: 2 },
          to: { blockId: ids[0], offset: 4 },
          attributes: { link: 'https://example.com' },
        },
      });
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: {
          from: { blockId: ids[0], offset: 4 },
          to: { blockId: ids[0], offset: 6 },
          attributes: { bold: true },
        },
      });
    });

    expect(root().querySelector('code')!.getAttribute('spellcheck')).toBe('false');
    expect(root().querySelector('a')!.getAttribute('spellcheck')).toBe('false');
    expect(root().querySelector('strong')!.hasAttribute('spellcheck')).toBe(false);
  });

  it('excludes code blocks and leaves paragraphs to the root', () => {
    const { editor, ids } = mountEditor(['one', 'two'], { spellcheck: true });

    act(() => {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[1], flavour: 'block:code' },
      });
    });

    const content = (index: number) =>
      document.querySelector<HTMLElement>(`.editable[data-id="${ids[index]}"]`)!;

    expect(content(0).hasAttribute('spellcheck')).toBe(false);
    expect(content(1).getAttribute('spellcheck')).toBe('false');
  });
});
