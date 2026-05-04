import { test, expect, type Page } from '@playwright/test';

/**
 * Stage 6 visual regression baseline (v0.8.12 chip 1, v0.8.13 chip 2, v0.8.14 chip 6, v0.8.15 chip 4)
 *
 * Captures full-page screenshots at 1280 (desktop) + 322 (iPad Mini) for in-scope pages,
 * and diffs them against committed snapshots on subsequent runs. PM uses this to confirm
 * later chips don't break the design swap visually.
 *
 * 第一次跑: `pnpm test:e2e -- visual-regression --update-snapshots`
 * 后续跑: `pnpm test:e2e -- visual-regression`（diff > maxDiffPixels = fail）
 *
 * 已涵盖：
 *   - chip 1: Layout shell + discipline 首页（/keiei）
 *   - chip 2: KP 详情页 narrative / flat-list / quad 三种 format
 *   - chip 6: 学习日志（/keiei/study-log）
 *   - chip 4: 学者详情页（hackman — ob 学派单 chip 形态）
 *
 * 后续 chip 3/5 会扩到 学派详情/列表 页面。
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
