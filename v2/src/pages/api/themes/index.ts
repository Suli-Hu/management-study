/**
 * GET /api/themes?discipline=<key>
 *
 * 返回该 discipline 下所有 theme（学派组）的列表，从 D1 discipline.themes_json 读。
 * v0.10.0 (Issue #2 of v2 grouping refactor)：补 schools/scholars 已有的 list endpoint 平衡。
 *
 * 每条 theme 附带 `school_count` 字段（实际 D1 中 school WHERE theme_key=key COUNT），
 * 跟 themes_json[].schools[] 老字段不一定一致（v0.5.67 起 view.groups 才是渲染源）。
 *
 * canRead 才能 list；不需要 canEdit。
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { ThemeGroup } from '~/schemas/discipline';

export const GET: APIRoute = async ({ url, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = url.searchParams.get('discipline');
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline 必填' });
  if (!locals.canRead(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const row = await env.DB
    .prepare('SELECT themes_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ themes_json: string | null }>();
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} 不存在` });

  let raw: unknown;
  try { raw = JSON.parse(row.themes_json ?? '[]'); }
  catch { raw = []; }
  const list = Array.isArray(raw) ? raw : [];
  const themes = list
    .map((t) => ThemeGroup.safeParse(t))
    .filter((p): p is { success: true; data: ReturnType<typeof ThemeGroup.parse> } => p.success)
    .map((p) => p.data);

  // 每个 theme 真实 school 引用数 (school.theme_key)
  const counts = new Map<string, number>();
  if (themes.length > 0) {
    const placeholders = themes.map(() => '?').join(',');
    const rows = await env.DB
      .prepare(`SELECT theme_key, COUNT(*) as n FROM school WHERE discipline = ? AND theme_key IN (${placeholders}) GROUP BY theme_key`)
      .bind(discipline, ...themes.map((t) => t.key))
      .all<{ theme_key: string; n: number }>();
    for (const r of rows.results ?? []) counts.set(r.theme_key, r.n);
  }

  return jsonRes(200, {
    ok: true,
    discipline,
    themes: themes.map((t) => ({
      key: t.key,
      title: t.title,
      desc: t.desc,
      tags: t.tags,
      school_count: counts.get(t.key) ?? 0,
    })),
  });
};
