/**
 * POST /api/edit/reorder/discipline-schools
 *
 *   body:
 *     - discipline: string
 *     - themesSchools: { [themeKey]: schoolKey[] }   — 多 theme 一次更新
 *     - movedSchool?: { key, fromTheme, toTheme }    — 跨组拖动时存在；school.theme_key 字段同步更新
 *
 *   行为：
 *     1. canEdit(discipline) gate
 *     2. D1 读 discipline.themes_json，校验 themesSchools schoolKeys 全集 == 原 themes 全集
 *     3. UPDATE discipline SET themes_json = ?
 *     4. 跨组移动 → UPDATE school SET theme_key = ?
 *
 * 历史：
 *   v0.4.30 重写支持跨 theme 移动（git Tree API）
 *   v0.6.7 加 D1 双写
 *   v0.11.6 移除 git 依赖（D1-only）。同 school-concepts.ts 同款理由。
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { ThemeGroup } from '~/schemas/discipline';
import { z } from 'zod';

interface ReorderBody {
  discipline?: string;
  themesSchools?: Record<string, string[]>;
  movedSchool?: { key: string; fromTheme: string; toTheme: string };
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;

  let body: ReorderBody;
  try { body = (await request.json()) as ReorderBody; } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { discipline, themesSchools, movedSchool } = body;
  if (!discipline || !themesSchools || Object.keys(themesSchools).length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + themesSchools required' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 1. D1 读 discipline.themes_json
  const row = await env.DB
    .prepare('SELECT themes_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ themes_json: string }>();
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  let themesRaw: unknown;
  try { themesRaw = JSON.parse(row.themes_json); } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'db_corrupt' as never, detail: `discipline.themes_json invalid: ${(e as Error).message}` });
  }
  const themesParsed = z.array(ThemeGroup).safeParse(themesRaw);
  if (!themesParsed.success) {
    return jsonRes<EditError>(500, { ok: false, reason: 'db_corrupt' as never, detail: themesParsed.error.issues });
  }
  const themes = themesParsed.data;

  // 2. 校验：每个 themeKey 必须存在
  const affectedThemeIdxs: Record<string, number> = {};
  for (const themeKey of Object.keys(themesSchools)) {
    const idx = themes.findIndex((t) => t.key === themeKey);
    if (idx < 0) return jsonRes(400, { ok: false, reason: 'theme_not_found' as const, detail: `themeKey "${themeKey}" not in discipline.themes[]` });
    affectedThemeIdxs[themeKey] = idx;
  }

  // 3. 集合校验：受影响 themes 的新 schoolKeys 全集 == 原 schools[] 全集
  const origAll = new Set<string>();
  for (const themeKey of Object.keys(themesSchools)) {
    themes[affectedThemeIdxs[themeKey]].schools.forEach((k) => origAll.add(k));
  }
  const nextAll = new Set<string>();
  for (const newKeys of Object.values(themesSchools)) {
    newKeys.forEach((k) => nextAll.add(k));
  }
  if (origAll.size !== nextAll.size || [...origAll].some((k) => !nextAll.has(k))) {
    return jsonRes(400, {
      ok: false,
      reason: 'school_set_mismatch' as const,
      detail: '受影响 themes 的 schoolKeys 全集必须等于原 schools[] 全集（仅允许重排/移动，不能凭空增删）',
    });
  }

  // 4. 应用更新到 themes 数组
  for (const [themeKey, newKeys] of Object.entries(themesSchools)) {
    themes[affectedThemeIdxs[themeKey]].schools = newKeys;
  }
  const now = new Date().toISOString();
  const newThemesJson = JSON.stringify(themes);

  // 5. D1 batch update
  const stmts = [
    env.DB
      .prepare('UPDATE discipline SET themes_json = ?, updated_at = ? WHERE key = ?')
      .bind(newThemesJson, now, discipline),
  ];

  // 跨组移动：同步更新 school.theme_key
  if (movedSchool) {
    if (!movedSchool.key || !movedSchool.fromTheme || !movedSchool.toTheme) {
      return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'movedSchool.{key,fromTheme,toTheme} required' });
    }
    stmts.push(
      env.DB
        .prepare('UPDATE school SET theme_key = ?, updated_at = ? WHERE key = ? AND discipline = ?')
        .bind(movedSchool.toTheme, now, movedSchool.key, discipline),
    );
  }

  try {
    await env.DB.batch(stmts);
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'd1_write_failed' as never, detail: (e as Error).message });
  }

  return jsonRes(200, { ok: true, d1_updated: true });
};
