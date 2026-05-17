/**
 * v0.11.81 数据迁移：accordion / flat-list 末尾 `（sub）` 语法糖 → `~sub~` 标准 markdown
 *
 * 目的：让所有 KP body 内容统一用 `~xx~` inline markdown 标记灰细字，
 *      废除位置敏感的「item name / group title 末尾括号 拆 sub」hidden rule。
 *
 * 影响字段：
 *   - accordion: groups[].title, groups[].items[].name
 *   - flat-list: items[].name
 *   - 双语：zh + ja 同时处理
 *
 * 同 splitSectionName regex：^(.*?)\s*[（(]([^）)]+)[）)]\s*$
 *   如 "AI（独裁 I）" → "AI ~独裁 I~"
 *
 * 用法：
 *   # dry-run（默认）：只列改动不写 D1
 *   pnpm tsx scripts/ops/migrate-paren-sub-to-tilde.ts
 *
 *   # 单 discipline
 *   pnpm tsx scripts/ops/migrate-paren-sub-to-tilde.ts --discipline=keiei
 *
 *   # wet-run：真改 D1
 *   pnpm tsx scripts/ops/migrate-paren-sub-to-tilde.ts --wet-run
 *
 * 安全：
 *   - 已 locked KP 自动跳过（API 返 422 kp_locked）
 *   - 单条失败记入 errors[]，不阻塞后续
 *   - D1 Time Travel 30d 兜底
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOKEN_PATH = join(
  homedir(),
  '.claude/projects/-Users-husuli-Documents-Web-Project/secrets/ms-automation-token.txt',
);
const TOKEN = readFileSync(TOKEN_PATH, 'utf-8').trim();
const BASE_URL = process.env.MS_BASE_URL ?? 'https://study.sususu.org';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--wet-run');
const ONLY_DISCIPLINE = args.find((a) => a.startsWith('--discipline='))?.split('=')[1];
const DISCIPLINES = ONLY_DISCIPLINE ? [ONLY_DISCIPLINE] : ['keiei', 'marketing'];

interface KpItem {
  name: string;
  desc?: string;
}

interface KpAccGroup {
  title: string;
  items: KpItem[];
}

type KpBody =
  | { format: 'accordion'; lead?: string; groups: KpAccGroup[] }
  | { format: 'flat-list'; lead?: string; items: KpItem[] }
  | { format: string; [k: string]: unknown };

interface KpRecord {
  id: string;
  title: { zh: string; ja?: string };
  body: { zh: KpBody; ja?: KpBody };
  locked_at?: string | null;
}

/** splitSectionName regex 等价 — 末尾 `（xxx）` 或 `(xxx)` 拆出 sub */
const PAREN_SUB_RE = /^(.*?)\s*[（(]([^）)]+)[）)]\s*$/;

function transformText(s: string): { changed: boolean; result: string } {
  if (!s) return { changed: false, result: s };
  const m = s.match(PAREN_SUB_RE);
  if (!m || !m[1].trim()) return { changed: false, result: s };
  const name = m[1].trim();
  const sub = m[2].trim();
  return { changed: true, result: `${name} ~${sub}~` };
}

function transformBody(body: KpBody | undefined): { changed: boolean; body: KpBody | undefined; samples: string[] } {
  if (!body) return { changed: false, body, samples: [] };
  const samples: string[] = [];
  if (body.format === 'accordion') {
    const b = body as Extract<KpBody, { format: 'accordion' }>;
    let changed = false;
    const newGroups = b.groups.map((g) => {
      const titleR = transformText(g.title);
      if (titleR.changed) {
        changed = true;
        samples.push(`title: "${g.title}" → "${titleR.result}"`);
      }
      const newItems = g.items.map((it) => {
        const nameR = transformText(it.name);
        if (nameR.changed) {
          changed = true;
          samples.push(`item: "${it.name}" → "${nameR.result}"`);
        }
        return { ...it, name: nameR.result };
      });
      return { ...g, title: titleR.result, items: newItems };
    });
    return { changed, body: { ...b, groups: newGroups }, samples };
  }
  if (body.format === 'flat-list') {
    const b = body as Extract<KpBody, { format: 'flat-list' }>;
    let changed = false;
    const newItems = b.items.map((it) => {
      const nameR = transformText(it.name);
      if (nameR.changed) {
        changed = true;
        samples.push(`item: "${it.name}" → "${nameR.result}"`);
      }
      return { ...it, name: nameR.result };
    });
    return { changed, body: { ...b, items: newItems }, samples };
  }
  return { changed: false, body, samples: [] };
}

interface Stats {
  total: number;
  needChange: number;
  patched: number;
  failed: number;
  skippedLocked: number;
}

async function processDiscipline(d: string): Promise<Stats> {
  console.log(`\n=== ${d} ===`);
  // Paginate — server cap 是 200/page
  const PAGE_SIZE = 200;
  let offset = 0;
  const kps: KpRecord[] = [];
  while (true) {
    const res = await fetch(`${BASE_URL}/api/kps?discipline=${d}&limit=${PAGE_SIZE}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      console.error(`list fetch failed at offset=${offset}: ${res.status} ${await res.text()}`);
      break;
    }
    const data = (await res.json()) as { ok: boolean; kps: KpRecord[] };
    const page = data.kps ?? [];
    kps.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`Fetched ${kps.length} KPs (paginated)`);

  const stats: Stats = { total: kps.length, needChange: 0, patched: 0, failed: 0, skippedLocked: 0 };

  for (const kp of kps) {
    const zhR = transformBody(kp.body.zh);
    const jaR = transformBody(kp.body.ja);
    if (!zhR.changed && !jaR.changed) continue;

    stats.needChange++;
    console.log(`\n  KP ${kp.id} ${kp.title.zh}${kp.locked_at ? ' [LOCKED — will skip]' : ''}`);
    [...zhR.samples.map((s) => `    zh: ${s}`), ...jaR.samples.map((s) => `    ja: ${s}`)].forEach((line) =>
      console.log(line),
    );

    if (DRY_RUN) continue;
    if (kp.locked_at) {
      stats.skippedLocked++;
      continue;
    }

    const patchBody: { zh?: KpBody; ja?: KpBody } = {};
    if (zhR.changed && zhR.body) patchBody.zh = zhR.body;
    if (jaR.changed && jaR.body) patchBody.ja = jaR.body;

    const patchRes = await fetch(`${BASE_URL}/api/kps/${encodeURIComponent(kp.id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: patchBody }),
    });
    if (patchRes.ok) {
      stats.patched++;
      console.log(`    ✓ PATCHED`);
    } else {
      stats.failed++;
      console.error(`    ✗ FAILED: ${patchRes.status} ${(await patchRes.text()).substring(0, 200)}`);
    }
  }

  return stats;
}

async function main() {
  console.log(`=== ${DRY_RUN ? 'DRY RUN' : 'WET RUN'} ===`);
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`DISCIPLINES: ${DISCIPLINES.join(', ')}`);

  const totals: Record<string, Stats> = {};
  for (const d of DISCIPLINES) {
    totals[d] = await processDiscipline(d);
  }

  console.log(`\n\n=== SUMMARY ===`);
  let totalNeed = 0;
  let totalPatched = 0;
  let totalFailed = 0;
  let totalLocked = 0;
  for (const [d, s] of Object.entries(totals)) {
    console.log(
      `${d}: total=${s.total} need-change=${s.needChange} patched=${s.patched} failed=${s.failed} skip-locked=${s.skippedLocked}`,
    );
    totalNeed += s.needChange;
    totalPatched += s.patched;
    totalFailed += s.failed;
    totalLocked += s.skippedLocked;
  }
  console.log(`\nGrand total: need-change=${totalNeed} patched=${totalPatched} failed=${totalFailed} skip-locked=${totalLocked}`);
  if (DRY_RUN) console.log(`\nDRY-RUN mode — no D1 changes. Re-run with --wet-run to apply.`);
}

void main();
