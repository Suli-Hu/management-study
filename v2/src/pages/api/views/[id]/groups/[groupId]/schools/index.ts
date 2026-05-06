/**
 * POST /api/views/:id/groups/:groupId/schools   (v0.11.0)
 *
 *   Body: { schoolKeys: string[] }
 *
 *   行为：把若干学派加入指定 group。**auto-move 语义**：
 *     - 若学派已在 view 别的 group → 自动从旧 group 移走
 *     - 若学派已在目标 group → 静默跳过（idempotent）
 *     - 学派必须在同 discipline 的 school 表存在 (school_not_in_tenant 防越界)
 *
 *   Response: 200 + 完整更新后的 view + moved_from 报告 (告诉调用方哪些 key 来自哪个 group)
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { apiError, json, noStore } from '~/lib/api-response';
import { getViewRecord, patchViewRecord } from '~/lib/view-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';

const Input = z.object({
  schoolKeys: z.array(z.string().trim().min(1)).min(1, 'schoolKeys 至少 1 个'),
}).strict();

export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  const groupId = context.params.groupId;
  if (!id || !groupId) return apiError(400, 'missing_params');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return apiError(400, 'body_must_be_json'); }

  const parsed = Input.safeParse(raw);
  if (!parsed.success) return apiError(422, 'schema_invalid', parsed.error.issues);
  const { schoolKeys } = parsed.data;
  // 去重 (调用方传重复的合法但无意义)
  const uniqueKeys = [...new Set(schoolKeys)];

  const view = await getViewRecord(context.locals.runtime.env.DB, id, tenant.tenant);
  if (!view) return apiError(404, 'view_not_found');

  const targetIdx = view.groups.findIndex((g) => g.id === groupId);
  if (targetIdx < 0) return apiError(404, 'group_not_found');

  // moved_from: { schoolKey: oldGroupId | '__new__' }  — 给调用方看每个 key 之前在哪
  const movedFrom: Record<string, string> = {};
  // 浅拷贝 groups 准备改
  const newGroups = view.groups.map((g) => ({ ...g, schoolIds: [...g.schoolIds] }));

  for (const key of uniqueKeys) {
    // 若已在目标 group → 跳过
    if (newGroups[targetIdx].schoolIds.includes(key)) {
      movedFrom[key] = groupId;  // already there
      continue;
    }
    // 从其它 group 移除（auto-move）
    let from = '__new__';
    for (let i = 0; i < newGroups.length; i++) {
      if (i === targetIdx) continue;
      const idx = newGroups[i].schoolIds.indexOf(key);
      if (idx >= 0) {
        from = newGroups[i].id;
        newGroups[i].schoolIds.splice(idx, 1);
        break;
      }
    }
    movedFrom[key] = from;
    // 加进目标 group 末尾
    newGroups[targetIdx].schoolIds.push(key);
  }

  const result = await patchViewRecord(context.locals.runtime.env.DB, id, tenant.tenant, { groups: newGroups });
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, {
    ok: true,
    tenant: tenant.tenant,
    view: result.record,
    moved_from: movedFrom,
    added_count: uniqueKeys.length,
  }));
};
