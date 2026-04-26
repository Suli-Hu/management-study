/**
 * POST /api/edit/reorder/school-concepts  (v0.4.26)
 *   body: { schoolKey: string, kpIds: string[] }
 *   行为：读 school JSON → 校验 kpIds 必须是原 concepts[] 的同集合 →
 *         concepts = kpIds → PUT 回 GitHub（自动用 GET 拿到的 sha 防覆盖冲突）
 *
 *   不需要前端传 base_sha：reorder 只改 concepts 数组，并发风险低；
 *   后端单次 GET+PUT 顺序操作。GitHub 自身 sha 锁挡并发覆盖。
 */

import type { APIRoute } from 'astro';
import { getFile, putFile } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { School } from '~/schemas/school';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  }

  let body: { schoolKey?: string; kpIds?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { schoolKey, kpIds } = body;
  if (!schoolKey || !Array.isArray(kpIds) || kpIds.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'schoolKey + kpIds[] required' });
  }

  // discipline lookup
  const row = await env.DB.prepare('SELECT discipline FROM school WHERE key = ?').bind(schoolKey).first() as { discipline: string } | null;
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });
  if (!locals.canEdit(row.discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const path = `v2/data/${row.discipline}/schools/${schoolKey}.json`;
  const fetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!fetched.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: fetched.detail });

  let parsed: unknown;
  try {
    parsed = JSON.parse(fetched.data.content);
  } catch (e) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` });
  }
  const checked = School.safeParse(parsed);
  if (!checked.success) {
    return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: checked.error.issues });
  }
  const school = checked.data;

  // 校验 kpIds 必须是 concepts 的同集合（防漏 / 防注入未关联 KP）
  const orig = new Set(school.concepts);
  const next = new Set(kpIds);
  if (orig.size !== next.size || [...orig].some((id) => !next.has(id))) {
    return jsonRes(400, {
      ok: false,
      reason: 'concept_set_mismatch' as const,
      detail: `kpIds 必须是原 concepts[] 的同集合（仅允许重排，不能增删）`,
    });
  }

  school.concepts = kpIds;
  school.updatedAt = new Date().toISOString();

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: reorder school/${schoolKey} concepts by ${adminEmail}`;
  const content = JSON.stringify(school, null, 2) + '\n';
  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, sha: fetched.data.sha, branch: 'main' },
  );
  if (!res.ok) {
    return jsonRes<EditError>(res.reason === 'conflict' ? 409 : 502, { ok: false, reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error', detail: res.detail });
  }
  return jsonRes(200, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
};
