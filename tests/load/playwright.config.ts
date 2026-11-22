import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import base from '../../playwright.config';

// Замеры идут по собранной песочнице: в режиме разработки React в несколько раз медленнее и цифры ничего не значат.
const externalUrl = process.env.E2E_BASE_URL;
const baseURL = externalUrl ?? 'http://127.0.0.1:4173';

// Нагрузочные сценарии в браузере: только Chromium (в нём есть `longtask`), по одному, чтобы замеры не мешали друг другу.
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: '**/*.load.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: { ...base.use, baseURL },
  webServer: externalUrl
    ? undefined
    : {
        command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
