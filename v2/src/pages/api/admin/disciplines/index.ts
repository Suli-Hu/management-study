/**
 * /api/admin/disciplines
 *
 * GET  - list 所有 discipline + 内容数量 + 权限摘要
 * POST - 创建新 discipline
 *        Body: { key, title:{zh,en?,ja?}, tagline?:{zh?,ja?} }
 *        - 写 D1: discipline + tenant
 *        - 不再写 GitHub 业务数据
 */

import type { APIRoute } from 'astro';
import { Discipline, type Discipline as DisciplineT } from '~/schemas/discipline';

interface ListRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  tagline_zh: string | null;
  tagline_ja: string | null;
  themes_json: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  school_count: number;
  scholar_count: number;
  kp_count: number;
}

interface AccessRow {
  discipline_key: string;
  role: 'admin' | 'guest';
  email: string;
  display_name: string | null;
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });
  const env = locals.runtime.env;

  const rows = await env.DB.prepare(
    `SELECT
       d.key, d.title_zh, d.title_en, d.title_ja,
       d.tagline_zh, d.tagline_ja, d.themes_json, d.tags_json,
       d.created_at, d.updated_at,
       (SELECT COUNT(*) FROM view    WHERE discipline = d.key) as view_count,
       (SELECT COUNT(*) FROM school  WHERE discipline = d.key) as school_count,
       (SELECT COUNT(*) FROM scholar WHERE discipline = d.key) as scholar_count,
       (SELECT COUNT(*) FROM kp      WHERE discipline = d.key) as kp_count
     FROM discipline d
     ORDER BY d.created_at`,
  ).all<ListRow>();

  const accessRows = await env.DB.prepare(
    `SELECT up.discipline_key, up.role, u.email, u.display_name
     FROM user_permission up
     JOIN user u ON u.id = up.user_id
     ORDER BY u.email`,
  ).all<AccessRow>();

  const accessByDiscipline = new Map<string, {
    editors: Array<{ email: string; display_name: string | null }>;
    readers: Array<{ email: string; display_name: string | null }>;
  }>();
  for (const row of accessRows.results ?? []) {
    if (!accessByDiscipline.has(row.discipline_key)) {
      accessByDiscipline.set(row.discipline_key, { editors: [], readers: [] });
    }
    const bucket = accessByDiscipline.get(row.discipline_key)!;
    const user = { email: row.email, display_name: row.display_name };
    if (row.role === 'admin') bucket.editors.push(user);
    else bucket.readers.push(user);
  }

  return json(200, {
    ok: true,
    disciplines: (rows.results ?? []).map((r) => ({
      key: r.key,
      title: { zh: r.title_zh, en: r.title_en, ja: r.title_ja },
      tagline: { zh: r.tagline_zh, ja: r.tagline_ja },
      themes_count: parseJsonArray(r.themes_json).length,
      tags_count: parseJsonArray(r.tags_json).length,
      created_at: r.created_at,
      updated_at: r.updated_at,
      access: accessByDiscipline.get(r.key) ?? { editors: [], readers: [] },
      counts: {
        view: r.view_count,
        school: r.school_count,
        scholar: r.scholar_count,
        kp: r.kp_count,
      },
      is_empty: r.view_count === 0 && r.school_count === 0 && r.scholar_count === 0 && r.kp_count === 0,
    })),
  });
};

interface CreateBody {
  /** v0.6.1 起 key 由后端自动从 title.en slugify 生成，client 不传 */
  title?: { zh?: string; en?: string | null; ja?: string | null };
  tagline?: { zh?: string | null; ja?: string | null };
}

/** Slugify English 标题 → key (lowercase + 非字母数字转 _ + trim 边界 _) */
function slugify(en: string): string {
  return en.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 31);
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });

  const env = locals.runtime.env;

  let body: CreateBody;
  try { body = (await request.json()) as CreateBody; }
  catch { return json(400, { ok: false, reason: 'bad_request', detail: 'invalid json' }); }

  const titleZh = body.title?.zh?.trim() ?? '';
  const titleEn = body.title?.en?.trim() ?? '';
  if (!titleZh) return json(400, { ok: false, reason: 'bad_request', detail: 'title.zh required' });
  if (!titleEn) return json(400, { ok: false, reason: 'bad_request', detail: 'title.en required (用来生成 key)' });

  const key = slugify(titleEn);
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) {
    return json(400, { ok: false, reason: 'bad_request', detail: `English "${titleEn}" 无法生成有效 key (slug=${key})，请改 English 写法` });
  }

  // key 可用性检查
  const existing = await env.DB.prepare('SELECT key FROM discipline WHERE key = ?').bind(key).first();
  if (existing) return json(409, { ok: false, reason: 'key_taken', detail: `discipline "${key}" 已存在` });

  // 构造完整 Discipline JSON (I18nString 用 undefined 表示 absent，不能用 null)
  const now = new Date().toISOString();
  const draft: DisciplineT = {
    key,
    title: {
      zh: titleZh,
      en: body.title?.en?.trim() || undefined,
      ja: body.title?.ja?.trim() || undefined,
    },
    tagline: (body.tagline?.zh?.trim() || body.tagline?.ja?.trim()) ? {
      zh: body.tagline?.zh?.trim() || undefined,
      ja: body.tagline?.ja?.trim() || undefined,
    } : undefined,
    tags: [],
    themes: [],
    createdAt: now,
    updatedAt: now,
  };
  const parsed = Discipline.safeParse(draft);
  if (!parsed.success) {
    return json(422, { ok: false, reason: 'schema_invalid', detail: parsed.error.issues });
  }

  // 写 D1：discipline + tenant 一起创建，保证 API-first 路径立即可用。
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO discipline (key, title_zh, title_en, title_ja, tagline_zh, tagline_ja,
                                accent, tags_json, themes_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      key,
      parsed.data.title.zh,
      parsed.data.title.en ?? null,
      parsed.data.title.ja ?? null,
      parsed.data.tagline?.zh ?? null,
      parsed.data.tagline?.ja ?? null,
      '',
      JSON.stringify([]),
      JSON.stringify([]),
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO tenant (id, discipline_key, title_zh, title_en, title_ja, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      key,
      key,
      parsed.data.title.zh,
      parsed.data.title.en ?? null,
      parsed.data.title.ja ?? null,
      now,
      now,
    ),
  ]);

  return json(200, {
    ok: true,
    discipline: parsed.data,
  });
};
