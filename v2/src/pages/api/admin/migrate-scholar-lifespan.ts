/**
 * POST /api/admin/migrate-scholar-lifespan  (v0.8.9 Stage 4.6 Q1=B)
 *
 * super-admin only。一次性 migration：扫所有 scholar 行的 lifespan 列，
 * 尝试 split 范围分隔符（– - — ~ 〜）→ born/died，覆盖现有空字段。
 *
 *   "1908–1970"      → born="1908"  died="1970"
 *   "1890年9月9日 — 1947" → born="1890年9月9日" died="1947"
 *   "1908"           → dirty (单段，无法判断是 born 还是 died — PM 手动修)
 *   ""/null          → skipped
 *
 * 注意：
 *   1. 用 raw SQL（不走 zod）— schema 删 lifespan 后 zod parse 不接受这字段
 *   2. born/died 已有值 → 不覆盖（已迁移过 / admin 显式填）
 *   3. 跑完不 clear lifespan 列 — migration 0021 ALTER TABLE 会 DROP COLUMN
 *      （所以这个 endpoint 必须在 0021 部署前跑完）
 *
 * Response:
 *   { ok, scanned, succeeded, dirty: [{ key, discipline, lifespan_raw, reason }],
 *     skipped_already_filled, skipped_empty }
 */

import type { APIRoute } from 'astro';

interface ScholarLifespanRow {
  key: string;
  discipline: string;
  lifespan: string | null;
  born: string | null;
  died: string | null;
}

interface DirtyEntry {
  key: string;
  discipline: string;
  lifespan_raw: string;
  reason: 'single_segment' | 'too_many_segments' | 'unparseable';
}

interface MigrateReport {
  ok: boolean;
  scanned: number;
  succeeded: number;
  skipped_already_filled: number;
  skipped_empty: number;
  dirty: DirtyEntry[];
  dry_run: boolean;
}

/** 范围分隔符：标准 hyphen、en-dash、em-dash、tilde、wave-dash */
const RANGE_SEPARATORS = /[–\-—~〜]/;

function splitLifespan(raw: string): { ok: true; born: string; died: string } | { ok: false; reason: DirtyEntry['reason'] } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'unparseable' };
  const parts = trimmed.split(RANGE_SEPARATORS).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) return { ok: false, reason: 'single_segment' };
  if (parts.length === 2) return { ok: true, born: parts[0], died: parts[1] };
  return { ok: false, reason: 'too_many_segments' };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonResponse(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return jsonResponse(403, { ok: false, reason: 'super_admin_required' });

  const env = locals.runtime.env;
  if (!env.DB) return jsonResponse(503, { ok: false, reason: 'd1_unavailable' });

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry_run') === '1';

  const result = await env.DB
    .prepare('SELECT key, discipline, lifespan, born, died FROM scholar')
    .all<ScholarLifespanRow>();
  const rows = result.results ?? [];

  const report: MigrateReport = {
    ok: true,
    scanned: rows.length,
    succeeded: 0,
    skipped_already_filled: 0,
    skipped_empty: 0,
    dirty: [],
    dry_run: dryRun,
  };

  const updates: Array<{ key: string; discipline: string; born: string; died: string }> = [];

  for (const row of rows) {
    const lifespan = (row.lifespan ?? '').trim();
    if (!lifespan) {
      report.skipped_empty += 1;
      continue;
    }

    // born/died 都已有 → 不覆盖
    const bornFilled = (row.born ?? '').trim().length > 0;
    const diedFilled = (row.died ?? '').trim().length > 0;
    if (bornFilled && diedFilled) {
      report.skipped_already_filled += 1;
      continue;
    }

    const split = splitLifespan(lifespan);
    if (!split.ok) {
      report.dirty.push({
        key: row.key,
        discipline: row.discipline,
        lifespan_raw: lifespan,
        reason: split.reason,
      });
      continue;
    }

    const nextBorn = bornFilled ? (row.born ?? '').trim() : split.born;
    const nextDied = diedFilled ? (row.died ?? '').trim() : split.died;
    updates.push({ key: row.key, discipline: row.discipline, born: nextBorn, died: nextDied });
    report.succeeded += 1;
  }

  if (!dryRun && updates.length > 0) {
    // 分批 batch — D1 每批 ≤ 100 条 statement
    const BATCH = 80;
    for (let i = 0; i < updates.length; i += BATCH) {
      const slice = updates.slice(i, i + BATCH);
      const stmts = slice.map((u) =>
        env.DB
          .prepare('UPDATE scholar SET born = ?, died = ? WHERE discipline = ? AND key = ?')
          .bind(u.born, u.died, u.discipline, u.key),
      );
      await env.DB.batch(stmts);
    }
  }

  return jsonResponse(200, report);
};
