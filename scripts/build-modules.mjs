// Сборка JavaScript пакета «модуль на файл»: каждый `src/**/*.ts(x)` становится своим `dist/**/*.js`, относительные
// импорты получают расширение (`./x` → `./x.js`, `./dir` → `./dir/index.js`), чтобы пакет работал и в Node без сборщика.
//
// Зачем не склеивать пакет в один файл (как делает tsup): склеенный файл сборщик приложения может только частично
// очистить от неиспользуемого — вызовы верхнего уровня (`createContext`, `lazyModule`, `memo`) остаются вместе со всем,
// на что они ссылаются, а заодно статическими становятся и модули, которые иначе грузятся лениво. По модулю на файл с
// `sideEffects: false` сборщик выбрасывает неиспользуемые модули целиком — так же, как из исходников.
//
// Типы (`.d.ts`) по-прежнему собирает tsup (`dts: { only: true }`); запускается после него: `tsup && node build-modules.mjs`.
//
//   node ../../scripts/build-modules.mjs            — из каталога пакета
import { build } from 'esbuild';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const src = join(root, 'src');
const outdir = join(root, 'dist');

const walk = (dir, accept) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) return walk(path, accept);

    return accept(name) ? [path] : [];
  });

const sources = walk(
  src,
  (name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') && !/\.(test|spec)\./.test(name),
);

await build({
  entryPoints: sources,
  outdir,
  outbase: src,
  bundle: false,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  // Кириллица в словарях — как есть, без \uXXXX: строки короче, приложение легче.
  charset: 'utf8',
  // Исходники и так лежат в пакете (`src`): карта ссылается на них, а не встраивает текст второй раз.
  sourcemap: true,
  sourcesContent: false,
  logLevel: 'warning',
});

// Относительный импорт без расширения → файл или index.js каталога. Не найдено — ошибка: пакет был бы сломан.
const SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bexport\s*\*\s*from\s*)(["'])(\.{1,2}\/[^"']*)\2/g;
const broken = [];

for (const file of walk(outdir, (name) => name.endsWith('.js'))) {
  const code = readFileSync(file, 'utf8');
  const fixed = code.replace(SPECIFIER, (match, before, quote, specifier) => {
    if (/\.(m?js|css|json)$/.test(specifier)) return match;

    const target = resolve(dirname(file), specifier);
    const resolved = existsSync(`${target}.js`)
      ? `${specifier}.js`
      : existsSync(join(target, 'index.js'))
        ? `${specifier.replace(/\/$/, '')}/index.js`
        : null;

    if (!resolved) {
      broken.push(`${file}: ${specifier}`);
      return match;
    }

    return `${before}${quote}${resolved}${quote}`;
  });

  if (fixed !== code) writeFileSync(file, fixed);
}

if (broken.length > 0) {
  console.error(`Unresolved relative imports:\n${broken.join('\n')}`);
  process.exit(1);
}
