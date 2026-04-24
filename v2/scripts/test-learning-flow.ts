/**
 * Learning-flow smoke test — 端到端验证 KP 增/删 流程 in local D1.
 *
 * 流程：
 *   1. 写临时 KP JSON → data/keiei/kp/kt99999.json
 *   2. pnpm validate（schema + cross-ref）
 *   3. pnpm sync:d1（生成 SQL）
 *   4. wrangler d1 execute --local --file=sync.sql（应用到 miniflare D1）
 *   5. 查 D1 断言：KP 存在、kp_school 关联、kp_scholar 关联
 *   6. 删临时 JSON
 *   7. 再 sync + apply
 *   8. 查 D1 断言：KP 已消失、baseline 计数恢复
 *
 * 用途：
 *   - 每次 push 前本地跑一下，确认 UI/auth 改动没把 learning 工作流搞坏
 *   - 未来加到 CI（pnpm test 的 hook）
 *
 * 执行：pnpm test:learning-flow
 */

import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = join(__dirname, '..');

const TEST_KP_ID = 'kt99999';
const TEST_KP_PATH = join(V2_ROOT, 'data/keiei/kp', `${TEST_KP_ID}.json`);

const TEST_KP = {
  id: TEST_KP_ID,
  discipline: 'keiei',
  schools: ['change'],
  scholars: ['march'],
  year: '2099',
  title: {
    zh: '[test] 学习流程 smoke',
    en: '[test] learning flow smoke',
    ja: '[test] 学習フロー smoke',
  },
  body: {
    zh: '<strong>[TEST]</strong> smoke test KP — 不应出现在生产',
    ja: '<strong>[TEST]</strong> smoke test KP — 本番に出現すべきでない',
  },
  tags: [],
  format: 'narrative',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function run(cmd: string, args: string[], label: string): { stdout: string; code: number } {
  const res = spawnSync(cmd, args, {
    cwd: V2_ROOT,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  if (res.status !== 0) {
    console.error(`✗ ${label} failed (exit ${res.status}):\n${stdout}\n${stderr}`);
  }
  return { stdout: stdout + stderr, code: res.status ?? 1 };
}

function d1Query(sql: string, label: string): string {
  const r = run(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'management-study-v2', '--local', '--command', sql, '--json'],
    label,
  );
  if (r.code !== 0) throw new Error(`${label} failed`);
  return r.stdout;
}

function parseCount(out: string): number {
  const m = out.match(/"n":\s*(\d+)/);
  if (!m) throw new Error(`couldn't parse count from: ${out.slice(0, 400)}`);
  return parseInt(m[1], 10);
}

function cleanup() {
  if (existsSync(TEST_KP_PATH)) {
    unlinkSync(TEST_KP_PATH);
    console.log(`  [cleanup] removed ${TEST_KP_PATH}`);
  }
}

// v0.3.1: 进程无论如何退出都尝试清理（Ctrl+C / 崩溃 / 未捕获异常）
// 防止 kt99999.json 留在 filesystem 被 git pick up → 污染 learning
let cleanupDone = false;
function safeCleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  try {
    cleanup();
  } catch (e) {
    console.error('[safeCleanup] failed:', e);
  }
}
process.on('exit', safeCleanup);
process.on('SIGINT', () => {
  safeCleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  safeCleanup();
  process.exit(143);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  safeCleanup();
  process.exit(1);
});

async function main() {
  console.log('=== learning-flow smoke test ===');

  // 0. Baseline（在任何改动之前 snapshot 当前 local D1 状态）
  const baselineKpCount = parseCount(d1Query('SELECT COUNT(*) as n FROM kp', 'baseline kp count'));
  const baselineSchoolLinkCount = parseCount(d1Query('SELECT COUNT(*) as n FROM kp_school', 'baseline kp_school count'));
  console.log(`  baseline: ${baselineKpCount} KPs, ${baselineSchoolLinkCount} kp_school links`);

  try {
    // 1. 写临时 KP
    console.log('\n→ step 1: write test JSON');
    writeFileSync(TEST_KP_PATH, JSON.stringify(TEST_KP, null, 2) + '\n');

    // 2. validate
    console.log('→ step 2: pnpm validate');
    const v = run('pnpm', ['validate'], 'validate');
    if (v.code !== 0) throw new Error('validate failed (see above)');

    // 3. sync:d1 (writes .wrangler/sync.sql)
    console.log('→ step 3: pnpm sync:d1');
    const s = run('pnpm', ['sync:d1'], 'sync:d1');
    if (s.code !== 0) throw new Error('sync:d1 failed');

    // 4. apply to local D1
    console.log('→ step 4: apply SQL to local D1');
    const a = run(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'execute', 'management-study-v2', '--local', '--file=.wrangler/sync.sql'],
      'apply sync.sql',
    );
    if (a.code !== 0) throw new Error('apply failed');

    // 5. assert KP + joins present
    console.log('→ step 5: assert test KP present in D1');
    const q1 = d1Query(`SELECT id, title_zh FROM kp WHERE id = '${TEST_KP_ID}'`, 'query test KP');
    if (!q1.includes(TEST_KP_ID)) throw new Error(`test KP not in kp table:\n${q1.slice(0, 400)}`);

    const qSchool = d1Query(
      `SELECT COUNT(*) as n FROM kp_school WHERE kp_id = '${TEST_KP_ID}' AND school_key = 'change'`,
      'query kp_school',
    );
    if (parseCount(qSchool) !== 1) throw new Error('kp_school link missing');

    const qScholar = d1Query(
      `SELECT COUNT(*) as n FROM kp_scholar WHERE kp_id = '${TEST_KP_ID}' AND scholar_key = 'march'`,
      'query kp_scholar',
    );
    if (parseCount(qScholar) !== 1) throw new Error('kp_scholar link missing');

    const afterAddCount = parseCount(d1Query('SELECT COUNT(*) as n FROM kp', 'kp count after add'));
    if (afterAddCount !== baselineKpCount + 1) {
      throw new Error(`expected ${baselineKpCount + 1} KPs, got ${afterAddCount}`);
    }
    console.log('  ✓ kp + kp_school + kp_scholar all linked');

    // 6. delete test JSON
    console.log('→ step 6: delete test JSON');
    unlinkSync(TEST_KP_PATH);

    // 7. re-sync + re-apply
    console.log('→ step 7: re-sync + re-apply');
    const s2 = run('pnpm', ['sync:d1'], 're-sync');
    if (s2.code !== 0) throw new Error('re-sync failed');
    const a2 = run(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'execute', 'management-study-v2', '--local', '--file=.wrangler/sync.sql'],
      're-apply',
    );
    if (a2.code !== 0) throw new Error('re-apply failed');

    // 8. assert gone + baseline restored
    console.log('→ step 8: assert test KP gone + baseline restored');
    const q2 = d1Query(`SELECT id FROM kp WHERE id = '${TEST_KP_ID}'`, 'query after delete');
    if (q2.includes(TEST_KP_ID)) throw new Error(`test KP still in D1 after delete:\n${q2.slice(0, 400)}`);

    const finalKpCount = parseCount(d1Query('SELECT COUNT(*) as n FROM kp', 'final kp count'));
    if (finalKpCount !== baselineKpCount) {
      throw new Error(`expected ${baselineKpCount}, got ${finalKpCount}`);
    }

    const finalSchoolLinkCount = parseCount(
      d1Query('SELECT COUNT(*) as n FROM kp_school', 'final kp_school count'),
    );
    if (finalSchoolLinkCount !== baselineSchoolLinkCount) {
      throw new Error(`kp_school count drift: ${baselineSchoolLinkCount} → ${finalSchoolLinkCount}`);
    }

    console.log(
      `\n✓ PASSED — baseline ${baselineKpCount} KPs / ${baselineSchoolLinkCount} kp_school links, add/remove roundtrip clean`,
    );
  } catch (err) {
    console.error(`\n✗ FAILED: ${err instanceof Error ? err.message : err}`);
    cleanup();
    process.exit(1);
  }
}

main();
