/**
 * PUT / DELETE /api/edit/theme/[discipline]/[key]  (v0.4.29 Phase 1)
 *
 *   PUT  body: { title: I18n, desc?: I18n, tags?: string[] }   — 改主题（key 不可改）
 *   DELETE                                           — 删主题（schools[] > 0 时返 409 has_dependents）
 *
 *   学派组 themes 是 discipline.json 的嵌套字段，CRUD 都是 PATCH discipline.json themes[X]。
 *
 * v0.12.0+: D1-only。GitHub 不再是真源，也不再作为审计写入。
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { ThemeGroup } from '~/schemas/discipline';

async function loadThemes(
  db: D1Database,
  discipline: string,
): Promise<ReturnType<typeof ThemeGroup.parse>[] | null> {
  const row = await db
    .prepare('SELECT themes_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ themes_json: string | null }>();
  if (!row) return null;
  let raw: unknown;
  try { raw = JSON.parse(row.themes_json ?? '[]'); } catch { raw = []; }
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((t) => ThemeGroup.safeParse(t))
    .filter((p): p is { success: true; data: ReturnType<typeof ThemeGroup.parse> } => p.success)
    .map((p) => p.data);
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = params.discipline;
  const key = params.key;
  if (!discipline || !key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let body: unknown;
  try { body = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }

  const themes = await loadThemes(env.DB, discipline);
  if (themes === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  const idx = themes.findIndex((t) => t.key === key);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  // 合并新字段 — key + schools[] 不变（schools 由 reorder API 管）
  const merged = { ...themes[idx], ...(body as object), key, schools: themes[idx].schools };
  const validated = ThemeGroup.safeParse(merged);
  if (!validated.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: validated.error.issues });

  themes[idx] = validated.data;
  try {
    await env.DB
      .prepare('UPDATE discipline SET themes_json = ?, updated_at = ? WHERE key = ?')
      .bind(JSON.stringify(themes), new Date().toISOString(), discipline)
      .run();
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'd1_write_failed' as never, detail: (e as Error).message });
  }

  return jsonRes(200, { ok: true, updated: key, source: 'd1' });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = params.discipline;
  const key = params.key;
  if (!discipline || !key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const themes = await loadThemes(env.DB, discipline);
  if (themes === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  const idx = themes.findIndex((t) => t.key === key);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  // has_dependents gate：检查 school 表实际 FK，避免 themes_json stale
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) as n FROM school WHERE discipline = ? AND theme_key = ?')
    .bind(discipline, key)
    .first<{ n: number }>();
  const refCount = countRow?.n ?? 0;
  if (refCount > 0) {
    return jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: `theme "${key}" 还被 ${refCount} 个学派引用 (school.theme_key)。先把它们 PATCH 到别的 theme 再删。`,
      ref_count: refCount,
    });
  }

  themes.splice(idx, 1);

  try {
    await env.DB
      .prepare('UPDATE discipline SET themes_json = ?, updated_at = ? WHERE key = ?')
      .bind(JSON.stringify(themes), new Date().toISOString(), discipline)
      .run();
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'd1_write_failed' as never, detail: (e as Error).message });
  }

  return jsonRes(200, { ok: true, deleted: key, source: 'd1' });
};

/** GET 用于编辑器加载（key 已在 url，返当前 theme + 该 discipline 所有 theme keys 用于校验） */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = params.discipline;
  const key = params.key;
  if (!discipline || !key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const themes = await loadThemes(env.DB, discipline);
  if (themes === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });
  const theme = themes.find((t) => t.key === key);
  if (!theme) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  const countRow = await env.DB
    .prepare('SELECT COUNT(*) as n FROM school WHERE discipline = ? AND theme_key = ?')
    .bind(discipline, key)
    .first<{ n: number }>();

  return jsonRes(200, {
    ok: true,
    json: theme,
    source: 'd1',
    school_count: countRow?.n ?? 0,
  });
};
