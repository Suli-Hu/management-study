/**
 * /api/admin/disciplines  (v0.5.98)
 *
 * GET  — list 所有 discipline + 4 个 count (view/school/scholar/kp)
 * POST — 创建新 discipline
 *        Body: { key, title:{zh,en?,ja?}, tagline?:{zh?,ja?} }
 *        - 写 git: v2/data/<key>/discipline.json
 *        - 写 D1: discipline 表 (themes/tags 都默认空)
 *        - 不创建子目录的 .gitkeep — 第一次写学派/学者/KP 时自动建路径
 */

import type { APIRoute } from 'astro';
import { Discipline, type Discipline as DisciplineT } from '~/schemas/discipline';
import { putFile } from '~/lib/github';

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

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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

  return json(200, {
    ok: true,
    disciplines: (rows.results ?? []).map((r) => ({
      key: r.key,
      title: { zh: r.title_zh, en: r.title_en, ja: r.title_ja },
      tagline: { zh: r.tagline_zh, ja: r.tagline_ja },
      themes_count: JSON.parse(r.themes_json || '[]').length,
      tags_count: JSON.parse(r.tags_json || '[]').length,
      created_at: r.created_at,
      updated_at: r.updated_at,
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
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return json(503, { ok: false, reason: 'config_missing' });
  }

  let body: CreateBody;
  try { body = (await request.json()) as CreateBody; }
  catch { return json(400, { ok: false, reason: 'bad_request', detail: 'invalid json' }); }

  const titleZh = body.title?.zh?.trim() ?? '';
  const titleEn = body.title?.en?.trim() ?? '';
  if (!titleZh) return json(400, { ok: false, reason: 'bad_request', detail: 'title.zh required' });
  if (!titleEn) return json(400, { ok: false, reason: 'bad_request', detail: 'title.en required (用来生成 key)' });

  // v0.6.1 自动从 English slugify 生成 key
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

  // 写 git: v2/data/<key>/discipline.json
  const path = `v2/data/${key}/discipline.json`;
  const content = JSON.stringify(parsed.data, null, 2) + '\n';
  const message = `v2: create discipline ${key} by ${locals.user.email}`;
  const ghRes = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, branch: 'main' },
  );
  if (!ghRes.ok) {
    return json(502, { ok: false, reason: 'github_error', detail: ghRes.detail });
  }

  // 写 D1
  await env.DB.prepare(
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
  ).run();

  return json(200, {
    ok: true,
    discipline: parsed.data,
    commit_sha: ghRes.data.commit_sha,
  });
};
