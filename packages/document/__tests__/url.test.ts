import { describe, expect, it } from 'vitest';

import { isSafeUrl, normalizeLinkUrl } from '../src';

describe('isSafeUrl', () => {
  it('allows web, mail, phone, relative paths and anchors', () => {
    for (const url of [
      'https://a.b/c?d=1',
      'http://x.y',
      'mailto:me@x.org',
      'tel:+123',
      '/docs',
      '#top',
    ]) {
      expect(isSafeUrl(url)).toBe(true);
    }
  });

  it('rejects script-capable and malformed values', () => {
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:1',
      'data:text/html,<b>',
      'vbscript:x',
      '',
      '  ',
      'java\nscript:1',
      'ftp://x',
      'https://a b',
    ]) {
      expect(isSafeUrl(url)).toBe(false);
    }
  });
});

describe('normalizeLinkUrl', () => {
  it('adds a scheme to bare domains and emails', () => {
    expect(normalizeLinkUrl(' example.com/path ')).toBe('https://example.com/path');
    expect(normalizeLinkUrl('me@site.org')).toBe('mailto:me@site.org');
    expect(normalizeLinkUrl('https://x.y')).toBe('https://x.y');
    expect(normalizeLinkUrl('/local')).toBe('/local');
  });

  it('returns null for empty or unsafe input', () => {
    expect(normalizeLinkUrl('')).toBeNull();
    expect(normalizeLinkUrl('   ')).toBeNull();
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('data:text/plain,x')).toBeNull();
  });
});
