/**
 * /api/edit/discipline/[discipline]/clear-kp-tags   (v0.8.36)
 *
 *   POST body:
 *     {
 *       confirm: 'yes-clear-all-tags-<discipline>',
 *       dry_run?: boolean (default false),
 *     }
 *   →
 *     dry_run=true  → { ok: true, dry_run: true, would_affect: N, sample: [...] }
 *     dry_run=false → { ok: true, dry_run: false, affected_rows: N }
 *
 * 一次性清空该 discipline 下所有 KP 的 tags 字段 (UPDATE kp SET tags_json='[]')。
 * 用于 v0.8.36 重构 tag library 后清理"老师过去通过 API 直接传任意 tag string"留下的脏数据。
 *
 * 风险控制：
 *   - body 必须带 confirm 字符串，且必须等于 'yes-clear-all-tags-<discipline>'，避免误调
 *   - 默认 dry_run=true 模式（？）— **决定: 必须显式传 dry_run=true 才 dry-run，
 *     默认 dry_run=false 真删**（user 调用通常已经心理准备）。但 confirm 字符串保护
 *   - 误删恢复: Cloudflare D1 Time Travel (默认 30 天 PITR)
 *
 * 不影响 scholar / school 的 tags_json (那些通常是合法的 — 没观察到大规模脏写)。
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { getDb } from '~/lib/db';

const Body = z.object({
  confirm: z.string().min(1, 'confirm 字段必填'),
  dry_run: z.boolean().optional().default(false),
});

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  const discipline = params.discipline;
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }
  const body = Body.safeParse(raw);
  if (!body.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: body.error.issues });

  const expected = `yes-clear-all-tags-${discipline}`;
  if (body.data.confirm !== expected) {
    return jsonRes(400, {
      ok: false,
      reason: 'confirm_mismatch' as const,
      detail: `confirm 字段必须等于 '${expected}' 才能执行清理`,
    });
  }

  const db = getDb(env);

  if (body.data.dry_run) {
    // 仅查不写，返回 affected count + 前 5 个 KP 样本
    const countRow = await db
      .prepare(`
        SELECT COUNT(*) AS n
        FROM kp
        WHERE discipline = ?
          AND tags_json IS NOT NULL
          AND tags_json != '[]'
          AND tags_json != ''
      `)
      .bind(discipline)
      .first<{ n: number }>();

    const sampleRows = await db
      .prepare(`
        SELECT id, title_zh, tags_json
        FROM kp
        WHERE discipline = ?
          AND tags_json IS NOT NULL
          AND tags_json != '[]'
          AND tags_json != ''
        LIMIT 5
      `)
      .bind(discipline)
      .all<{ id: string; title_zh: string; tags_json: string }>();

    return jsonRes(200, {
      ok: true,
      dry_run: true,
      would_affect: countRow?.n ?? 0,
      sample: (sampleRows.results ?? []).map((r) => ({
        id: r.id,
        title_zh: r.title_zh,
        current_tags: safeParseJsonArray(r.tags_json),
      })),
    });
  }

  // 真清。返回 changes (D1 UPDATE 的 meta.changes)
  let affected = 0;
  try {
    const result = await db
      .prepare(`
        UPDATE kp
        SET tags_json = '[]', updated_at = ?
        WHERE discipline = ?
          AND tags_json IS NOT NULL
          AND tags_json != '[]'
          AND tags_json != ''
      `)
      .bind(new Date().toISOString(), discipline)
      .run();
    affected = result.meta?.changes ?? 0;
  } catch (e) {
    return jsonRes(500, { ok: false, reason: 'd1_write_failed' as const, detail: (e as Error).message });
  }

  return jsonRes(200, {
    ok: true,
    dry_run: false,
    affected_rows: affected,
    note: '若需恢复请走 Cloudflare D1 Time Travel (Dashboard → D1 → management-study-v2 → Time Travel → 选时间点)',
  });
};

function safeParseJsonArray(raw: string): unknown[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
