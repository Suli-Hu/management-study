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
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('input[name=password]')).toBeVisible();
    await expect(page.locator('button[type=submit]')).toContainText('登录');
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

  test('登录后点击「退出」按钮 → 回登录页 + session cookie 清除', async ({ page, context }) => {
    // 先登录
    await page.goto('/login');
    await page.fill('input[name=password]', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/');

    const cookiesBefore = await context.cookies();
    expect(cookiesBefore.find((c) => c.name === 'session')).toBeDefined();

    await page.click('#user-menu-trigger');
    // 点 nav 用户菜单里的「退出」按钮（form POST 自带 Origin，过 CSRF）
    await page.click('form[action="/api/auth/logout"] button');
    // 退出后 302 → / 但 / 又被 middleware 拦回 /login
    await page.waitForURL(/\/login$/);

    const cookiesAfter = await context.cookies();
    const sessionAfter = cookiesAfter.find((c) => c.name === 'session');
    // session 要么不存在，要么已经是空值（Max-Age=0 应被浏览器清掉）
    expect(sessionAfter?.value ?? '').toBe('');
  });
});
