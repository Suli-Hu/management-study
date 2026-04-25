import { test, expect } from '@playwright/test';

/**
 * Auth E2E — password 模式（CI/dev 环境）
 *   登录 → 进首页 → 退出 → 回 /login
 *
 * 前提：.dev.vars 里 ADMIN_PASSWORD=test-admin-pw、GUEST_PASSWORD=test-guest-pw、AUTH_MODE=password
 */

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'test-admin-pw';
const GUEST_PASSWORD = process.env.E2E_GUEST_PASSWORD ?? 'test-guest-pw';

test.describe('登录', () => {
  test('未登录访问受保护页 → 重定向到 /login', async ({ page }) => {
    await page.goto('/org');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('h1')).toContainText('登录');
  });

  test('错误密码 → 留在 /login 且显示「密码不对」', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name=password]', 'definitely-wrong-pw');
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('密码不对')).toBeVisible();
  });

  test('管理员密码 → 进首页 + session cookie 写入', async ({ page, context }) => {
    await page.goto('/login');
    await page.fill('input[name=password]', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/');
    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name === 'session')).toBe(true);
  });

  test('访客密码 → 进首页', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name=password]', GUEST_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/');
  });

  test('登录后退出 → 回登录页 + session cookie 清除', async ({ page, context, request }) => {
    // 先登录
    await page.goto('/login');
    await page.fill('input[name=password]', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/');

    // 退出（form POST /api/auth/logout）—— 用 request API 模拟，避免找按钮
    const cookiesBefore = await context.cookies();
    const sessionBefore = cookiesBefore.find((c) => c.name === 'session');
    expect(sessionBefore).toBeDefined();

    const res = await request.post('/api/auth/logout', {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(302);
    const setCookie = res.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('Max-Age=0');

    // 访问受保护页 → 应被踢回 /login
    await page.goto('/org');
    await expect(page).toHaveURL(/\/login$/);
  });
});
