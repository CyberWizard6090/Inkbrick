import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.husky/_/**',
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
    // Пространство имён z тянет весь zod (около 65 КБ gzip в приложении): внутри пакетов — только импорт по именам.
    files: ['packages/*/src/**/*.{ts,tsx}'],
    ignores: ['packages/document/src/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              importNames: ['z'],
              message:
                "Import zod functions by name (see packages/document/src/schema/zod.ts): 'z' pulls in all of zod.",
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
