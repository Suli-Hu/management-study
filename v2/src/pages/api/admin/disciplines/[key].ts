/**
 * /api/admin/disciplines/<key>
 *
 * PUT    - 改 metadata (title/tagline)，不能改 key
 * DELETE - 4x0 gate (view/school/scholar/kp 都 0 才能删)
 *
 * D1 is the source of truth. These admin operations no longer write
 * GitHub JSON business data.
 */

import type { APIRoute } from 'astro';
import { Discipline, type Discipline as DisciplineT } from '~/schemas/discipline';

interface PutBody {
  title?: { zh?: string; en?: string | null; ja?: string | null };
  tagline?: { zh?: string | null; ja?: string | null };
}

interface DisciplineRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  tagline_zh: string | null;
  tagline_ja: string | null;
  tags_json: string | null;
  themes_json: string | null;
  created_at: string;
  updated_at: string;
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseJsonArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

function rowToDiscipline(row: DisciplineRow): DisciplineT {
  const tagline = row.tagline_zh || row.tagline_ja
    ? {
        zh: row.tagline_zh ?? undefined,
        ja: row.tagline_ja ?? undefined,
      }
    : undefined;

  return {
    key: row.key,
    title: {
      zh: row.title_zh,
      en: row.title_en ?? undefined,
      ja: row.title_ja ?? undefined,
    },
    tagline,
    tags: parseJsonArray(row.tags_json, []),
    themes: parseJsonArray(row.themes_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });

  const key = params.key;
  if (!key) return json(400, { ok: false, reason: 'bad_request' });

  const env = locals.runtime.env;

  let body: PutBody;
  try { body = (await request.json()) as PutBody; }
  catch { return json(400, { ok: false, reason: 'bad_request', detail: 'invalid json' }); }

  const row = await env.DB.prepare(
    `SELECT key, title_zh, title_en, title_ja, tagline_zh, tagline_ja,
            tags_json, themes_json, created_at, updated_at
     FROM discipline
     WHERE key = ?`,
  ).bind(key).first<DisciplineRow>();
  if (!row) return json(404, { ok: false, reason: 'discipline_not_found' });

  const curData = rowToDiscipline(row);

  // 合并改动 — 只允许改 title / tagline
  const titleZh = body.title?.zh?.trim() ?? curData.title.zh;
  if (!titleZh) return json(400, { ok: false, reason: 'bad_request', detail: 'title.zh 不能为空' });

  const updated: DisciplineT = {
    ...curData,
    title: {
      zh: titleZh,
      en: body.title && 'en' in body.title ? (body.title.en?.trim() || undefined) : curData.title.en,
      ja: body.title && 'ja' in body.title ? (body.title.ja?.trim() || undefined) : curData.title.ja,
    },
    tagline: body.tagline ? {
      zh: body.tagline.zh?.trim() || undefined,
      ja: body.tagline.ja?.trim() || undefined,
    } : curData.tagline,
    updatedAt: new Date().toISOString(),
  };

  const parsed = Discipline.safeParse(updated);
  if (!parsed.success) {
    return json(422, { ok: false, reason: 'schema_invalid', detail: parsed.error.issues });
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE discipline SET
         title_zh = ?, title_en = ?, title_ja = ?,
         tagline_zh = ?, tagline_ja = ?,
         updated_at = ?
       WHERE key = ?`,
    ).bind(
      parsed.data.title.zh,
      parsed.data.title.en ?? null,
      parsed.data.title.ja ?? null,
      parsed.data.tagline?.zh ?? null,
      parsed.data.tagline?.ja ?? null,
      parsed.data.updatedAt,
      key,
    ),
    env.DB.prepare(
      `INSERT INTO tenant (id, discipline_key, title_zh, title_en, title_ja, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title_zh = excluded.title_zh,
         title_en = excluded.title_en,
         title_ja = excluded.title_ja,
         updated_at = excluded.updated_at`,
    ).bind(
      key,
      key,
      parsed.data.title.zh,
      parsed.data.title.en ?? null,
      parsed.data.title.ja ?? null,
      row.created_at,
      parsed.data.updatedAt,
    ),
  ]);

  return json(200, { ok: true, discipline: parsed.data });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });

  const key = params.key;
  if (!key) return json(400, { ok: false, reason: 'bad_request' });

  const env = locals.runtime.env;

  const existing = await env.DB.prepare('SELECT key FROM discipline WHERE key = ?').bind(key).first();
  if (!existing) return json(404, { ok: false, reason: 'discipline_not_found' });

  // 4×0 gate — view/school/scholar/kp 都必须 0
  const counts = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM view    WHERE discipline = ?) as v,
       (SELECT COUNT(*) FROM school  WHERE discipline = ?) as s,
       (SELECT COUNT(*) FROM scholar WHERE discipline = ?) as c,
       (SELECT COUNT(*) FROM kp      WHERE discipline = ?) as k`,
  ).bind(key, key, key, key).first<{ v: number; s: number; c: number; k: number }>();
  if (!counts) return json(404, { ok: false, reason: 'discipline_not_found' });
  if (counts.v + counts.s + counts.c + counts.k > 0) {
    return json(409, {
      ok: false,
      reason: 'not_empty',
      detail: { view: counts.v, school: counts.s, scholar: counts.c, kp: counts.k },
    });
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM tenant_member WHERE tenant_id = ?').bind(key),
    env.DB.prepare('DELETE FROM tenant WHERE id = ?').bind(key),
    env.DB.prepare('DELETE FROM discipline WHERE key = ?').bind(key),
  ]);

  return json(200, { ok: true, key });
};
