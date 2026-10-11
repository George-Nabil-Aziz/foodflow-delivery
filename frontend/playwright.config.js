import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../backend');

const FRONTEND_PORT = 5174;
const BACKEND_PORT = 4100;

export const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
export const API_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Serial by design. Driver dispatch is a global background process: a second
  // worker's AVAILABLE driver would claim the offer this test is waiting for,
  // so parallelism would buy speed at the cost of meaningless failures.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  globalSetup: './e2e/global-setup.js',

  webServer: [
    {
      // --env-file loads .env.e2e first; dotenv.config() inside the app does
      // not overwrite what is already set, so the e2e values win.
      command: 'node --env-file=.env.e2e src/server.js',
      cwd: backendDir,
      url: `${API_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      cwd: here,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        VITE_DEV_PORT: String(FRONTEND_PORT),
        VITE_API_PROXY_TARGET: API_URL,
      },
    },
  ],
});
