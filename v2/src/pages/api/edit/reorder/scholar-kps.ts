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

  let body: { scholarKey?: string; kpIds?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { scholarKey, kpIds } = body;
  if (!scholarKey || !Array.isArray(kpIds) || kpIds.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'scholarKey + kpIds[] required' });
  }

  // discipline lookup + admin gate
  const row = await env.DB.prepare('SELECT discipline FROM scholar WHERE key = ?').bind(scholarKey).first() as { discipline: string } | null;
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });
  if (!locals.canEdit(row.discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 校验 kpIds 必须是该学者当前 KP 的同集合（防漏 / 防注入）
  const kpRows = await env.DB.prepare('SELECT kp_id FROM kp_scholar WHERE scholar_key = ?').bind(scholarKey).all<{ kp_id: string }>();
  const currentKpIds = new Set((kpRows.results ?? []).map((r) => r.kp_id));
  const next = new Set(kpIds);
  if (currentKpIds.size !== next.size || [...currentKpIds].some((id) => !next.has(id))) {
    return jsonRes(400, {
      ok: false,
      reason: 'kp_set_mismatch' as const,
      detail: `kpIds 必须是该学者当前 KP 的同集合（仅允许重排，不能增删）`,
    });
  }

  const path = `v2/data/${row.discipline}/scholars/${scholarKey}.json`;
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

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: reorder scholar/${scholarKey} kpsOrder by ${adminEmail}`;
  const content = JSON.stringify(scholar, null, 2) + '\n';
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
