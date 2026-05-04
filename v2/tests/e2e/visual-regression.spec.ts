import { test, expect, type Page } from '@playwright/test';

/**
 * Stage 6 visual regression baseline (v0.8.12 chip 1, v0.8.13 chip 2, v0.8.14 chip 6, v0.8.15 chip 4, v0.8.16 chip 3)
 *
 * Captures full-page screenshots at 1280 (desktop) + 322 (iPad Mini) for in-scope pages,
 * and diffs them against committed snapshots on subsequent runs. PM uses this to confirm
 * later chips don't break the design swap visually.
 *
 * 第一次跑: `pnpm test:e2e -- visual-regression --update-snapshots`
 * 后续跑: `pnpm test:e2e -- visual-regression`（diff > maxDiffPixels = fail）
 *
 * 已涵盖：
 *   - chip 1 (v0.8.12): Layout shell + discipline 首页 (/keiei)
 *   - chip 2 (v0.8.13): KP 详情页 narrative / flat-list / quad 三种 format
 *   - chip 6 (v0.8.14): 学习日志 (/keiei/study-log)
 *   - chip 4 (v0.8.15): 学者详情页 (hackman — ob 学派单 chip 形态)
 *   - chip 3 (v0.8.16): 学派详情页 (/keiei/carnegie)
 *   - v0.8.18 hotfix: 跨 component tag 色一致性 — split-pane 左 dot vs 右 body
 *   - v0.8.19 hotfix: redundant tag 着色全删 — page chrome 已表达，detail 页内部全中性
 *
 * 后续 chip 5 会扩到 列表 页面。
 *
 * 前提（与现有 e2e 一致）:
 *   - 本地 D1 已 apply migrations + sync 一次
 *   - .dev.vars 含 ADMIN_PASSWORD / GUEST_PASSWORD / SESSION_SECRET
 *   - astro dev 跑在 4321
 */

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'test-admin-pw';

const PAGES = [
  { name: 'discipline-home', path: '/keiei' },
  // v0.8.13 Stage 6 chip 2：KP 详情页 3 个 format（covers narrative + flat-list + quad）
  // KP IDs verified against local D1/data/keiei/kp:
  //   k385 = narrative (主流，132 KPs 同 format)
  //   k360 = flat-list (45 KPs 同 format)
  //   k071 = quad (2 KPs 同 format)
  { name: 'kp-detail-narrative', path: '/keiei/kp/k385' },
  { name: 'kp-detail-flat-list', path: '/keiei/kp/k360' },
  { name: 'kp-detail-quad',      path: '/keiei/kp/k071' },
  // v0.8.14 Stage 6 chip 6：学习日志（含日历热力图 + 段位 + sparkline）
  { name: 'study-log',           path: '/keiei/study-log' },
  // v0.8.15 Stage 6 chip 4: 学者详情页 (hackman 是 ob 学派下唯一关联学者，hex → token + school chip)
  { name: 'scholar-detail',      path: '/keiei/scholars/hackman' },
  // v0.8.16 Stage 6 chip 3: 学派详情页 v1.0 design swap (hex → --tag-* token)
  { name: 'school-detail',       path: '/keiei/carnegie' },
];

const VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'mobile-322', width: 322, height: 768 },
];

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name=password]', ADMIN_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname === '/');
}

/**
 * v0.8.12 Stage 6 chip 1+: 仅本地 (darwin) 跑。CI (linux) 现暂不接，等 chip 7 配
 * 跨平台 snapshot 策略（per-platform baseline directory 或 docker-pinned linux
 * baseline），那时再在 CI 接管 visual regression。
 */
test.describe('Stage 6 visual regression', () => {
  test.skip(!!process.env.CI, 'visual regression baseline is darwin-only for chip 1-6; chip 7 integrates CI');

  for (const pageDef of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`${pageDef.name} @ ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await login(page);
        await page.goto(pageDef.path);
        await page.waitForLoadState('networkidle');
        // 给 webfont (Kalam) 多一点时间 paint，避免 wordmark 抖动 false-diff
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot(`${pageDef.name}-${vp.name}.png`, {
          fullPage: true,
          maxDiffPixels: 200,
          // 学派 tag --tag-* hash → 8 token 是 deterministic，但 oklch 渲染在不同 GPU
          // 上可能 ±1 像素 antialiasing → 给一点 threshold
          threshold: 0.15,
        });
      });
    }
  }
});

/**
 * v0.8.19 redundant tag 着色全删 — page chrome 上下文原则 (PRD §6.2.3) 落地防回归。
 *
 * 用户 v10 反馈触发的根因：v0.8.18 加的 KP list dot 是冗余 affordance。同学派下所有
 * dot 同色，page chrome (URL + breadcrumb) 已表达学派身份，dot 重复表达 = 违反"若无
 * 必要勿增实体"。
 *
 * 第 6 次 minimalism 贯彻。本块 test 双向断言：
 *   1. 学派/KP/学者 detail 页内部 accent 全中性 (var(--text-3))，不再有 dot/strip
 *   2. Discipline 首页 SchoolCard chip 仍按 --tag-* 着色 (跨学派区分有意义，**不**应被误删)
 *
 * 不依赖 screenshot 像素 diff — 抽 computed property，跨平台稳。
 */
test.describe('v0.8.19 redundant tag 着色全删 + page chrome 上下文原则', () => {
  test.skip(!!process.env.CI, 'depends on local D1 + dev server, runs alongside other e2e on darwin');

  test('学派详情页 split-pane 左侧 KP list dot 已删 + 右栏 body 中性', async ({ page }) => {
    await login(page);
    // personality 学派 tags=['t_ejbdv3'] 非空 — v0.8.18 时 accentVar 走真实 --tag-* token，
    // 现在 v0.8.19 全切中性。k364 是 personality 学派下 concepts[4]
    await page.goto('/keiei/personality?kp=k364');
    await page.waitForLoadState('networkidle');

    // v0.8.18 加的 .kp-list-dot 已 v0.8.19 删除（dot indicator redundant — page chrome 已表达学派身份）
    const dotCount = await page.locator('.kp-list-dot').count();
    expect(dotCount, 'v0.8.18 加的 .kp-list-dot 在 v0.8.19 全删（redundant affordance）').toBe(0);

    // 右栏顶 3px strip 也应不存在（同 redundant 原则）
    const stripCount = await page.locator('.kp-detail-pane > div[style*="height:3px"]').count();
    expect(stripCount, '右栏顶 3px strip 已删').toBe(0);

    // 右栏 body items numbering 的 --accent 应中性 (var(--text-3))
    const rightAccent = await page.evaluate(() => {
      const bodyFmt = document.querySelector('.kp-detail-pane .body-fmt');
      return bodyFmt ? getComputedStyle(bodyFmt).getPropertyValue('--accent').trim() : null;
    });
    expect(rightAccent, '右栏 body --accent 中性 (var(--text-3))').toBe('var(--text-3)');
  });

  test('学者详情页 split-pane 左侧 KP list dot 已删 + 右栏 body 中性', async ({ page }) => {
    await login(page);
    await page.goto('/keiei/scholars/hackman');
    await page.waitForLoadState('networkidle');

    // 切到"关联知识" tab
    await page.click('[data-tab-btn="kps"]');
    await page.waitForTimeout(150);

    const dotCount = await page.locator('.kp-list-dot').count();
    expect(dotCount, '学者详情页 dot 也删（page chrome 已表达学者身份）').toBe(0);

    const stripCount = await page.locator('.kp-detail-pane > div[style*="height:3px"]').count();
    expect(stripCount, '学者详情页右栏顶 strip 已删').toBe(0);
  });

  test('KP 详情页 body items numbering --accent 中性', async ({ page }) => {
    await login(page);
    // k140 是 carnegie 学派下的 flat-list KP，有 schools/scholars
    await page.goto('/keiei/kp/k140');
    await page.waitForLoadState('networkidle');

    const bodyAccent = await page.evaluate(() => {
      const bodyFmt = document.querySelector('.kp-body .body-fmt');
      return bodyFmt ? getComputedStyle(bodyFmt).getPropertyValue('--accent').trim() : null;
    });
    expect(bodyAccent, 'KP body --accent 中性').toBe('var(--text-3)');
  });

  test('KP 详情页顶部 schools chip 仍着色 (跨多学派 chip 区分有意义)', async ({ page }) => {
    await login(page);
    await page.goto('/keiei/kp/k140');
    await page.waitForLoadState('networkidle');

    // KP 顶部 .kp-school-chip 应有 [data-tag="tag-*"]，CSS 据此着色
    const taggedSchoolChips = await page.locator('.kp-school-chip[data-tag^="tag-"]').count();
    expect(taggedSchoolChips, 'KP 顶部 schools chip 仍有 data-tag (跨学派区分保留)').toBeGreaterThan(0);
  });

  test('Discipline 首页 SchoolCard chip 仍按 tag 色 (多学派并列展示，不应被误删)', async ({ page }) => {
    await login(page);
    await page.goto('/keiei');
    await page.waitForLoadState('networkidle');

    // SchoolCard 用 [data-tag="tag-*"] 着色（chip 1 v0.8.12 落地）
    // 此 test 防止"全删 redundant"误伤跨学派区分场景
    const taggedSchoolCards = await page.locator('[data-tag^="tag-"]').count();
    expect(taggedSchoolCards, 'Discipline 首页 SchoolCard chip 仍按 tag 色着色').toBeGreaterThan(0);
  });
});
