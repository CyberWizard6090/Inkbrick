import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Публичный API пакетов под контролем: всё, что экспортирует вход пакета, записано в снимке
 * (`__snapshots__/public-api.test.ts.snap`). Новое имя, ставшее публичным случайно (через `export *`), или пропавшее
 * имя роняют тест; если изменение задумано — обновите снимок (`pnpm vitest run scripts -u`) и опишите его в
 * CHANGELOG. Внутренние механизмы движка — в `@inkbrick/engine/internal`, их список тоже здесь, но он не публичный
 * контракт.
 */

const ROOT = join(import.meta.dirname, '..', '..');

const ENTRIES = {
  '@inkbrick/document': 'packages/document/src/index.ts',
  '@inkbrick/document/markdown': 'packages/document/src/markdown.ts',
  '@inkbrick/store': 'packages/store/src/index.ts',
  '@inkbrick/engine': 'packages/engine/src/index.ts',
  '@inkbrick/engine/internal (not public)': 'packages/engine/src/internal.ts',
  '@inkbrick/dom': 'packages/dom/src/index.ts',
  '@inkbrick/spellcheck': 'packages/spellcheck/src/index.ts',
  '@inkbrick/locales': 'packages/locales/src/index.ts',
  '@inkbrick/react': 'packages/react/src/index.ts',
};

const files = Object.values(ENTRIES).map((file) => join(ROOT, file));
const { options } = ts.parseJsonConfigFileContent(
  ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  ROOT,
);
const program = ts.createProgram(files, { ...options, noEmit: true });
const checker = program.getTypeChecker();

/** Имена экспорта входа: `имя` — значение (функция, класс, константа), `type имя` — только тип. */
function exportsOf(file: string): string[] {
  const module = checker.getSymbolAtLocation(program.getSourceFile(join(ROOT, file))!)!;

  return checker
    .getExportsOfModule(module)
    .map((symbol) => {
      const target =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

      // `export type { X }` даёт только тип, даже если X — класс.
      const typeOnly = symbol.declarations?.some(
        (node) =>
          ts.isTypeOnlyImportOrExportDeclaration(node) ||
          (ts.isExportSpecifier(node) && node.parent.parent.isTypeOnly),
      );

      return target.flags & ts.SymbolFlags.Value && !typeOnly ? symbol.name : `type ${symbol.name}`;
    })
    .sort((a, b) => a.replace('type ', '').localeCompare(b.replace('type ', '')));
}

describe('public API of the packages', () => {
  for (const [name, file] of Object.entries(ENTRIES)) {
    it(name, () => {
      expect(exportsOf(file)).toMatchSnapshot();
    });
  }
});
