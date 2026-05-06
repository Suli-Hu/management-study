/**
 * POST /api/edit/reorder/view-group-schools  (v0.10.0 Issue #4b)
 *
 *   Body: {
 *     discipline: string,
 *     viewId: string,
 *     groupsSchoolIds: { [groupId]: schoolKey[] }   — 只列受影响的 group（同组重排只 1 个，跨组移动 2 个）
 *   }
 *
 *   行为：原子更新 view.groups[i].schoolIds（多 group 一次写）。
 *     - groupsSchoolIds 里出现的 groupId 必须存在于 view.groups[]
 *     - 受影响 group 在 view 内的 schoolIds 全集（before）必须 ⊇ 受影响 group 的 schoolIds 全集（after）—— 即拖拽不引入新 school、不丢 school
 *     - schoolIds 不能跨 group 重复
 *     - 不动 view.groups[].title/flow/id 等非 schoolIds 字段
 *
 *   v0.8.27 后 D1 是真值源 → D1-only write，**不写 school.theme_key**（view 是 display only）。
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import type { ViewGroup } from '~/schemas/view';

interface ReorderBody {
  discipline?: string;
  viewId?: string;
  groupsSchoolIds?: Record<string, string[]>;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(401, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });

  let body: ReorderBody;
  try { body = (await request.json()) as ReorderBody; }
  catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }

  const { discipline, viewId, groupsSchoolIds } = body;
  if (!discipline || !viewId || !groupsSchoolIds || typeof groupsSchoolIds !== 'object' || Array.isArray(groupsSchoolIds)) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + viewId + groupsSchoolIds object required' });
  }
  const affectedGroupIds = Object.keys(groupsSchoolIds);
  if (affectedGroupIds.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'groupsSchoolIds 至少要有 1 个 group' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const row = await env.DB
    .prepare('SELECT groups_json FROM view WHERE id = ? AND discipline = ?')
    .bind(viewId, discipline)
    .first<{ groups_json: string | null }>();
  if (!row) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `view ${viewId} 不存在` });

  let groups: ViewGroup[];
  try {
    const raw = JSON.parse(row.groups_json ?? '[]');
    if (!Array.isArray(raw)) throw new Error('groups_json 不是数组');
    groups = raw as ViewGroup[];
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'schema_invalid', detail: `view.groups_json 损坏：${(e as Error).message}` });
  }

  // 校验 1: 所有 affectedGroupIds 都在 view.groups 里
  const groupIdx = new Map(groups.map((g, i) => [g.id, i]));
  for (const gid of affectedGroupIds) {
    if (!groupIdx.has(gid)) {
      return jsonRes(400, {
        ok: false,
        reason: 'group_not_in_view' as const,
        detail: `groupId "${gid}" 不在 view.groups[] 里。existing=[${[...groupIdx.keys()].join(',')}]`,
      });
    }
  }

  // 校验 2: 受影响 group 的 schoolIds 全集 (before) === (after)，且拼起来不能有重复
  const beforeSet = new Set<string>();
  for (const gid of affectedGroupIds) {
    for (const sid of groups[groupIdx.get(gid)!].schoolIds) beforeSet.add(sid);
  }
  const afterFlat: string[] = [];
  for (const gid of affectedGroupIds) {
    const arr = groupsSchoolIds[gid];
    if (!Array.isArray(arr) || arr.some((s) => typeof s !== 'string')) {
      return jsonRes(400, {
        ok: false,
        reason: 'bad_request' as const,
        detail: `groupsSchoolIds["${gid}"] 必须是 string[]`,
      });
    }
    afterFlat.push(...arr);
  }
  const afterSet = new Set(afterFlat);
  if (afterSet.size !== afterFlat.length) {
    return jsonRes(400, {
      ok: false,
      reason: 'school_duplicated' as const,
      detail: `同一 view 内学派不能在多个 group 同时存在。重复：[${afterFlat.filter((s, i, a) => a.indexOf(s) !== i).join(',')}]`,
    });
  }
  if (beforeSet.size !== afterSet.size || [...afterSet].some((s) => !beforeSet.has(s))) {
    return jsonRes(400, {
      ok: false,
      reason: 'set_mismatch' as const,
      detail: `受影响 group 的 schoolIds 全集 (before) 与 (after) 必须一致 (拖拽不能加/删，只能重排或跨组移动)。before=[${[...beforeSet].join(',')}], after=[${[...afterSet].join(',')}]`,
    });
  }

  // 写：只改受影响 group 的 schoolIds，其它 group 字段不动
  for (const gid of affectedGroupIds) {
    groups[groupIdx.get(gid)!].schoolIds = groupsSchoolIds[gid];
  }

  await env.DB
    .prepare('UPDATE view SET groups_json = ?, updated_at = ? WHERE id = ? AND discipline = ?')
    .bind(JSON.stringify(groups), new Date().toISOString(), viewId, discipline)
    .run();

  return jsonRes(200, {
    ok: true,
    view_id: viewId,
    affected_groups: affectedGroupIds,
    school_count: afterFlat.length,
  });
};
