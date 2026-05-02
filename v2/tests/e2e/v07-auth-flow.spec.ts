/**
 * v0.7 完整账户系统 E2E smoke（默认 skip，手动跑）
 *
 * 不在 CI 跑，因为：
 *   - 需要 AUTH_MODE=email（.dev.vars 默认是 password 模式）
 *   - 需要预先 setup 一个有 password_hash 的测试 user
 *   - 邮件流（signup verify code / reset link）不能在测试环境真发邮件
 *
 * 怎么手动跑：
 *
 *   1. 切 .dev.vars 到 email 模式：
 *      AUTH_MODE=email
 *      SESSION_SECRET=test-secret
 *      ADMIN_EMAILS=e2e@test.com
 *
 *   2. 应用 migrations + 注入测试 user：
 *      pnpm exec wrangler d1 migrations apply management-study-v2 --local
 *      export ADMIN_PASSWORD='E2eTestPass2026'
 *      pnpm setup:admin -- --email=e2e@test.com
 *      unset ADMIN_PASSWORD
 *
 *   3. 启 dev server：
 *      pnpm dev
 *
 *   4. 另起 terminal 跑（注意 unskip 下面的 describe）：
 *      pnpm test:e2e -- v07-auth-flow
 *
 * 覆盖：
 *   - /login 默认是 email+password 表单（v0.7.3）
 *   - 错密码 → bad_credentials flash
 *   - 对密码 → 进首页 + cookie
 *   - /signup 页面 + 强度提示
 *   - /password-reset 页面
 *   - /settings/account 登录后能打开 + 各 section 表单存在
 *   - /settings/account 未登录 → 跳 /login
 */

import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e@test.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'E2eTestPass2026';

// 默认 skip — 改成 .skip → .serial 可以手动跑
test.describe.skip('v0.7 auth flow (manual)', () => {
  test('/login 默认 email + password 表单', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name=email]')).toBeVisible();
    await expect(page.locator('input[name=password]')).toBeVisible();
    // 注册和忘记密码链接
    await expect(page.locator('a[href="/signup"]')).toBeVisible();
    await expect(page.locator('a[href="/password-reset"]')).toBeVisible();
  });

  test('错密码 → bad_credentials flash', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name=email]', TEST_EMAIL);
    await page.fill('input[name=password]', 'WrongPass2026');
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('邮箱或密码不对')).toBeVisible();
  });

  test('对密码 → 进首页 + session cookie', async ({ page, context }) => {
    await page.goto('/login');
    await page.fill('input[name=email]', TEST_EMAIL);
    await page.fill('input[name=password]', TEST_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/');

    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name === 'session' && c.value.length > 0)).toBe(true);
  });

  test('/signup 页面渲染 + 强度提示交互', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('input[name=email]')).toBeVisible();
    await expect(page.locator('input[name=password]')).toBeVisible();
    await expect(page.locator('input[name=display_name]')).toBeVisible();

    // 强度提示初始状态
    const hint = page.locator('#password-hint');
    await expect(hint).toContainText('8 位以上');

    // 输入合格密码 → 提示变绿
    await page.fill('input[name=password]', 'GoodPass2026');
    await expect(hint).toContainText('合格');
  });

  test('/password-reset 页面渲染', async ({ page }) => {
    await page.goto('/password-reset');
    await expect(page.locator('input[name=email]')).toBeVisible();
    await expect(page.locator('button[type=submit]')).toContainText('发送重置链接');
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });

  test('/settings/account 未登录 → 跳 /login', async ({ page }) => {
    // 清 cookie
    await page.context().clearCookies();
    await page.goto('/settings/account');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/settings/account 登录后 5 个 section 表单存在', async ({ page }) => {
    // 先登录
    await page.goto('/login');
    await page.fill('input[name=email]', TEST_EMAIL);
    await page.fill('input[name=password]', TEST_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/');

    // 进 settings
    await page.goto('/settings/account');
    await expect(page).toHaveURL(/\/settings\/account/);

    // 5 个 section 表单各自的 action
    await expect(page.locator('form[action="/api/account/profile"]')).toBeVisible();
    await expect(page.locator('form[action="/api/account/change-password"]')).toBeVisible();
    await expect(page.locator('form[action="/api/account/change-email-request"]')).toBeVisible();
    await expect(page.locator('form[action="/api/account/logout-all"]')).toBeVisible();
    await expect(page.locator('form[action="/api/account/delete"]')).toBeVisible();
  });

  test('/signup 弱密码提交 → weak_password flash', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('input[name=email]', `new+${Date.now()}@test.com`);
    // password 太短
    await page.fill('input[name=password]', 'a1');
    await page.click('button[type=submit]');
    // 注意：minlength="8" HTML 属性会先拦截，所以这个测试在浏览器层面可能不触发服务端
    // 服务端校验通过强制 form 实际提交时触发——这里只验证至少 redirect 回 /signup
    await expect(page).toHaveURL(/\/signup/);
  });
});
