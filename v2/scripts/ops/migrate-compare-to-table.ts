/**
 * v0.11.82 compare 卡片版 → 纯表格版 数据迁移
 *
 * 旧形态：
 *   { format: 'compare', lead, cols: [{ title, keyword, desc, type, theories, detail }] }
 *
 * 新形态：
 *   { format: 'compare', lead,
 *     headers: [title_1, title_2, ...],
 *     rows: [
 *       { label: '关键词', cells: [keyword_1, keyword_2, ...] },
 *       { label: '描述',   cells: [desc_1, desc_2, ...] },
 *       { label: '类型',   cells: [type_1, type_2, ...] },
 *       { label: '理论',   cells: [theories_1, theories_2, ...] },
 *       { label: '详情',   cells: [detail_1, detail_2, ...] },
 *     ],
 *     cols: []   ← 清空作为 sentinel，renderer 通过 headers 存在判断走新形态
 *   }
 *
 * 双语：zh + ja 同时处理
 *
 * 用法：
 *   pnpm tsx scripts/ops/migrate-compare-to-table.ts             # dry-run
 *   pnpm tsx scripts/ops/migrate-compare-to-table.ts --wet-run   # 真改 D1
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOKEN = readFileSync(
  join(homedir(), '.claude/projects/-Users-husuli-Documents-Web-Project/secrets/ms-automation-token.txt'),
  'utf-8',
).trim();
const BASE_URL = process.env.MS_BASE_URL ?? 'https://study.sususu.org';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--wet-run');
const DISCIPLINES = ['keiei', 'marketing'];

interface LegacyCol {
  title: string;
  keyword?: string;
  desc?: string;
  type?: string;
  theories?: string;
  detail?: string;
}
interface CompareBody {
  format: 'compare';
  lead?: string;
  cols?: LegacyCol[];
  headers?: string[];
  rows?: Array<{ label: string; cells: string[] }>;
}

interface KpRecord {
  id: string;
  title: { zh: string; ja?: string };
  body: { zh: { format: string; [k: string]: unknown }; ja?: { format: string; [k: string]: unknown } };
  locked_at?: string | null;
}

const ROW_LABELS = [
  { key: 'keyword' as const, label: '关键词' },
  { key: 'desc' as const, label: '描述' },
  { key: 'type' as const, label: '类型' },
  { key: 'theories' as const, label: '理论' },
  { key: 'detail' as const, label: '详情' },
];

/**
 * 转换 legacy compare body → new shape。
 * 已是新形态（无 cols 或 cols 为空 + 有 headers）→ 返 null 表示不需迁。
 */
function transformCompareBody(body: CompareBody): CompareBody | null {
  const cols = body.cols ?? [];
  if (cols.length === 0) return null;          // 已是新形态或空
  if (body.headers && body.headers.length > 0) return null; // 已有新形态字段

  const headers = cols.map((c) => c.title);
  const rows: Array<{ label: string; cells: string[] }> = ROW_LABELS.map(({ key, label }) => ({
    label,
    cells: cols.map((c) => (c[key] ?? '').trim()),
  })).filter((r) => r.cells.some((cell) => cell.length > 0)); // 全空行不生成

  return {
    format: 'compare',
    lead: body.lead ?? '',
    headers,
    rows,
    cols: [],   // 清空 cols 作为已迁移 sentinel
  };
}

interface Stats {
  total: number;
  compareKps: number;
  needChange: number;
  patched: number;
  failed: number;
  skippedLocked: number;
}

async function processDiscipline(d: string): Promise<Stats> {
  console.log(`\n=== ${d} ===`);
  const PAGE = 200;
  let offset = 0;
  const kps: KpRecord[] = [];
  while (true) {
    const res = await fetch(`${BASE_URL}/api/kps?discipline=${d}&limit=${PAGE}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      console.error(`list fetch fail offset=${offset}: ${res.status}`);
      break;
    }
    const data = (await res.json()) as { ok: boolean; kps: KpRecord[] };
    const page = data.kps ?? [];
    kps.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`Fetched ${kps.length} KPs`);

  const stats: Stats = { total: kps.length, compareKps: 0, needChange: 0, patched: 0, failed: 0, skippedLocked: 0 };

  for (const kp of kps) {
    const zhIsCompare = kp.body.zh?.format === 'compare';
    const jaIsCompare = kp.body.ja?.format === 'compare';
    if (!zhIsCompare && !jaIsCompare) continue;
    stats.compareKps++;

    const newZh = zhIsCompare ? transformCompareBody(kp.body.zh as unknown as CompareBody) : null;
    const newJa = jaIsCompare ? transformCompareBody(kp.body.ja as unknown as CompareBody) : null;
    if (!newZh && !newJa) continue;

    stats.needChange++;
    console.log(`\n  ${kp.title.zh}${kp.locked_at ? ' [LOCKED — will skip]' : ''}`);
    if (newZh) {
      console.log(`    zh: headers=[${newZh.headers!.join(', ')}]`);
      console.log(`        rows: ${newZh.rows!.map((r) => r.label + '(' + r.cells.filter(Boolean).length + ' cells)').join(', ')}`);
    }
    if (newJa) {
      console.log(`    ja: headers=[${newJa.headers!.join(', ')}]`);
      console.log(`        rows: ${newJa.rows!.map((r) => r.label + '(' + r.cells.filter(Boolean).length + ' cells)').join(', ')}`);
    }

    if (DRY_RUN) continue;
    if (kp.locked_at) {
      stats.skippedLocked++;
      continue;
    }

    const bodyPatch: { zh?: CompareBody; ja?: CompareBody } = {};
    if (newZh) bodyPatch.zh = newZh;
    if (newJa) bodyPatch.ja = newJa;

    const res = await fetch(`${BASE_URL}/api/kps/${encodeURIComponent(kp.id)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: bodyPatch }),
    });
    if (res.ok) {
      stats.patched++;
      console.log(`    ✓ PATCHED`);
    } else {
      stats.failed++;
      console.error(`    ✗ FAILED: ${res.status} ${(await res.text()).substring(0, 200)}`);
    }
  }

  return stats;
}

async function main() {
  console.log(`=== ${DRY_RUN ? 'DRY RUN' : 'WET RUN'} ===`);
  console.log(`BASE_URL: ${BASE_URL}`);

  const totals: Record<string, Stats> = {};
  for (const d of DISCIPLINES) {
    totals[d] = await processDiscipline(d);
  }

  console.log(`\n\n=== SUMMARY ===`);
  let totalCompare = 0, totalNeed = 0, totalPatched = 0, totalFailed = 0, totalLocked = 0;
  for (const [d, s] of Object.entries(totals)) {
    console.log(
      `${d}: total=${s.total} compare-KPs=${s.compareKps} need-change=${s.needChange} patched=${s.patched} failed=${s.failed} skip-locked=${s.skippedLocked}`,
    );
    totalCompare += s.compareKps;
    totalNeed += s.needChange;
    totalPatched += s.patched;
    totalFailed += s.failed;
    totalLocked += s.skippedLocked;
  }
  console.log(`\nGrand total: compare-KPs=${totalCompare} need-change=${totalNeed} patched=${totalPatched} failed=${totalFailed} skip-locked=${totalLocked}`);
  if (DRY_RUN) console.log(`\nDRY-RUN mode — no D1 changes. Re-run with --wet-run to apply.`);
}

void main();
