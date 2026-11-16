import { describe, expect, it } from 'vitest';

import { matchInlineMarkdown } from '../src/editing/markdownInline';

const attributesOf = (text: string, typed: string) => matchInlineMarkdown(text, typed)?.attributes;

describe('matchInlineMarkdown', () => {
  it('recognises bold, italic, strike and code when the closing marker is typed', () => {
    expect(attributesOf('say **hi*', '*')).toEqual({ bold: true });
    expect(attributesOf('__hi_', '_')).toEqual({ bold: true });
    expect(attributesOf('a *hi', '*')).toEqual({ italic: true });
    expect(attributesOf('a _hi', '_')).toEqual({ italic: true });
    expect(attributesOf('~gone', '~')).toBeUndefined();
    expect(attributesOf('~~gone~', '~')).toEqual({ strike: true });
    expect(attributesOf('run `ls -la', '`')).toEqual({ code: true });
  });

  it('reports what to delete: opening and already typed closing characters', () => {
    expect(matchInlineMarkdown('say **hi*', '*')).toMatchObject({
      start: 4,
      open: 2,
      close: 1,
      length: 2,
    });
    expect(matchInlineMarkdown('*hi', '*')).toMatchObject({
      start: 0,
      open: 1,
      close: 0,
      length: 2,
    });
  });

  it('leaves ordinary text alone', () => {
    expect(matchInlineMarkdown('2 * 3 ', '*')).toBeNull();
    expect(matchInlineMarkdown('a * b *', '*')).toBeNull();
    expect(matchInlineMarkdown('snake_case_nam', 'e')).toBeNull();
    expect(matchInlineMarkdown('snake_case', '_')).toBeNull();
    expect(matchInlineMarkdown('**', '*')).toBeNull();
    expect(matchInlineMarkdown('* *', '*')).toBeNull();
    expect(matchInlineMarkdown('**bold*', '*')?.attributes).toEqual({ bold: true });
    expect(matchInlineMarkdown('**bo*', 'x')).toBeNull();
  });

  it('does not take the first star of a bold pair for italic', () => {
    expect(matchInlineMarkdown('**bold', '*')).toBeNull();
  });

  it('keeps spaces inside code', () => {
    expect(matchInlineMarkdown('`a b', '`')).toMatchObject({ length: 3 });
    expect(matchInlineMarkdown('``', '`')).toBeNull();
  });

  it('recognises links with a safe address', () => {
    expect(matchInlineMarkdown('see [docs](https://example.com', ')')).toMatchObject({
      start: 4,
      open: 1,
      close: 'docs](https://example.com'.length - 'docs'.length,
      length: 4,
      attributes: { link: 'https://example.com' },
    });
    expect(matchInlineMarkdown('[x](javascript:alert(1', ')')).toBeNull();
    expect(matchInlineMarkdown('[x](a b', ')')).toBeNull();
  });
});
