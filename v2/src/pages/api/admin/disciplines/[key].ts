/**
 * /api/admin/disciplines/<key>  (v0.5.98)
 *
 * PUT    — 改 metadata (title/tagline)，不能改 key
 * DELETE — 4×0 gate (view/school/scholar/kp 都 0 才能删)
 */

import type { APIRoute } from 'astro';
import { Discipline, type Discipline as DisciplineT } from '~/schemas/discipline';
import { getFile, putFile, deleteFile } from '~/lib/github';

interface PutBody {
  title?: { zh?: string; en?: string | null; ja?: string | null };
  tagline?: { zh?: string | null; ja?: string | null };
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });

  const key = params.key;
  if (!key) return json(400, { ok: false, reason: 'bad_request' });

  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return json(503, { ok: false, reason: 'config_missing' });
  }

  // 拉现有 git 文件 + sha
  const path = `v2/data/${key}/discipline.json`;
  const cur = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!cur.ok) {
    if (cur.reason === 'not_found') return json(404, { ok: false, reason: 'discipline_not_found' });
    return json(502, { ok: false, reason: 'github_error', detail: cur.detail });
  }

  let curData: DisciplineT;
  try { curData = JSON.parse(cur.data.content) as DisciplineT; }
  catch (e) { return json(502, { ok: false, reason: 'github_error', detail: `corrupt json: ${(e as Error).message}` }); }

  let body: PutBody;
  try { body = (await request.json()) as PutBody; }
  catch { return json(400, { ok: false, reason: 'bad_request', detail: 'invalid json' }); }

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

  // 写 git
  const content = JSON.stringify(parsed.data, null, 2) + '\n';
  const message = `v2: edit discipline ${key} by ${locals.user.email}`;
  const ghRes = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, sha: cur.data.sha, branch: 'main' },
  );
  if (!ghRes.ok) {
    return json(502, { ok: false, reason: 'github_error', detail: ghRes.detail });
  }

  // 写 D1
  await env.DB.prepare(
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
  ).run();

  return json(200, { ok: true, discipline: parsed.data, commit_sha: ghRes.data.commit_sha });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });

  const key = params.key;
  if (!key) return json(400, { ok: false, reason: 'bad_request' });

  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return json(503, { ok: false, reason: 'config_missing' });
  }

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

  // 拉 git sha 才能 delete
  const path = `v2/data/${key}/discipline.json`;
  const cur = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (cur.ok) {
    const message = `v2: delete discipline ${key} by ${locals.user.email}`;
    const ghDelRes = await deleteFile(
      { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
      path,
      { message, sha: cur.data.sha, branch: 'main' },
    );
    if (!ghDelRes.ok) {
      return json(502, { ok: false, reason: 'github_error', detail: ghDelRes.detail });
    }
  }
  // 即使 git 文件不在（罕见），仍删 D1（保持一致）

  // 删 D1（user_permission cascade，view/school/scholar/kp 已 0 不会触发 FK）
  await env.DB.prepare('DELETE FROM discipline WHERE key = ?').bind(key).run();

  return json(200, { ok: true, key });
};
