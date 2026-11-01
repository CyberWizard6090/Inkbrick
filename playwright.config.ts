import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL задан — тесты идут по уже запущенному приложению (Docker, CI), dev-сервер не стартует.
const externalUrl = process.env.E2E_BASE_URL;
const baseURL = externalUrl ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests/E2E',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    headless: process.env.PW_HEADED !== '1',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  webServer: externalUrl
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
