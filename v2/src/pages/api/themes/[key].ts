/**
 * GET    /api/themes/:key?discipline=<key>
 * DELETE /api/themes/:key?discipline=<key>
 *
 * v0.10.0 (Issue #2 of v2 grouping refactor)：theme CRUD 补全。
 * PATCH 走 /api/edit/theme/[discipline]/[key] (v0.4.29 已有，git+D1 双写遗留)。
 * POST 走 /api/new/theme (v0.4.29 已有)。
 *
 * 这里 GET / DELETE 是 D1-only (v0.8.27 后 D1 是真值源)。
 *
 * DELETE has_dependents gate：拒绝有 school 把 theme_key 指向它的 theme，避免悬空 FK。
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
  try { raw = JSON.parse(row.themes_json ?? '[]'); }
  catch { raw = []; }
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((t) => ThemeGroup.safeParse(t))
    .filter((p): p is { success: true; data: ReturnType<typeof ThemeGroup.parse> } => p.success)
    .map((p) => p.data);
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const key = params.key;
  const discipline = url.searchParams.get('discipline');
  if (!key || !discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'key + discipline 必填' });
  if (!locals.canRead(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const themes = await loadThemes(env.DB, discipline);
  if (themes === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} 不存在` });
  const theme = themes.find((t) => t.key === key);
  if (!theme) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `theme ${key} 不存在` });

  const countRow = await env.DB
    .prepare('SELECT COUNT(*) as n FROM school WHERE discipline = ? AND theme_key = ?')
    .bind(discipline, key)
    .first<{ n: number }>();

  return jsonRes(200, {
    ok: true,
    theme: {
      key: theme.key,
      title: theme.title,
      desc: theme.desc,
      tags: theme.tags,
      school_count: countRow?.n ?? 0,
    },
  });
};

export const DELETE: APIRoute = async ({ params, url, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const key = params.key;
  const discipline = url.searchParams.get('discipline');
  if (!key || !discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'key + discipline 必填' });
  if (!locals.user) return jsonRes<EditError>(401, { ok: false, reason: 'not_admin' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const themes = await loadThemes(env.DB, discipline);
  if (themes === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} 不存在` });
  const idx = themes.findIndex((t) => t.key === key);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `theme ${key} 不存在` });

  // has_dependents：检查 school 表实际 FK
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) as n FROM school WHERE discipline = ? AND theme_key = ?')
    .bind(discipline, key)
    .first<{ n: number }>();
  const refCount = countRow?.n ?? 0;
  if (refCount > 0) {
    return jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: `学派组「${themes[idx].title?.zh ?? key}」还被 ${refCount} 个学派引用 (school.theme_key)。先把它们 PATCH 到别的 theme 再删。`,
      ref_count: refCount,
    });
  }

  themes.splice(idx, 1);
  await env.DB
    .prepare('UPDATE discipline SET themes_json = ?, updated_at = ? WHERE key = ?')
    .bind(JSON.stringify(themes), new Date().toISOString(), discipline)
    .run();

  return jsonRes(200, { ok: true, deleted: key });
};
