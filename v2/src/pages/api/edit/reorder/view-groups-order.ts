/**
 * POST /api/edit/reorder/view-groups-order  (v0.10.0 Issue #4a)
 *
 *   Body: { discipline: string, viewId: string, groupIds: string[] }
 *
 *   行为：把指定 view 的 groups[] 数组按 groupIds 重排。
 *     - groupIds 必须是当前 view.groups[].id 的**同集合**（reorder only，不能增删）
 *     - 各 group 内 schoolIds[] 不动 (那是 view-group-schools 的事)
 *
 *   v0.8.27 后 D1 是真值源 → D1-only write，不写 git。
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import type { ViewGroup } from '~/schemas/view';

interface ReorderBody {
  discipline?: string;
  viewId?: string;
  groupIds?: string[];
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(401, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });

  let body: ReorderBody;
  try { body = (await request.json()) as ReorderBody; }
  catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }

  const { discipline, viewId, groupIds } = body;
  if (!discipline || !viewId || !Array.isArray(groupIds) || groupIds.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + viewId + groupIds[] required' });
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

  // 集合校验：groupIds 必须 = 现 groups[].id 的同集合
  const existing = new Set(groups.map((g) => g.id));
  if (groupIds.length !== existing.size || groupIds.some((id) => !existing.has(id)) || new Set(groupIds).size !== groupIds.length) {
    return jsonRes(400, {
      ok: false,
      reason: 'set_mismatch' as const,
      detail: `groupIds 必须 = 现 view.groups[].id 同集合。existing=[${[...existing].join(',')}], got=[${groupIds.join(',')}]`,
    });
  }

  // 按 groupIds 重排（不动各 group 内字段）
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const reordered = groupIds.map((id) => groupById.get(id)!);

  await env.DB
    .prepare('UPDATE view SET groups_json = ?, updated_at = ? WHERE id = ? AND discipline = ?')
    .bind(JSON.stringify(reordered), new Date().toISOString(), viewId, discipline)
    .run();

  return jsonRes(200, { ok: true, view_id: viewId, group_count: reordered.length });
};
