import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import {
  WordCount,
  countCharacters,
  countWords,
  documentStats,
  selectionStats,
  statsOf,
} from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

describe('counting words and characters', () => {
  it('counts words the way they are read, in any alphabet', () => {
    expect(countWords('Hello, world!')).toBe(2);
    expect(countWords('Привет, мир! Это тест.')).toBe(4);
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
    expect(countWords('... — !')).toBe(0);
  });

  it('keeps apostrophes, hyphens and numbers inside one word', () => {
    expect(countWords("don't stop-gap well-known")).toBe(3);
    expect(countWords('3.14 and 1,000')).toBe(3);
    expect(countWords('end.Next')).toBe(2);
  });

  it('finds words in scripts written without spaces', () => {
    expect(countWords('日本語のテキスト')).toBeGreaterThan(1);
    expect(countWords('hello 世界')).toBeGreaterThanOrEqual(2);
  });

  it('counts characters as code points and can leave spaces out', () => {
    expect(countCharacters('😀 ok')).toBe(4);
    expect(countCharacters('😀 ok', false)).toBe(3);
    expect(statsOf('a b\nc')).toEqual({ words: 3, characters: 5, charactersNoSpaces: 3 });
  });

  it('ignores formulas: they are neither words nor characters', () => {
    expect(statsOf('a￼b')).toEqual({ words: 2, characters: 2, charactersNoSpaces: 2 });
  });
});

describe('document and selection statistics', () => {
  it('counts the whole document block by block: words do not cross a block', () => {
    const { editor } = mountEditor(['one two', 'three', 'four']);

    expect(documentStats(editor)).toEqual({ words: 4, characters: 16, charactersNoSpaces: 15 });
  });

  it('can leave code out', () => {
    const { editor, ids } = mountEditor(['one two', 'const a = 1']);

    act(() => {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[1], flavour: 'block:code', props: {} },
      });
    });

    expect(documentStats(editor).words).toBeGreaterThan(
      documentStats(editor, { code: false }).words,
    );
    expect(documentStats(editor, { code: false }).words).toBe(2);
  });

  it('counts a selection inside a block and across blocks, and nothing for a caret', () => {
    const { editor, ids } = mountEditor(['one two three', 'four five']);
    const point = (blockId: string, offset: number) => ({ blockId, offset });

    expect(
      selectionStats(editor, { from: point(ids[0], 4), to: point(ids[0], 7), collapsed: false }),
    ).toEqual({ words: 1, characters: 3, charactersNoSpaces: 3 });

    // «two three» + «four» = 3 слова
    expect(
      selectionStats(editor, { from: point(ids[0], 4), to: point(ids[1], 4), collapsed: false }),
    ).toEqual({ words: 3, characters: 13, charactersNoSpaces: 12 });

    expect(
      selectionStats(editor, { from: point(ids[0], 2), to: point(ids[0], 2), collapsed: true }),
    ).toBeNull();
    expect(selectionStats(editor, null)).toBeNull();
  });
});

describe('<WordCount />', () => {
  const later = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  const text = () => document.querySelector('[data-testid="word-count"]')!.textContent;

  it('shows the words and characters and follows the document', async () => {
    const { editor, ids } = mountEditor(['one two'], { extra: <WordCount delay={0} /> });

    await later();
    expect(text()).toBe('Words: 2Characters: 7');

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[0], from: 7, to: 7, text: ' three' },
      });
    });
    await later();

    expect(text()).toBe('Words: 3Characters: 13');
  });

  it('shows the selection against the whole document and the count without spaces in the tooltip', async () => {
    const { select, ids } = mountEditor(['one two three'], { extra: <WordCount delay={0} /> });

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 7 });
    await later();

    expect(text()).toBe('Words: 2 of 3Characters: 7 of 13');
    expect(document.querySelector('[data-testid="word-count"]')!.getAttribute('title')).toBe(
      'Characters without spaces: 6',
    );
  });

  it('speaks Russian when the locale is Russian', async () => {
    mountEditor(['раз два'], { extra: <WordCount delay={0} />, locale: 'ru' });

    await later();
    expect(text()).toBe('Слов: 2Символов: 7');
  });

  it('is a plain element, not a live region: it must not add a "status" role to the page', async () => {
    mountEditor(['one two'], { extra: <WordCount delay={0} /> });

    await later();

    const element = document.querySelector('[data-testid="word-count"]')!;

    expect(element.tagName).toBe('SPAN');
    expect(element.getAttribute('role')).toBeNull();
    expect(document.querySelectorAll('output, [role="status"], [aria-live]')).toHaveLength(0);
  });
});
