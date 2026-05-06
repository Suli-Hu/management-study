/**
 * POST /api/views/:id/groups   (v0.11.0 Issue #1 ④b — view group 细粒度 API)
 *
 *   Body: { id?: string, title: string, flow?: string, schoolIds?: string[] }
 *
 *   行为：在指定 view 的 groups[] 末尾追加一个新 group。
 *     - id 缺省时 server 用 title slugify 生成；如已重复则加 -2 -3 后缀
 *     - 校验 schoolIds 全部在同 discipline 的 school 表存在；同 view 别的 group 不能已有 (auto-move 语义)
 *       - 简化：本端点暂不允许 schoolIds 已在其它 group。要做 move 走 ./groups/:gid/schools POST
 *     - 返回完整的更新后 view (含新 group)
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { apiError, json, noStore } from '~/lib/api-response';
import { getViewRecord, patchViewRecord } from '~/lib/view-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';

const Input = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/i, '分组 id 仅允许字母/数字/_/-').optional(),
  title: z.string().trim().min(1, '分组标题不能为空'),
  flow: z.string().trim().default(''),
  schoolIds: z.array(z.string()).default([]),
}).strict();

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'group';
}

export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return apiError(400, 'missing_id');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return apiError(400, 'body_must_be_json'); }

  const parsed = Input.safeParse(raw);
  if (!parsed.success) return apiError(422, 'schema_invalid', parsed.error.issues);
  const input = parsed.data;

  const view = await getViewRecord(context.locals.runtime.env.DB, id, tenant.tenant);
  if (!view) return apiError(404, 'view_not_found');

  // 同 view 内学派不能跨 group 重复 — 本端点拒收已在别 group 的 school
  const existingSchools = new Set(view.groups.flatMap((g) => g.schoolIds));
  const dup = input.schoolIds.filter((k) => existingSchools.has(k));
  if (dup.length > 0) {
    return apiError(409, 'schools_in_other_group', dup);
  }

  // 生成 group id (用户传 → 用；冲突 → 加 -2 -3)
  let groupId = input.id ?? slugify(input.title);
  const existingIds = new Set(view.groups.map((g) => g.id));
  if (existingIds.has(groupId)) {
    if (input.id) return apiError(409, 'group_id_exists', groupId);
    let i = 2;
    while (existingIds.has(`${groupId}-${i}`)) i += 1;
    groupId = `${groupId}-${i}`;
  }

  const newGroups = [
    ...view.groups,
    { id: groupId, title: input.title, flow: input.flow, schoolIds: input.schoolIds },
  ];
  const result = await patchViewRecord(
    context.locals.runtime.env.DB,
    id,
    tenant.tenant,
    { groups: newGroups },
  );
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(201, {
    ok: true,
    tenant: tenant.tenant,
    view: result.record,
    new_group_id: groupId,
  }));
};
