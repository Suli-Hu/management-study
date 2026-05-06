/**
 * DELETE /api/views/:id/groups/:groupId/schools/:schoolKey   (v0.11.0)
 *
 *   行为：把单个学派从 group 拿走（学派从 view 完全消失，school 表不动）。
 *     - 学派不在该 group → 404 school_not_in_group
 *     - 反复 DELETE 同一 key 第 2 次 → 404 (不 idempotent — 调用方要自己保证)
 *
 *   想批量删？走 ./schools POST 替代方案；或多次调用此端点。
 */

import type { APIRoute } from 'astro';
import { apiError, json, noStore } from '~/lib/api-response';
import { getViewRecord, patchViewRecord } from '~/lib/view-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';

export const DELETE: APIRoute = async (context) => {
  const id = context.params.id;
  const groupId = context.params.groupId;
  const schoolKey = context.params.schoolKey;
  if (!id || !groupId || !schoolKey) return apiError(400, 'missing_params');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const view = await getViewRecord(context.locals.runtime.env.DB, id, tenant.tenant);
  if (!view) return apiError(404, 'view_not_found');

  const targetIdx = view.groups.findIndex((g) => g.id === groupId);
  if (targetIdx < 0) return apiError(404, 'group_not_found');
  const idxInGroup = view.groups[targetIdx].schoolIds.indexOf(schoolKey);
  if (idxInGroup < 0) return apiError(404, 'school_not_in_group');

  const newGroups = view.groups.map((g, i) => {
    if (i !== targetIdx) return g;
    return { ...g, schoolIds: g.schoolIds.filter((k) => k !== schoolKey) };
  });
  const result = await patchViewRecord(context.locals.runtime.env.DB, id, tenant.tenant, { groups: newGroups });
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, {
    ok: true,
    tenant: tenant.tenant,
    view: result.record,
    removed: { groupId, schoolKey },
  }));
};
