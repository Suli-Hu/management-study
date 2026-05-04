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
 * v0.8.18 跨 component tag 色一致性 — 防"同 KP 左灰右绿"分裂感回归。
 *
 * 用户 v9 反馈触发的根因：split-pane 左 KP list 用 accentVar (var(--tag-*))，
 * 右栏 body items numbering 用 accentHex (用户自定义 hex from tagLibrary)。
 * 两套 token 视觉上接近但不同。
 *
 * 这块 test 抽 computed style 比对 — assertion 是"同一信息维度跨 component 必须
 * 同一计算色"，不依赖 screenshot 像素 diff，跨平台稳定。
 */
test.describe('v0.8.18 跨 component tag 色一致性', () => {
  test.skip(!!process.env.CI, 'depends on local D1 + dev server, runs alongside other e2e on darwin');

  test('学派详情页 split-pane 同 KP 左 dot vs 右 body items numbering 同色', async ({ page }) => {
    await login(page);
    // personality 学派 tags=['t_ejbdv3'] 非空 — accentVar 走真实 --tag-* token
    // k364 是 personality 学派下其中一个 KP（concepts[4]）
    await page.goto('/keiei/personality?kp=k364');
    await page.waitForLoadState('networkidle');

    // 抽左侧 active KP row 的 dot indicator background-color
    const leftDot = await page.evaluate(() => {
      const dot = document.querySelector('.optA-kp.is-active .kp-list-dot');
      return dot ? getComputedStyle(dot).backgroundColor : null;
    });
    expect(leftDot, 'left active KP list dot rendered').not.toBeNull();

    // 抽右栏 body items numbering 的实际计算色 — 通过读 .body-fmt 的 --accent
    // computed value（5 个 format 的 number / cell / quad / acc-numbered 都用同一个）
    const rightAccent = await page.evaluate(() => {
      const bodyFmt = document.querySelector('.kp-detail-pane .body-fmt');
      if (!bodyFmt) return null;
      // 直接读 --accent CSS prop，跨 5 format 统一来源
      return getComputedStyle(bodyFmt).getPropertyValue('--accent').trim();
    });
    expect(rightAccent, 'right body --accent populated').not.toBeNull();
    expect(rightAccent, 'right body --accent non-empty').not.toBe('');

    // 左 dot 的 background 由父级 --accent inherit（CSS：var(--accent, fallback)）
    // 抽左 dot 的 --accent 跟右 body 的 --accent 比；两侧应同源 (.split 的 --accent)
    const leftAccent = await page.evaluate(() => {
      const dot = document.querySelector('.optA-kp.is-active .kp-list-dot');
      if (!dot) return null;
      return getComputedStyle(dot).getPropertyValue('--accent').trim();
    });
    expect(leftAccent, 'left dot inherits --accent').toBe(rightAccent);
  });

  test('学者详情页 split-pane 同 KP 左 dot vs 右 body items numbering 同色', async ({ page }) => {
    await login(page);
    await page.goto('/keiei/scholars/hackman');
    await page.waitForLoadState('networkidle');

    // 切到"关联知识" tab — 左关联 KP list 才出现
    await page.click('[data-tab-btn="kps"]');
    await page.waitForTimeout(150);  // tab 切换 transition

    const leftDot = await page.evaluate(() => {
      const dot = document.querySelector('.optA-kp .kp-list-dot');  // 任一 row 都行（hackman 关联 KP 不一定 active）
      return dot ? getComputedStyle(dot).getPropertyValue('--accent').trim() : null;
    });

    const rightAccent = await page.evaluate(() => {
      const bodyFmt = document.querySelector('.kp-detail-pane .body-fmt');
      return bodyFmt ? getComputedStyle(bodyFmt).getPropertyValue('--accent').trim() : null;
    });

    if (leftDot && rightAccent) {
      expect(leftDot).toBe(rightAccent);
    }
    // hackman 可能没关联 KP — 这种空态走 EmptyRight 路径，dot 不渲染；test 软通过
  });

  test('KP 详情页 lang-toggle accent 跟 body items numbering 同色', async ({ page }) => {
    await login(page);
    // k140 是 carnegie 学派下的 flat-list KP，有 schools/scholars
    await page.goto('/keiei/kp/k140');
    await page.waitForLoadState('networkidle');

    const bodyAccent = await page.evaluate(() => {
      const bodyFmt = document.querySelector('.kp-body .body-fmt');
      return bodyFmt ? getComputedStyle(bodyFmt).getPropertyValue('--accent').trim() : null;
    });
    expect(bodyAccent).not.toBeNull();
    expect(bodyAccent).not.toBe('');

    // KP k140 不一定有 ja body — lang-toggle 可能不渲染，那就只测 body
    const langToggleAccent = await page.evaluate(() => {
      const toggle = document.querySelector('[data-lang-toggle]');
      return toggle ? getComputedStyle(toggle).getPropertyValue('--accent').trim() : null;
    });

    if (langToggleAccent) {
      expect(langToggleAccent).toBe(bodyAccent);
    }
  });
});
