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
 *   - v0.8.20 hotfix: 三层原则 — page chrome 用 user-defined hex / interior 中性 / focus action L1
 *   - v0.8.21 修正: split-pane 的 page interior (active KP 左色条 + body items numbering)
 *     合入 page chrome 层，全 page tag 色一致 (用户 fb)
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
 * v0.8.21 三层原则修正落地防回归 (PRD §6.2.3 修正)。
 *
 * v0.8.20 把 split-pane 内的 active KP 色条 + body items numbering 收成中性 var(--text-3)，
 * 用户 fb 觉得跟 page chrome strip 视觉断裂。v0.8.21 把这两处合入 page chrome accent。
 *
 * 修正后两层断言：
 *   - **page chrome accent** = 学派色 hex (含右栏顶 strip / list active 色条 / body numbering)
 *   - **focus action** = L1 var(--primary) (lang-toggle / LangFab) — 不变
 *
 * KP list dot v0.8.18 删，v0.8.19/20/21 都不加回 (URL 已表学派身份，dot 重复无价值)。
 * KP 详情页 (/keiei/kp/...) body 仍中性 — 单 KP 页无 split-pane list 视觉延伸场景。
 *
 * 不依赖 screenshot 像素 diff — 抽 computed style，跨平台稳。
 */
test.describe('v0.8.21 page chrome accent (strip / list active / body numbering)', () => {
  test.skip(!!process.env.CI, 'depends on local D1 + dev server, runs alongside other e2e on darwin');

  test('学派详情页右栏顶 strip 用 user-defined hex (#10B981 personality 绿)', async ({ page }) => {
    await login(page);
    // personality 学派 tags=['t_ejbdv3'] → discipline.tags['t_ejbdv3'].color='#10B981' 绿
    await page.goto('/keiei/personality?kp=k364');
    await page.waitForLoadState('networkidle');

    // page chrome strip 必须存在，且 background = #10B981 (rgb(16, 185, 129))
    const stripBg = await page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('.kp-pane-accent-strip');
      return strip ? strip.style.background : null;
    });
    expect(stripBg, '右栏顶 page chrome strip 存在 + 用 personality 学派真实 hex (#10B981 绿)').toBe('#10B981');
  });

  test('学派详情页 KP list dot 仍删 + body numbering 用学派 hex', async ({ page }) => {
    await login(page);
    await page.goto('/keiei/personality?kp=k364');
    await page.waitForLoadState('networkidle');

    // KP list dot v0.8.19 删，后续不加回 (URL 已表学派身份，dot 重复无价值)
    const dotCount = await page.locator('.kp-list-dot').count();
    expect(dotCount, 'KP list dot 仍删 (URL 表学派身份)').toBe(0);

    // v0.8.21: 右栏 body items numbering 的 --accent 用 personality 学派 hex (#10B981)
    const rightAccent = await page.evaluate(() => {
      const bodyFmt = document.querySelector('.kp-detail-pane .body-fmt');
      return bodyFmt ? getComputedStyle(bodyFmt).getPropertyValue('--accent').trim() : null;
    });
    expect(rightAccent, '右栏 body --accent 用 personality 学派真实 hex (#10B981)').toBe('#10B981');

    // v0.8.21: 左栏 active KP <ul.optA-kps> 的 --accent 也是同 hex (active 左色条派生)
    const ulAccent = await page.evaluate(() => {
      const ul = document.querySelector<HTMLElement>('ul.optA-kps');
      return ul ? ul.style.getPropertyValue('--accent').trim() : null;
    });
    expect(ulAccent, '左栏 KP list <ul> --accent 用学派真实 hex (active 左色条派生)').toBe('#10B981');
  });

  test('学者详情页右栏顶 strip 用首学派 hex', async ({ page }) => {
    await login(page);
    // hackman 关联 ob 学派，ob 学派 tags=['t_ejbdv3'] → '#10B981' 绿
    await page.goto('/keiei/scholars/hackman');
    await page.waitForLoadState('networkidle');

    const stripBg = await page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('.kp-pane-accent-strip');
      return strip ? strip.style.background : null;
    });
    expect(stripBg, '学者详情页右栏顶 strip 用首学派真实 hex').toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('学者详情页 KP list dot 仍删 + body numbering 用首学派 hex', async ({ page }) => {
    await login(page);
    await page.goto('/keiei/scholars/hackman');
    await page.waitForLoadState('networkidle');

    await page.click('[data-tab-btn="kps"]');
    await page.waitForTimeout(150);

    const dotCount = await page.locator('.kp-list-dot').count();
    expect(dotCount, '学者详情页 KP list dot 仍删').toBe(0);

    // v0.8.21: 右栏 body --accent 用 scholar.schools[0].accentHex (hackman → ob → #10B981)
    const rightAccent = await page.evaluate(() => {
      const bodyFmt = document.querySelector('.kp-detail-pane .body-fmt');
      return bodyFmt ? getComputedStyle(bodyFmt).getPropertyValue('--accent').trim() : null;
    });
    expect(rightAccent, '学者详情页 body --accent 用首学派真实 hex').toMatch(/^#[0-9A-Fa-f]{6}$/);

    // v0.8.21: 左栏 KP <ul.optA-kps> --accent 同步
    const ulAccent = await page.evaluate(() => {
      const ul = document.querySelector<HTMLElement>('ul.optA-kps');
      return ul ? ul.style.getPropertyValue('--accent').trim() : null;
    });
    expect(ulAccent, '学者详情页 KP list <ul> --accent 用首学派真实 hex').toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('KP 详情页顶部 schools chip 用真实 hex inline --accent (跨多学派区分有意义)', async ({ page }) => {
    await login(page);
    await page.goto('/keiei/kp/k140');
    await page.waitForLoadState('networkidle');

    // chip 用 inline style="--accent: <hex>"; v0.8.20 不再有 data-tag="tag-*" attr
    const chipAccents = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll<HTMLElement>('.kp-school-chip'));
      return chips.map((c) => c.style.getPropertyValue('--accent').trim());
    });
    expect(chipAccents.length, 'KP 顶部至少 1 个 schools chip').toBeGreaterThan(0);
    // 至少一个 chip accent 是 hex (其它无 tag 学派会是 var(--text-3))
    const hexChips = chipAccents.filter((a) => /^#[0-9A-Fa-f]{6}$/.test(a));
    expect(hexChips.length, 'KP 顶部 schools chip 至少 1 个用真实 hex').toBeGreaterThan(0);
  });

  test('KP 详情页 body items numbering 仍中性 (page interior)', async ({ page }) => {
    await login(page);
    await page.goto('/keiei/kp/k140');
    await page.waitForLoadState('networkidle');

    const bodyAccent = await page.evaluate(() => {
      const bodyFmt = document.querySelector('.kp-body .body-fmt');
      return bodyFmt ? getComputedStyle(bodyFmt).getPropertyValue('--accent').trim() : null;
    });
    expect(bodyAccent, 'KP body --accent 中性 var(--text-3) (page interior)').toBe('var(--text-3)');
  });

  test('Discipline 首页 SchoolCard chip 用 inline --accent (user-defined hex)', async ({ page }) => {
    await login(page);
    await page.goto('/keiei');
    await page.waitForLoadState('networkidle');

    // v0.8.20: chip 1 不再 data-tag="tag-*"，改 inline style="--accent: <hex>"
    const cardAccents = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.school-card'));
      return cards.map((c) => c.style.getPropertyValue('--accent').trim());
    });
    expect(cardAccents.length, 'Discipline 首页至少 1 个 SchoolCard').toBeGreaterThan(0);
    const hexCards = cardAccents.filter((a) => /^#[0-9A-Fa-f]{6}$/.test(a));
    expect(hexCards.length, 'SchoolCard 至少 1 个用真实 hex (chip 1 hashToTagToken bug 修)').toBeGreaterThan(0);
  });

  test('lang-toggle 用 var(--primary) — focus action L1，不受父级 --accent cascade 干扰', async ({ page }) => {
    await login(page);
    // 选个有 ja body 的 KP，lang-toggle 才会渲染
    await page.goto('/keiei/personality?kp=k364');
    await page.waitForLoadState('networkidle');

    // lang-toggle 的 border / color 应解析到 --primary 计算出的 oklch 值，不是父级 strip 的 hex
    const langToggleBorder = await page.evaluate(() => {
      const t = document.querySelector('.lang-toggle');
      return t ? getComputedStyle(t).borderColor : null;
    });
    // --primary 在 light mode 是 oklch(0.20 0.005 80) ≈ rgb(35, 35, 33) 墨黑
    // 不应该是 #10B981 (personality 绿) 系派生色
    expect(langToggleBorder, 'lang-toggle border 不是学派色 (var(--primary) 墨黑 not 学派 hex)').not.toMatch(/16,\s*185,\s*129/);
  });
});
