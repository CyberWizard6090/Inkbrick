import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

function filesIn(dir: string): string[] {
  const out: string[] = [];

  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;

    const path = join(dir, name);

    if (statSync(path).isDirectory()) out.push(...filesIn(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }

  return out;
}

// Папка пакета без `src` (остаток сборки с другой ветки: только `dist` и `node_modules`) пропускается.
const packages = readdirSync(join(ROOT, 'packages'))
  .filter((name) => existsSync(join(ROOT, 'packages', name, 'src')))
  .flatMap((name) => filesIn(join(ROOT, 'packages', name, 'src')));
const sandbox = filesIn(join(ROOT, 'apps', 'sandbox', 'src'));

const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const importsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((match) => match[1]);
const where = (files: readonly string[], bad: (file: string, source: string) => boolean) =>
  files.filter((file) => bad(file, readFileSync(file, 'utf8'))).map((file) => relative(ROOT, file));

/**
 * Что где живёт (подробнее — CONTRIBUTING.md): пакеты — библиотека, песочница — демонстрация и её собственные данные,
 * строки и тестовые крючки. Библиотека о песочнице не знает; песочница пользуется только публичным API пакетов.
 */
describe('boundaries: the library and the sandbox', () => {
  it('packages never import from the sandbox or the apps folder', () => {
    const offenders = packages.flatMap((file) =>
      importsOf(file)
        .filter((source) => /(^|\/)apps\//.test(source) || source === 'sandbox')
        .map((source) => `${relative(ROOT, file)} → ${source}`),
    );

    expect(offenders).toEqual([]);
  });

  it('packages do not carry sandbox test hooks or names', () => {
    expect(where(packages, (_, text) => /__inkbrick|__counterEvents|Sandbox/.test(text))).toEqual(
      [],
    );
  });

  it('the sandbox imports packages only through their public entry', () => {
    const offenders = sandbox.flatMap((file) =>
      importsOf(file)
        .filter((source) => /packages\//.test(source) || /^@inkbrick\/[a-z]+\/.+/.test(source))
        .map((source) => `${relative(ROOT, file)} → ${source}`),
    );

    expect(offenders).toEqual([]);
  });

  it('the sandbox is the only place that sets window.__inkbrick (the hook the E2E tests read)', () => {
    const setters = where([...packages, ...sandbox], (_, text) =>
      /window\.__inkbrick\s*(\?\?=|=)|\(window\.__inkbrick\s*\?\?=/.test(text),
    );

    expect(setters.every((file) => file.startsWith('apps/sandbox/'))).toBe(true);
    expect(setters.length).toBeGreaterThan(0);
  });
});
