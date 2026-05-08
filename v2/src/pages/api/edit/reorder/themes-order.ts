/**
 * POST /api/edit/reorder/themes-order  (v0.4.31 Phase 3)
 *   body: { discipline: string, themeKeys: string[] }
 *   行为：仅重排 discipline.themes[] 数组本身（章节顺序），各 theme 内 schools[] 不变
 *
 *   校验：themeKeys 必须是原 themes[].key 的同集合（reorder only，不能凭空增删）
 *
 * v0.12.0+: D1-only。GitHub 不再是真源，也不再作为审计写入。
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { ThemeGroup } from '~/schemas/discipline';
import { z } from 'zod';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });

  let body: { discipline?: string; themeKeys?: string[] };
  try { body = (await request.json()) as typeof body; } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { discipline, themeKeys } = body;
  if (!discipline || !Array.isArray(themeKeys) || themeKeys.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + themeKeys[] required' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const row = await env.DB
    .prepare('SELECT themes_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ themes_json: string | null }>();
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  let raw: unknown;
  try { raw = JSON.parse(row.themes_json ?? '[]'); } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'db_corrupt' as never, detail: `discipline.themes_json invalid: ${(e as Error).message}` });
  }
  const themesParsed = z.array(ThemeGroup).safeParse(raw);
  if (!themesParsed.success) {
    return jsonRes<EditError>(500, { ok: false, reason: 'db_corrupt' as never, detail: themesParsed.error.issues });
  }
  const themes = themesParsed.data;

  // 集合校验
  const orig = new Set(themes.map((t) => t.key));
  const next = new Set(themeKeys);
  if (orig.size !== next.size || [...orig].some((k) => !next.has(k))) {
    return jsonRes(400, {
      ok: false,
      reason: 'theme_set_mismatch' as const,
      detail: 'themeKeys 必须是原 discipline.themes[] key 的同集合（仅允许重排，不能凭空增删）',
    });
  }

  // 按新顺序重新排列 themes 数组
  const themesByKey = new Map(themes.map((t) => [t.key, t]));
  const reordered = themeKeys.map((k) => themesByKey.get(k)).filter(Boolean);
  try {
    await env.DB
      .prepare('UPDATE discipline SET themes_json = ?, updated_at = ? WHERE key = ?')
      .bind(JSON.stringify(reordered), new Date().toISOString(), discipline)
      .run();
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'd1_write_failed' as never, detail: (e as Error).message });
  }

  return jsonRes(200, { ok: true, d1_updated: true });
};
