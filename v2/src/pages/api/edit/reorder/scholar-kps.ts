/**
 * POST /api/edit/reorder/scholar-kps  (v0.5.33)
 *   body: { scholarKey: string, kpIds: string[] }
 *   行为：读 scholar JSON → 校验 kpIds 必须是该学者全部 KP 的同集合 →
 *         scholar.kpsOrder = kpIds → PUT 回 GitHub。
 *
 *   姊妹 endpoint：/api/edit/reorder/school-concepts
 *   差异：scholar 侧无 concepts[]，新加 kpsOrder[]（v0.5.33 schema 字段）。
 *   sync-to-d1 时 kp_scholar.position 优先取 kpsOrder。
 */

import type { APIRoute } from 'astro';
import { getFile, putFile } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Scholar } from '~/schemas/scholar';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  }

  // v0.6.8: discipline 必填（scholar 复合 PK，重名时单 key 无法定位）
  let body: { discipline?: string; scholarKey?: string; kpIds?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { discipline, scholarKey, kpIds } = body;
  if (!discipline || !scholarKey || !Array.isArray(kpIds) || kpIds.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + scholarKey + kpIds[] required' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 验证 (discipline, scholarKey) 存在
  const row = await env.DB
    .prepare('SELECT 1 AS x FROM scholar WHERE discipline = ? AND key = ?')
    .bind(discipline, scholarKey)
    .first() as { x: number } | null;
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  // 校验 kpIds 必须是该学者当前 KP 的同集合（防漏 / 防注入）
  const kpRows = await env.DB
    .prepare('SELECT kp_id FROM kp_scholar WHERE scholar_discipline = ? AND scholar_key = ?')
    .bind(discipline, scholarKey)
    .all<{ kp_id: string }>();
  const currentKpIds = new Set((kpRows.results ?? []).map((r) => r.kp_id));
  const next = new Set(kpIds);
  if (currentKpIds.size !== next.size || [...currentKpIds].some((id) => !next.has(id))) {
    return jsonRes(400, {
      ok: false,
      reason: 'kp_set_mismatch' as const,
      detail: `kpIds 必须是该学者当前 KP 的同集合（仅允许重排，不能增删）`,
    });
  }

  const path = `v2/data/${discipline}/scholars/${scholarKey}.json`;
  const fetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!fetched.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: fetched.detail });

  let parsed: unknown;
  try {
    parsed = JSON.parse(fetched.data.content);
  } catch (e) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` });
  }
  const checked = Scholar.safeParse(parsed);
  if (!checked.success) {
    return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: checked.error.issues });
  }
  const scholar = checked.data;

  scholar.kpsOrder = kpIds;
  scholar.updatedAt = new Date().toISOString();

  // v0.8.34: 直接更新 D1 kp_scholar.position（v0.8.27 后 deploy 不再 sync:d1，
  // 单写 git 不会传到 D1，UI 永远看老顺序）。D1 写在前 — 立即生效；git 写在后做审计。
  const updateStmts = kpIds.map((kpId, i) =>
    env.DB
      .prepare(
        'UPDATE kp_scholar SET position = ? WHERE scholar_discipline = ? AND scholar_key = ? AND kp_id = ?',
      )
      .bind(i, discipline, scholarKey, kpId),
  );
  try {
    await env.DB.batch(updateStmts);
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'd1_write_failed' as never, detail: (e as Error).message });
  }

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: reorder scholar/${scholarKey} kpsOrder by ${adminEmail}`;
  const content = JSON.stringify(scholar, null, 2) + '\n';
  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, sha: fetched.data.sha, branch: 'main' },
  );
  // v0.8.34: git 写失败不阻断 — D1 已经更新，UI 已经持久化。git 仅作审计 trail。
  if (!res.ok) {
    console.warn('[reorder/scholar-kps] git writeback failed (D1 已更新):', res.detail);
    return jsonRes(200, { ok: true, d1_updated: true, git_committed: false, warning: 'git writeback failed but D1 saved' });
  }
  return jsonRes(200, { ok: true, d1_updated: true, git_committed: true, commit_sha: res.data.commit_sha });
};
