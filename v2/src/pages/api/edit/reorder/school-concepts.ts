/**
 * POST /api/edit/reorder/school-concepts  (v0.4.26 / v0.5.37 校验改 D1)
 *   body: { schoolKey: string, kpIds: string[] }
 *   行为：用 D1 kp_school 校验 kpIds 必须是该学派当前 KP 的同集合 →
 *         读 school JSON → concepts = kpIds → PUT 回 GitHub
 *
 *   v0.5.37 改：原本对比 school.concepts 集合，但 concepts 是显示顺序，
 *   而真实归属由 KP.schools[] 决定（sync 进 kp_school）。如果 KP 加进新学派
 *   但 school.json 没同步更新 concepts，rendered 列表（D1 驱动）会比 concepts 多，
 *   拖动后保存就报 set_mismatch。改成对比 kp_school（= 渲染源），并照搬 scholar-kps.ts 模式。
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

  // discipline lookup + admin gate
  const row = await env.DB.prepare('SELECT discipline FROM school WHERE key = ?').bind(schoolKey).first() as { discipline: string } | null;
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });
  if (!locals.canEdit(row.discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 校验 kpIds 必须是该学派当前 KP 的同集合（用 D1 kp_school —— 渲染源）
  const kpRows = await env.DB.prepare('SELECT kp_id FROM kp_school WHERE school_key = ?').bind(schoolKey).all<{ kp_id: string }>();
  const currentKpIds = new Set((kpRows.results ?? []).map((r) => r.kp_id));
  const next = new Set(kpIds);
  if (currentKpIds.size !== next.size || [...currentKpIds].some((id) => !next.has(id))) {
    return jsonRes(400, {
      ok: false,
      reason: 'concept_set_mismatch' as const,
      detail: `kpIds 必须是该学派当前 KP 的同集合（仅允许重排，不能增删）`,
    });
  }

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

  school.concepts = kpIds;
  school.updatedAt = new Date().toISOString();

  // v0.8.34: 直接更新 D1 kp_school.position（v0.8.27 后 deploy 不再 sync:d1，
  // 单写 git 不会传到 D1，UI 永远看老顺序）。D1 写在前 — 立即生效；git 写在后做审计。
  const updateStmts = kpIds.map((kpId, i) =>
    env.DB
      .prepare('UPDATE kp_school SET position = ? WHERE school_key = ? AND kp_id = ?')
      .bind(i, schoolKey, kpId),
  );
  try {
    await env.DB.batch(updateStmts);
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'd1_write_failed' as never, detail: (e as Error).message });
  }

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: reorder school/${schoolKey} concepts by ${adminEmail}`;
  const content = JSON.stringify(school, null, 2) + '\n';
  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, sha: fetched.data.sha, branch: 'main' },
  );
  // v0.8.34: git 写失败不阻断 — D1 已经更新，UI 已经持久化。git 仅作审计 trail。
  if (!res.ok) {
    console.warn('[reorder/school-concepts] git writeback failed (D1 已更新):', res.detail);
    return jsonRes(200, { ok: true, d1_updated: true, git_committed: false, warning: 'git writeback failed but D1 saved' });
  }
  return jsonRes(200, { ok: true, d1_updated: true, git_committed: true, commit_sha: res.data.commit_sha });
};
