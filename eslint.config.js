import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Направление зависимостей между пакетами: пакет импортирует только перечисленные (и не наоборот). Так ядро не узнает об
 * интерфейсе, а части на чистом DOM — ни о редакторе, ни о React. Новый пакет добавьте сюда.
 *
 *   document → store → engine ─┐
 *   locales ───────────────────┼→ react
 *   dom (без зависимостей) ────┘
 */
export const LAYERS = {
  document: [],
  store: ['document'],
  engine: ['document', 'store'],
  locales: [],
  dom: [],
  react: ['document', 'store', 'engine', 'locales', 'dom'],
};

const PACKAGES = Object.keys(LAYERS);

/** Запреты импорта для кода пакета `name`: чужие слои, React вне `react`, весь zod, песочница. */
function restrictionsFor(name, allowed) {
  const forbidden = PACKAGES.filter((other) => other !== name && !allowed.includes(other));
  const react = name === 'react' ? [] : ['react', 'react-dom', 'react/jsx-runtime'];

  return {
    paths: [
      {
        name: 'zod',
        importNames: ['z'],
        message:
          "Import zod functions by name (see packages/document/src/schema/zod.ts): 'z' pulls in all of zod.",
      },
      ...react.map((module) => ({
        name: module,
        message: `@inkbrick/${name} does not depend on React: only @inkbrick/react does.`,
      })),
    ],
    patterns: [
      {
        group: ['**/apps/**', 'sandbox'],
        message:
          'The library does not know about the sandbox (see CONTRIBUTING.md, "Where things live").',
      },
      ...(forbidden.length > 0
        ? [
            {
              group: forbidden.flatMap((other) => [`@inkbrick/${other}`, `@inkbrick/${other}/*`]),
              message: `@inkbrick/${name} may import only ${
                allowed.length > 0
                  ? allowed.map((other) => `@inkbrick/${other}`).join(', ')
                  : 'no other Inkbrick package'
              } (see LAYERS in eslint.config.js).`,
            },
          ]
        : []),
      {
        // Путь внутрь другого пакета в обход его имени: тоже нарушение слоёв.
        group: PACKAGES.filter((other) => other !== name).flatMap((other) => [
          `**/packages/${other}/**`,
          `**/${other}/src`,
          `**/${other}/src/**`,
        ]),
        message: 'Import other Inkbrick packages by name, not by a path into their folders.',
      },
    ],
  };
}

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.husky/_/**',
      // Справочник API, его собирает typedoc (`pnpm docs:api`).
      'docs/api/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // В коде пакетов `any` запрещён: он уходит в публичные типы. Где без него нельзя (списки блоков с разными props),
    // есть именованные алиасы `AnyBlockDefinition`, `AnyCommand` и т. п. с объяснением. Тестам и песочнице можно.
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Устаревшие глобальные функции: локальный помощник с тем же именем без импорта молча подменялся бы ими.
      'no-restricted-globals': ['error', 'escape', 'unescape'],
    },
  },
  // Слои пакетов: каждый импортирует только пакеты под собой (см. `LAYERS`), а React — только `react`.
  ...Object.entries(LAYERS).map(([name, allowed]) => ({
    files: [`packages/${name}/src/**/*.{ts,tsx}`],
    ignores: ['packages/document/src/index.ts'],
    rules: { 'no-restricted-imports': ['error', restrictionsFor(name, allowed)] },
  })),
  {
    // Песочница — потребитель библиотеки: только публичный вход пакетов (`@inkbrick/react`), без путей внутрь.
    files: ['apps/sandbox/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/packages/**', '@inkbrick/*/*'],
              message:
                'The sandbox uses the public entry of a package only: import from "@inkbrick/react", not from its internals.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
];
