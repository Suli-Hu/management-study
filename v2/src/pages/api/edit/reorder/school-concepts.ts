/**
 * POST /api/edit/reorder/school-concepts
 *   body: { schoolKey: string, kpIds: string[] }
 *   行为：用 D1 kp_school 校验 kpIds 必须是该学派当前 KP 的同集合 →
 *         UPDATE kp_school.position
 *
 * 历史：
 *   v0.4.26 / v0.5.37 校验改 D1
 *   v0.8.34 D1 写在前 + git audit commit 在后
 *   v0.11.6 移除 git 依赖（D1-only）。原因：
 *     - v0.8.27 起 git data 是 stale snapshot，commit 仅作审计
 *     - v0.11.3 删 webhook 后 git → D1 反向覆盖路径已切干净，git audit commit 已无意义
 *     - getFile 偶发抽风导致整个 reorder 502，影响主流程 — 移除依赖修根因
 *   审计走 D1：admin 操作历史看 kp.updated_at / updated_by（per-row），更准确
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;

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

  // 校验 kpIds 必须是该学派当前 KP 的同集合（用 D1 kp_school = 渲染源）
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

  // UPDATE kp_school.position
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

  return jsonRes(200, { ok: true, d1_updated: true });
};
