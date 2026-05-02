/**
 * /api/study-sessions/[id]  (v0.5.2 / v0.7.12)
 *
 *   GET    取一条 session（必须自己的）
 *   PUT    部分更新（kp_id / date / start_time / duration_min / rating / note）
 *   DELETE 删除（不可恢复）
 *
 * IDOR 防护：所有路径都用 (id, user_id) 联合 WHERE，防别人猜到 id 改读。
 */

import type { APIRoute } from 'astro';
import { json, noStore, apiError } from '~/lib/api-response';
import { StudySessionPatchInput } from '~/schemas/study-session';
import {
  getStudySession,
  updateStudySession,
  deleteStudySession,
  ensureKpInDiscipline,
} from '~/lib/study-session-store';

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return apiError(401, 'not_authenticated');
  const id = params.id;
  if (!id) return apiError(400, 'bad_request', 'id required');
  const session = await getStudySession(locals.runtime.env.DB, locals.user.id, id);
  if (!session) return apiError(404, 'not_found');
  return noStore(json(200, { ok: true, session }));
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return apiError(401, 'not_authenticated');
  const id = params.id;
  if (!id) return apiError(400, 'bad_request', 'id required');
  const env = locals.runtime.env;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, 'bad_request', 'invalid json body');
  }

  const parsed = StudySessionPatchInput.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, 'invalid_input', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const patch = parsed.data;

  // 如果 patch 改了 kp_id，需要重新校验 KP 存在 + discipline 匹配
  // discipline 取自 session 行（PATCH 不允许改 discipline）
  if (patch.kp_id !== undefined) {
    const existing = await getStudySession(env.DB, locals.user.id, id);
    if (!existing) return apiError(404, 'not_found');
    const kpCheck = await ensureKpInDiscipline(env.DB, patch.kp_id, existing.discipline);
    if (!kpCheck.ok) {
      return apiError(
        kpCheck.reason === 'kp_not_found' ? 404 : 400,
        kpCheck.reason,
        kpCheck.reason === 'kp_discipline_mismatch'
          ? `kp_id ${patch.kp_id} 实际属于 ${kpCheck.actualDiscipline}，不能跨学科改`
          : undefined,
      );
    }
  }

  const updated = await updateStudySession(env.DB, locals.user.id, id, patch);
  if (!updated) return apiError(404, 'not_found');

  return noStore(json(200, { ok: true, session: updated }));
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return apiError(401, 'not_authenticated');
  const id = params.id;
  if (!id) return apiError(400, 'bad_request', 'id required');

  const removed = await deleteStudySession(locals.runtime.env.DB, locals.user.id, id);
  if (!removed) return apiError(404, 'not_found');

  return noStore(json(200, { ok: true, id }));
};
