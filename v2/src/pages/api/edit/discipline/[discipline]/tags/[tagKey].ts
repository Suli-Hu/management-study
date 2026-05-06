/**
 * /api/edit/discipline/[discipline]/tags/[tagKey]   (v0.8.36)
 *
 *   PATCH  body: { label?: { zh?, ja?, en? }, color? } → 改单个 tag (D1 only)
 *   DELETE → 删单个 tag (D1 only) — has_dependents gate (被引用 → 409)
 *
 * v0.8.27 规则：D1 是真值源，不写 git。
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { getDb } from '~/lib/db';
import { Tag } from '~/schemas/discipline';

async function loadTagsFromD1(db: D1Database, discipline: string): Promise<Tag[] | null> {
  const row = await db
    .prepare('SELECT tags_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ tags_json: string | null }>();
  if (!row) return null;
  let raw: unknown;
  try { raw = JSON.parse(row.tags_json ?? '[]'); }
  catch { return null; }
  if (!Array.isArray(raw)) return null;
  const valid: Tag[] = [];
  for (const t of raw) {
    const parsed = Tag.safeParse(t);
    if (parsed.success) valid.push(parsed.data);
  }
  return valid;
}

async function writeTagsToD1(db: D1Database, discipline: string, tags: Tag[]): Promise<void> {
  await db
    .prepare('UPDATE discipline SET tags_json = ?, updated_at = ? WHERE key = ?')
    .bind(JSON.stringify(tags), new Date().toISOString(), discipline)
    .run();
}

async function countRefs(db: D1Database, discipline: string, tagKey: string): Promise<number> {
  const needle = `%"${tagKey}"%`;
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM school   WHERE discipline = ?1 AND tags_json LIKE ?2) +
      (SELECT COUNT(*) FROM scholar  WHERE discipline = ?1 AND tags_json LIKE ?2) +
      (SELECT COUNT(*) FROM kp       WHERE discipline = ?1 AND tags_json LIKE ?2) AS n
  `;
  const row = await db.prepare(sql).bind(discipline, needle).first<{ n: number }>();
  return row?.n ?? 0;
}

// ============================================================
// PATCH — 改单个 tag (D1 only)
// ============================================================
const PatchBody = z.object({
  label: z.object({
    zh: z.string().trim().min(1).optional(),
    ja: z.string().trim().min(1).optional(),
    en: z.string().trim().min(1).optional(),
  }).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色必须是 #RRGGBB hex').optional(),
}).refine((v) => Object.keys(v).length > 0, 'PATCH 至少需要一个字段');

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  const discipline = params.discipline;
  const tagKey = params.tagKey;
  if (!discipline || !tagKey) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + tagKey required' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }
  const body = PatchBody.safeParse(raw);
  if (!body.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: body.error.issues });

  const db = getDb(env);
  const tags = await loadTagsFromD1(db, discipline);
  if (tags === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} not found` });

  const idx = tags.findIndex((t) => t.key === tagKey);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `tag ${tagKey} not in library` });

  const current = tags[idx]!;
  const merged: Tag = {
    key: current.key,
    label: body.data.label
      ? {
          zh: body.data.label.zh ?? current.label.zh,
          ja: body.data.label.ja ?? current.label.ja,
          en: body.data.label.en ?? current.label.en,
        }
      : current.label,
    color: body.data.color ?? current.color,
  };
  tags[idx] = merged;

  try { await writeTagsToD1(db, discipline, tags); }
  catch (e) {
    return jsonRes(500, { ok: false, reason: 'd1_write_failed' as const, detail: (e as Error).message });
  }

  return jsonRes(200, { ok: true, tag: merged, source: 'd1' });
};

// ============================================================
// DELETE — 删单个 tag (D1 only) — has_dependents gate
// ============================================================
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  const discipline = params.discipline;
  const tagKey = params.tagKey;
  if (!discipline || !tagKey) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + tagKey required' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const db = getDb(env);
  const tags = await loadTagsFromD1(db, discipline);
  if (tags === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} not found` });

  const idx = tags.findIndex((t) => t.key === tagKey);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `tag ${tagKey} not in library` });

  // has_dependents gate
  const refs = await countRefs(db, discipline, tagKey);
  if (refs > 0) {
    return jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: `tag ${tagKey} 还被 ${refs} 个 entity 引用，请先解除引用再删`,
      refs,
    });
  }

  const next = tags.filter((_, i) => i !== idx);
  try { await writeTagsToD1(db, discipline, next); }
  catch (e) {
    return jsonRes(500, { ok: false, reason: 'd1_write_failed' as const, detail: (e as Error).message });
  }

  return jsonRes(200, { ok: true, deleted_key: tagKey, remaining_count: next.length, source: 'd1' });
};
