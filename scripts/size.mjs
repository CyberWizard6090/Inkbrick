// Бюджет размера: сколько Inkbrick добавляет в бандл приложения (минификация + gzip, зависимости — внешние).
// Запуск: pnpm size. Превышение бюджета — ошибка (CI падает), чтобы размер не рос незаметно.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const pkg = (name) => fileURLToPath(new URL(`../packages/${name}/src/index.ts`, import.meta.url));

const alias = {
  '@inkbrick/document': pkg('document'),
  '@inkbrick/store': pkg('store'),
  '@inkbrick/engine': pkg('engine'),
  '@inkbrick/react': pkg('react'),
};
const external = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'temml', 'zod'];

const cases = [
  {
    name: 'document model',
    budget: 4,
    code: "import { createDocument, serializeDocument } from '@inkbrick/document'; console.log(createDocument, serializeDocument);",
  },
  {
    name: 'engine (headless editor)',
    budget: 16,
    code: "import { Editor } from '@inkbrick/engine'; console.log(Editor);",
  },
  {
    name: 'react: EditorProvider + DocumentView',
    budget: 64,
    code: "import { EditorProvider, DocumentView } from '@inkbrick/react'; import { Editor } from '@inkbrick/engine'; console.log(EditorProvider, DocumentView, Editor);",
  },
];

let failed = false;

for (const { name, budget, code } of cases) {
  const result = await build({
    stdin: { contents: code, resolveDir: process.cwd(), loader: 'ts' },
    alias,
    external,
    bundle: true,
    splitting: true,
    outdir: 'size-out',
    minify: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    metafile: true,
    logLevel: 'error',
  });
  const files = new Map(
    result.outputFiles.map((file) => [file.path.replace(/\\/g, '/'), file.contents]),
  );
  const outputs = result.metafile.outputs;
  const entry = Object.keys(outputs).find((path) => outputs[path].entryPoint);

  // Считаем только то, что грузится сразу: точку входа и её статические импорты (ленивые чанки — отдельно).
  const eager = new Set();
  const visit = (path) => {
    if (eager.has(path)) return;
    eager.add(path);
    for (const imported of outputs[path].imports)
      if (imported.kind === 'import-statement' && outputs[imported.path]) visit(imported.path);
  };
  visit(entry);

  const contentsOf = (path) =>
    [...files].find(([full]) => full.endsWith(path.replace(/^size-out\//, '')))[1];
  const sum = (paths) =>
    paths.reduce(
      (total, path) => {
        const bytes = contentsOf(path);
        return { min: total.min + bytes.length, gzip: total.gzip + gzipSync(bytes).length };
      },
      { min: 0, gzip: 0 },
    );
  const now = sum([...eager]);
  const lazy = sum(Object.keys(outputs).filter((path) => path.endsWith('.js') && !eager.has(path)));
  const gzip = now.gzip / 1024;
  const ok = gzip <= budget;

  failed ||= !ok;
  console.log(
    `${ok ? '✓' : '✗'} ${name}: ${(now.min / 1024).toFixed(1)} KB min, ${gzip.toFixed(1)} KB gzip (budget ${budget} KB)` +
      (lazy.min > 0 ? `; lazy chunks ${(lazy.gzip / 1024).toFixed(1)} KB gzip` : ''),
  );
}

if (failed) process.exitCode = 1;
