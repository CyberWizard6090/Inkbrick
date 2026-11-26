import { describe, expect, it } from 'vitest';

import base from '../src/base.css?raw';
import blocks from '../src/blocks.css?raw';
import imageTools from '../src/image-tools.css?raw';
import index from '../src/index.css?raw';
import tokens from '../src/tokens.css?raw';
import ui from '../src/ui.css?raw';

/** Части `ui.css` (`src/ui/*.css`) по имени файла: `ui/menus.css`. */
const UI_PARTS = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../src/ui/*.css', { query: '?raw', import: 'default', eager: true }),
  ).map(([path, css]) => [path.replace('../src/', ''), css]),
);

const SOURCES: Record<string, string> = {
  'index.css': index,
  'tokens.css': tokens,
  'base.css': base,
  'blocks.css': blocks,
  'ui.css': ui,
  'image-tools.css': imageTools,
  ...UI_PARTS,
};

const read = (file: string) => SOURCES[file].replace(/\/\*[\s\S]*?\*\//g, '');

function selectorsOf(css: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let buffer = '';
  let keyframesDepth = -1;

  for (const char of css) {
    if (char === '{') {
      const prelude = buffer.trim();

      if (prelude.startsWith('@keyframes')) keyframesDepth = depth;
      else if (!prelude.startsWith('@') && depth > 0 && keyframesDepth === -1)
        selectors.push(prelude);

      depth++;
      buffer = '';
    } else if (char === '}') {
      depth--;
      if (depth === keyframesDepth) keyframesDepth = -1;
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

const FILES = ['tokens.css', 'base.css', 'blocks.css', ...Object.keys(UI_PARTS), 'image-tools.css'];
const LAYERS: Record<string, string> = {
  'tokens.css': 'inkbrick.tokens',
  'base.css': 'inkbrick.base',
  'blocks.css': 'inkbrick.blocks',
  'image-tools.css': 'inkbrick.ui',
  ...Object.fromEntries(Object.keys(UI_PARTS).map((file) => [file, 'inkbrick.ui'])),
};

describe('@inkbrick/styles: стили не конкурируют со стилями приложения', () => {
  it.each(FILES)('%s целиком лежит в своём @layer', (file) => {
    const css = read(file).trim();

    expect(css.startsWith(`@layer ${LAYERS[file]} {`)).toBe(true);
    expect(css.endsWith('}')).toBe(true);
  });

  it('ui.css только подключает все части из ui/, и ничего больше', () => {
    const imports = [...read('ui.css').matchAll(/@import '\.\/(ui\/[\w-]+\.css)';/g)].map(
      (match) => match[1],
    );

    expect(
      read('ui.css')
        .replace(/@import '[^']+';/g, '')
        .trim(),
    ).toBe('');
    expect([...imports].sort()).toEqual(Object.keys(UI_PARTS).sort());
    expect(imports.length).toBeGreaterThan(5);
  });

  it('порядок слоёв объявлен в index.css до подключения файлов', () => {
    const css = read('index.css');

    expect(
      css.indexOf('@layer inkbrick.tokens, inkbrick.base, inkbrick.blocks, inkbrick.ui;'),
    ).toBeGreaterThan(-1);
    expect(css.indexOf('@layer')).toBeLessThan(css.indexOf('@import'));
  });

  it('предоставляет тёмную палитру с тёмными поверхностями и синим акцентом', () => {
    const css = read('tokens.css');

    expect(css).toContain(":where([data-inkbrick-theme='dark'])");
    expect(css).toContain('--inkbrick-bg-3: #080809;');
    expect(css).toContain('--inkbrick-bg-1: #111214;');
    expect(css).toContain('--inkbrick-brand-bg: #3478f6;');
  });

  it.each(FILES)('%s: каждый селектор обёрнут в :where() — нулевая специфичность', (file) => {
    const selectors = selectorsOf(read(file)).flatMap(splitSelectorList);
    const offenders = selectors.filter((selector) => !isWrappedInWhere(selector));

    expect(selectors.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it.each(FILES)('%s: псевдоэлемент стоит после :where(), а не внутри', (file) => {
    // Внутри :where() псевдоэлемент недопустим: браузер отбрасывает такое правило целиком.
    const offenders = selectorsOf(read(file)).filter((selector) =>
      /:where\((?:[^()]|\([^()]*\))*::/.test(selector),
    );

    expect(offenders).toEqual([]);
  });

  it.each(FILES)('%s не использует !important и классы разметки', (file) => {
    const css = read(file);

    expect(css).not.toContain('!important');
    // Публичный API стилизации — data-атрибуты; классы вида .inkbrick-* / .block-* остаются только для совместимости.
    expect(css).not.toMatch(/\.(inkbrick-|block-|image-|code-|list-|callout-|editable)/);
  });
});
