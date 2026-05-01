import { test, expect, type Page } from '@playwright/test';

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'test-admin-pw';

// 进入第一个 discipline → 第一个学派页（discipline-agnostic，避免硬编码 keiei/org）。
// 返回学派页 URL，方便后续 assertion。
async function gotoFirstSchool(page: Page): Promise<string> {
  await page.goto('/');
  // 首页 main 里的 discipline 链接：href 形如 /keiei
  const disciplineLink = page.locator('main section a[href^="/"]:not([href="/"])').first();
  await expect(disciplineLink).toBeVisible();
  const disciplineHref = await disciplineLink.getAttribute('href');
  await disciplineLink.click();
  await page.waitForURL(`**${disciplineHref!}`);

  // 学科页 → 学派卡片
  const schoolLink = page.locator(`main a[href^="${disciplineHref}/"]`).first();
  await expect(schoolLink).toBeVisible();
  const schoolHref = await schoolLink.getAttribute('href');
  await schoolLink.click();
  await page.waitForURL(`**${schoolHref!}`);
  return schoolHref!;
}

test.describe('登录后浏览', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name=password]', ADMIN_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/');
  });

  test('首页 → 第一个学派 → 默认选中第一个 KP', async ({ page }) => {
    await gotoFirstSchool(page);

    // 学派页：左栏有「核心概念」标题
    await expect(page.getByText(/核心概念/)).toBeVisible();
    // v0.3.13 起默认选中第一个 KP，右栏应显示 KP 详情（lg 视口才有 split-pane）
    await page.setViewportSize({ width: 1280, height: 800 });
    const detailPane = page.locator('#kp-detail-pane');
    await expect(detailPane).toBeVisible();
    await expect(detailPane).not.toContainText('选中左侧 KP 查看详情');
  });

  test('学派页可点 KP 切换详情', async ({ page }) => {
    await gotoFirstSchool(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    const detailPane = page.locator('#kp-detail-pane');
    const firstTitle = (await detailPane.locator('h2').first().textContent())?.trim() ?? '';

    // 点第二个 KP（如果只有 1 个，跳过）
    const items = page.locator('.kp-list-item');
    if ((await items.count()) < 2) test.skip(true, 'only one KP in this school');
    await items.nth(1).click();
    // URL 切到 ?kp=…
    await expect(page).toHaveURL(/\?kp=/);
    const newTitle = (await detailPane.locator('h2').first().textContent())?.trim() ?? '';
    expect(newTitle).not.toBe(firstTitle);
  });

  test('学派 hero 右上角星标 toggle → 写 localStorage', async ({ page }) => {
    await gotoFirstSchool(page);

    const star = page.locator('#school-star-toggle');
    await expect(star).toBeVisible();
    await expect(star).toContainText('☆');
    await star.click();
    await expect(star).toContainText('★');

    const schoolKey = await star.getAttribute('data-school-key');
    const stored = await page.evaluate((k) => localStorage.getItem(`school-starred:${k}`), schoolKey);
    expect(stored).toBe('1');
  });

  test('夜间模式 toggle → html.dark class', async ({ page }) => {
    await page.goto('/');
    // Nav 管理菜单里的主题切换按钮
    await page.click('#mgmt-menu-trigger');
    const toggle = page.locator('#theme-toggle');
    if ((await toggle.count()) === 0) test.skip(true, 'theme toggle not present');
    const beforeDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await toggle.click();
    const afterDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(afterDark).toBe(!beforeDark);
  });
});
