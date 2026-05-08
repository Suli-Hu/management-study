/**
 * POST /api/new/theme  (v0.4.29 Phase 1)
 *   body: { discipline, key, title: I18n, desc?: I18n, tags?: string[] }
 *   行为（v0.12.0+）：D1-only 写 discipline.themes_json（GitHub 不再是真源）
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { ThemeGroup } from '~/schemas/discipline';
import { generateUniqueKey } from '~/lib/slugify';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });

  let body: { json?: unknown; discipline?: string };
  try { body = (await request.json()) as typeof body; } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }
  const discipline = body.discipline;
  if (!discipline || !body.json) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + json required' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const row = await env.DB
    .prepare('SELECT themes_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ themes_json: string | null }>();
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} 不存在` });

  let rawThemes: unknown;
  try { rawThemes = JSON.parse(row.themes_json ?? '[]'); } catch { rawThemes = []; }
  const list = Array.isArray(rawThemes) ? rawThemes : [];
  const themes = list
    .map((t) => ThemeGroup.safeParse(t))
    .filter((p): p is { success: true; data: ReturnType<typeof ThemeGroup.parse> } => p.success)
    .map((p) => p.data);

  const rawJson = body.json as Record<string, unknown>;
  let providedKey = typeof rawJson.key === 'string' ? rawJson.key.trim() : '';
  if (!providedKey) {
    const titleEn = (rawJson.title as { en?: string } | undefined)?.en
      ?? (rawJson.title as { zh?: string } | undefined)?.zh;
    providedKey = await generateUniqueKey(
      titleEn,
      'th',
      async (k) => themes.some((t) => t.key === k),
    );
  }

  // 校验新主题 schema（schools[] 留空，新建后用户再拖学派进来）
  const merged = { ...rawJson, key: providedKey, schools: [] };
  const validated = ThemeGroup.safeParse(merged);
  if (!validated.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: validated.error.issues });

  // 用户显式传 key 时检查重复（generateUniqueKey 路径已保证 unique）
  if (rawJson.key && themes.some((t) => t.key === validated.data.key)) {
    return jsonRes(409, { ok: false, reason: 'key_exists' as const, detail: `theme key "${validated.data.key}" 已存在` });
  }

  themes.push(validated.data);

  try {
    await env.DB
      .prepare('UPDATE discipline SET themes_json = ?, updated_at = ? WHERE key = ?')
      .bind(JSON.stringify(themes), new Date().toISOString(), discipline)
      .run();
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'd1_write_failed' as never, detail: (e as Error).message });
  }

  return jsonRes(201, { ok: true, key: validated.data.key, source: 'd1' });
};
