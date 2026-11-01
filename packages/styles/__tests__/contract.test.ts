import { describe, expect, it } from 'vitest';

import base from '../src/base.css?raw';
import blocks from '../src/blocks.css?raw';
import index from '../src/index.css?raw';
import tokens from '../src/tokens.css?raw';
import ui from '../src/ui.css?raw';

const SOURCES: Record<string, string> = {
  'index.css': index,
  'tokens.css': tokens,
  'base.css': base,
  'blocks.css': blocks,
  'ui.css': ui,
};

const read = (file: string) => SOURCES[file].replace(/\/\*[\s\S]*?\*\//g, '');

function selectorsOf(css: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let buffer = '';

  for (const char of css) {
    if (char === '{') {
      const prelude = buffer.trim();

      if (!prelude.startsWith('@') && depth > 0) selectors.push(prelude);

      depth++;
      buffer = '';
    } else if (char === '}') {
      depth--;
      buffer = '';
    } else if (char === ';') {
      buffer = '';
    } else {
      buffer += char;
    }
  }

  return selectors;
}

function splitSelectorList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of list) {
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  parts.push(current.trim());

  return parts;
}

function isWrappedInWhere(selector: string): boolean {
  if (!selector.startsWith(':where(')) return false;

  let depth = 0;

  for (let i = 0; i < selector.length; i++) {
    if (selector[i] === '(') depth++;

    if (selector[i] === ')') {
      depth--;

      if (depth === 0) return /^(::?[a-z-]+(\([a-z-]+\))?)?$/.test(selector.slice(i + 1));
    }
  }

  return false;
}

const FILES = ['tokens.css', 'base.css', 'blocks.css', 'ui.css'];
const LAYERS: Record<string, string> = {
  'tokens.css': 'inkbrick.tokens',
  'base.css': 'inkbrick.base',
  'blocks.css': 'inkbrick.blocks',
  'ui.css': 'inkbrick.ui',
};

describe('@inkbrick/styles: стили не конкурируют со стилями приложения', () => {
  it.each(FILES)('%s целиком лежит в своём @layer', (file) => {
    const css = read(file).trim();

    expect(css.startsWith(`@layer ${LAYERS[file]} {`)).toBe(true);
    expect(css.endsWith('}')).toBe(true);
  });

  it('порядок слоёв объявлен в index.css до подключения файлов', () => {
    const css = read('index.css');

    expect(
      css.indexOf('@layer inkbrick.tokens, inkbrick.base, inkbrick.blocks, inkbrick.ui;'),
    ).toBeGreaterThan(-1);
    expect(css.indexOf('@layer')).toBeLessThan(css.indexOf('@import'));
  });

  it.each(FILES)('%s: каждый селектор обёрнут в :where() — нулевая специфичность', (file) => {
    const selectors = selectorsOf(read(file)).flatMap(splitSelectorList);
    const offenders = selectors.filter((selector) => !isWrappedInWhere(selector));

    expect(selectors.length).toBeGreaterThan(3);
    expect(offenders).toEqual([]);
  });

  it.each(FILES)('%s не использует !important и классы разметки', (file) => {
    const css = read(file);

    expect(css).not.toContain('!important');
    // Публичный API стилизации — data-атрибуты; классы вида .inkbrick-* / .block-* остаются только для совместимости.
    expect(css).not.toMatch(/\.(inkbrick-|block-|image-|code-|list-|callout-|editable)/);
  });
});
