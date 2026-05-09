/**
 * /api/tags/:key?discipline=<key>
 *
 * PATCH → update label/color
 * DELETE → delete (only if no refs, otherwise 409)
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Tag } from '~/schemas/discipline';

async function loadTags(db: D1Database, discipline: string): Promise<z.infer<typeof Tag>[] | null> {
  const row = await db
    .prepare('SELECT tags_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ tags_json: string | null }>();
  if (!row) return null;
  let raw: unknown;
  try { raw = JSON.parse(row.tags_json ?? '[]'); } catch { raw = []; }
  if (!Array.isArray(raw)) return [];
  const valid: z.infer<typeof Tag>[] = [];
  for (const t of raw) {
    const p = Tag.safeParse(t);
    if (p.success) valid.push(p.data);
  }
  return valid;
}

async function writeTags(db: D1Database, discipline: string, tags: z.infer<typeof Tag>[]): Promise<void> {
  await db
    .prepare('UPDATE discipline SET tags_json = ?, updated_at = ? WHERE key = ?')
    .bind(JSON.stringify(tags), new Date().toISOString(), discipline)
    .run();
}

async function countRefs(db: D1Database, discipline: string, tagKey: string): Promise<number> {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM school s, json_each(s.tags_json) je
        WHERE s.discipline = ?1 AND je.value = ?2) +
      (SELECT COUNT(*) FROM scholar sc, json_each(sc.tags_json) je
        WHERE sc.discipline = ?1 AND je.value = ?2) +
      (SELECT COUNT(*) FROM kp k, json_each(k.tags_json) je
        WHERE k.discipline = ?1 AND je.value = ?2) AS n
  `;
  const row = await db.prepare(sql).bind(discipline, tagKey).first<{ n: number }>();
  return row?.n ?? 0;
}

const PatchBody = z.object({
  label: z.object({
    zh: z.string().trim().min(1).optional(),
    ja: z.string().trim().min(1).optional(),
    en: z.string().trim().min(1).optional(),
  }).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const PATCH: APIRoute = async ({ request, params, url, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = url.searchParams.get('discipline');
  const key = params.key;
  if (!discipline || !key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + key 必填' });
  if (!locals.user) return jsonRes<EditError>(401, { ok: false, reason: 'not_admin' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'invalid json' }); }
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) return jsonRes(422, { ok: false, reason: 'schema_invalid' as const, detail: parsed.error.issues });

  const tags = await loadTags(env.DB, discipline);
  if (tags === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} 不存在` });
  const idx = tags.findIndex((t) => t.key === key);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `tag ${key} 不存在` });

  const cur = tags[idx];
  const next = Tag.safeParse({
    ...cur,
    label: parsed.data.label ? { ...(cur.label ?? {}), ...parsed.data.label } : cur.label,
    color: parsed.data.color ?? cur.color,
  });
  if (!next.success) return jsonRes(422, { ok: false, reason: 'schema_invalid' as const, detail: next.error.issues });
  tags[idx] = next.data;
  await writeTags(env.DB, discipline, tags);
  return jsonRes(200, { ok: true, discipline, tag: next.data });
};

export const DELETE: APIRoute = async ({ params, url, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = url.searchParams.get('discipline');
  const key = params.key;
  if (!discipline || !key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + key 必填' });
  if (!locals.user) return jsonRes<EditError>(401, { ok: false, reason: 'not_admin' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const tags = await loadTags(env.DB, discipline);
  if (tags === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} 不存在` });
  const idx = tags.findIndex((t) => t.key === key);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `tag ${key} 不存在` });

  const refCount = await countRefs(env.DB, discipline, key);
  if (refCount > 0) {
    return jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: `tag ${key} 仍被 ${refCount} 个实体引用（school/scholar/kp.tags_json）。先移除引用再删。`,
      ref_count: refCount,
    });
  }

  tags.splice(idx, 1);
  await writeTags(env.DB, discipline, tags);
  return jsonRes(200, { ok: true, deleted: key });
};

