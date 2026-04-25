import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config — 跑黑盒登录 → 浏览 → 登出 流程。
 *
 * 启动假设：
 *   - 本地 D1 已 apply migrations + sync 一次（CI workflow 处理；本地手动跑）
 *   - .dev.vars 含 ADMIN_PASSWORD=test-admin-pw / GUEST_PASSWORD=test-guest-pw / SESSION_SECRET（任意）
 *   - astro dev 跑在 4321
 *
 * 本地：先 `pnpm dev`，另起 `pnpm test:e2e`
 * CI：playwright-e2e.yml 用 webServer 自动起。
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: process.env.CI
    ? {
        command: 'pnpm dev --port 4321',
        url: 'http://localhost:4321/login',
        timeout: 60_000,
        reuseExistingServer: false,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
