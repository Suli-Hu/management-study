/**
 * POST /api/edit/reorder/scholar-kps
 *   body: { discipline: string, scholarKey: string, kpIds: string[] }
 *   行为：D1 校验 kpIds 必须是该学者全部 KP 的同集合 → UPDATE kp_scholar.position
 *
 * 历史：
 *   v0.5.33 引入；v0.8.34 D1 写在前 + git audit 在后
 *   v0.11.6 移除 git 依赖（D1-only）。同 school-concepts.ts 同款理由。
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;

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

  // 校验 kpIds 必须是该学者当前 KP 的同集合
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

  // UPDATE kp_scholar.position
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

  return jsonRes(200, { ok: true, d1_updated: true });
};
