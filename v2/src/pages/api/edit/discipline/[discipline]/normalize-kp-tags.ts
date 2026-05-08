/**
 * /api/edit/discipline/[discipline]/normalize-kp-tags   (v0.11.11)
 *
 * Goal:
 *   Fix legacy "free-text tags" accidentally written by agents when tag library was incomplete.
 *   For `marketing`, KP tags should be exactly ONE of the 5 discipline tag-library keys (t_xxx).
 *
 * POST body:
 *   {
 *     confirm: 'yes-normalize-kp-tags-<discipline>',
 *     dry_run?: boolean (default false),
 *   }
 *
 * Response:
 *   dry_run=true  → { ok:true, dry_run:true, would_update, skipped_no_school, by_theme, sample:[...] }
 *   dry_run=false → { ok:true, dry_run:false, updated_rows, skipped_no_school }
 *
 * Auth:
 *   locals.user && locals.canEdit(discipline)
 *
 * Safety:
 *   - confirm string required to avoid accidental call.
 *   - relies on Cloudflare D1 Time Travel for restore if needed.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getDb } from '~/lib/db';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import {
  buildMarketingThemeToTagKey,
  isMarketingThemeKey,
  type TagLibEntry,
} from '~/lib/marketing-tags-normalize';

const Body = z.object({
  confirm: z.string().min(1, 'confirm 字段必填'),
  dry_run: z.boolean().optional().default(false),
});

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const discipline = params.discipline;
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const body = Body.safeParse(raw);
  if (!body.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: body.error.issues });

  const expected = `yes-normalize-kp-tags-${discipline}`;
  if (body.data.confirm !== expected) {
    return jsonRes(400, {
      ok: false,
      reason: 'confirm_mismatch' as const,
      detail: `confirm 字段必须等于 '${expected}' 才能执行清理`,
    });
  }

  // Currently only marketing is supported for category-only normalization.
  if (discipline !== 'marketing') {
    return jsonRes(400, {
      ok: false,
      reason: 'bad_request' as const,
      detail: 'normalize-kp-tags currently supports discipline=marketing only',
    });
  }

  const db = getDb(locals.runtime.env);

  // Load tag library to resolve actual t_xxx keys by zh label.
  const tagsRow = await db
    .prepare('SELECT tags_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ tags_json: string | null }>();
  const tagLib = parseJsonArray<TagLibEntry>(tagsRow?.tags_json);
  const themeToTagKey = buildMarketingThemeToTagKey(tagLib);
  if (!themeToTagKey) {
    return jsonRes(500, {
      ok: false,
      reason: 'config_missing' as const,
      detail: 'marketing tag library must contain zh labels: 市场洞察/战略选择/价值创造/价值传播/长期关系',
    });
  }

  // For each KP, use its PRIMARY school (kp_school with smallest position) to find the school's theme_key.
  // Then set kp.tags_json to exactly one tag key mapped from theme_key.
  type Row = { id: string; title_zh: string; current_tags_json: string | null; theme_key: string | null };
  const rowsRes = await db
    .prepare(
      `
      SELECT
        k.id as id,
        k.title_zh as title_zh,
        k.tags_json as current_tags_json,
        (
          SELECT sc.theme_key
          FROM kp_school ks
          INNER JOIN school sc ON sc.key = ks.school_key
          WHERE ks.kp_id = k.id
          ORDER BY ks.position ASC
          LIMIT 1
        ) as theme_key
      FROM kp k
      WHERE k.discipline = ?
      ORDER BY k.id ASC
    `,
    )
    .bind(discipline)
    .all<Row>();

  const rows = rowsRes.results ?? [];
  const now = new Date().toISOString();
  let skippedNoSchool = 0;
  const byTheme: Record<string, number> = {};

  const updates: Array<{ id: string; nextTagKey: string; title_zh: string; current: unknown[] }> = [];
  for (const r of rows) {
    if (!r.theme_key || !isMarketingThemeKey(r.theme_key)) {
      skippedNoSchool += 1;
      continue;
    }
    const nextTagKey = themeToTagKey[r.theme_key];
    byTheme[r.theme_key] = (byTheme[r.theme_key] ?? 0) + 1;
    updates.push({
      id: r.id,
      nextTagKey,
      title_zh: r.title_zh,
      current: parseJsonArray<unknown>(r.current_tags_json),
    });
  }

  if (body.data.dry_run) {
    return jsonRes(200, {
      ok: true,
      dry_run: true,
      total_kp: rows.length,
      would_update: updates.length,
      skipped_no_school: skippedNoSchool,
      by_theme: byTheme,
      sample: updates.slice(0, 10).map((u) => ({
        id: u.id,
        title_zh: u.title_zh,
        current_tags: u.current,
        next_tags: [u.nextTagKey],
      })),
      note: 'This endpoint normalizes ALL marketing KP tags to the 5 category tags, based on primary school theme_key.',
    });
  }

  // Execute writes (no batch to keep compatibility with simple D1 stubs; row count is manageable).
  let updated = 0;
  try {
    for (const u of updates) {
      const res = await db
        .prepare('UPDATE kp SET tags_json = ?, updated_at = ? WHERE id = ? AND discipline = ?')
        .bind(JSON.stringify([u.nextTagKey]), now, u.id, discipline)
        .run();
      updated += res.meta?.changes ?? 0;
    }
  } catch (e) {
    return jsonRes(500, { ok: false, reason: 'd1_write_failed' as const, detail: (e as Error).message });
  }

  return jsonRes(200, {
    ok: true,
    dry_run: false,
    updated_rows: updated,
    skipped_no_school: skippedNoSchool,
    note: '若需恢复请走 Cloudflare D1 Time Travel (Dashboard → D1 → management-study-v2 → Time Travel → 选时间点)',
  });
};

