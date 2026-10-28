import { defineConfig } from '@playwright/test';
import path from 'node:path';

const outDir = path.resolve(process.env.ROOMSHIFT_DIST ?? 'dist');
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      chromiumSandbox: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    },
  },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort --outDir ${JSON.stringify(outDir)}`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
