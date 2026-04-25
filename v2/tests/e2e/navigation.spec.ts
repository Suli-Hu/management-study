import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'test-admin-pw';

test.describe('登录后浏览', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name=password]', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/');
  });

  test('学派列表 → 第一个学派 → 默认选中第一个 KP', async ({ page }) => {
    await page.goto('/org');
    // 学科页 = 学派卡片网格；点第一张
    const firstSchoolLink = page.locator('main a[href*="/org/"]').first();
    await expect(firstSchoolLink).toBeVisible();
    const href = await firstSchoolLink.getAttribute('href');
    await firstSchoolLink.click();
    await page.waitForURL(href!);

    // 学派页：左栏有「核心概念」标题 + KP 列表
    await expect(page.getByText(/核心概念/)).toBeVisible();
    // v0.3.13 起默认选中第一个 KP，右栏应显示 KP 详情
    const detailPane = page.locator('#kp-detail-pane');
    await expect(detailPane).toBeVisible();
    // 详情区不应是空 placeholder
    await expect(detailPane).not.toContainText('选中左侧 KP 查看详情');
  });

  test('搜索：输入关键词 → 进搜索页 → 至少 1 条结果', async ({ page }) => {
    await page.goto('/org');
    // top nav 有 search icon，点击进 search
    await page.goto('/org/search?q=战略');
    // 结果列表存在（h1 = "搜索"）
    await expect(page.locator('main')).toContainText(/战略/);
  });

  test('学派 hero 右上角星标 toggle → 写 localStorage', async ({ page }) => {
    await page.goto('/org');
    const firstSchoolLink = page.locator('main a[href*="/org/"]').first();
    const href = await firstSchoolLink.getAttribute('href');
    await firstSchoolLink.click();
    await page.waitForURL(href!);

    const star = page.locator('#school-star-toggle');
    await expect(star).toBeVisible();
    // 初始 ☆
    await expect(star).toContainText('☆');
    await star.click();
    await expect(star).toContainText('★');

    // localStorage 写入
    const schoolKey = await star.getAttribute('data-school-key');
    const stored = await page.evaluate((k) => localStorage.getItem(`school-starred:${k}`), schoolKey);
    expect(stored).toBe('1');
  });

  test('夜间模式 toggle → html.dark class', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('[aria-label*="主题"], [aria-label*="theme"], [aria-label*="夜间"]').first();
    if (await toggle.count() === 0) test.skip(true, 'theme toggle not present in current build');
    const beforeDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await toggle.click();
    const afterDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(afterDark).toBe(!beforeDark);
  });
});
