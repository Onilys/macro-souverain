import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: '*.browser.e2e.ts',
  outputDir: '/tmp/macro-group-pagination-results',
  workers: 1,
  // Real Task views import the app graph, including asynchronous collaboration WASM.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  projects: [
    { name: 'desktop', use: { viewport: { width: 800, height: 700 } } },
    {
      name: 'phone',
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'tablet',
      use: {
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:3027',
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command:
      'bunx vite --config src/features/next-soup/browser-test/vite.config.ts',
    cwd: fileURLToPath(new URL('../../../..', import.meta.url)),
    url: 'http://127.0.0.1:3027',
    reuseExistingServer: false,
  },
});
