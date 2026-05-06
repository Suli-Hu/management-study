/**
 * PATCH  /api/views/:id/groups/:groupId   (v0.11.0)
 * DELETE /api/views/:id/groups/:groupId   (v0.11.0)
 *
 * PATCH body: { title?: string, flow?: string }
 *   - 不可改 id（id 是稳定锚，要换 id = 删旧建新）
 *   - schoolIds 通过 ./schools 子端点改，不在这里
 *
 * DELETE 行为：移除 group。group 内 schoolIds 跟着 group 一起从 view 消失（school 表本身不动）。
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { apiError, json, noStore } from '~/lib/api-response';
import { getViewRecord, patchViewRecord } from '~/lib/view-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';

const PatchInput = z.object({
  title: z.string().trim().min(1).optional(),
  flow: z.string().trim().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'PATCH 至少需要一个字段');

export const PATCH: APIRoute = async (context) => {
  const id = context.params.id;
  const groupId = context.params.groupId;
  if (!id || !groupId) return apiError(400, 'missing_params');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return apiError(400, 'body_must_be_json'); }

  const parsed = PatchInput.safeParse(raw);
  if (!parsed.success) return apiError(422, 'schema_invalid', parsed.error.issues);

  const view = await getViewRecord(context.locals.runtime.env.DB, id, tenant.tenant);
  if (!view) return apiError(404, 'view_not_found');

  const idx = view.groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return apiError(404, 'group_not_found');

  const newGroups = view.groups.map((g, i) => i === idx ? { ...g, ...parsed.data } : g);
  const result = await patchViewRecord(context.locals.runtime.env.DB, id, tenant.tenant, { groups: newGroups });
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, { ok: true, tenant: tenant.tenant, view: result.record }));
};

export const DELETE: APIRoute = async (context) => {
  const id = context.params.id;
  const groupId = context.params.groupId;
  if (!id || !groupId) return apiError(400, 'missing_params');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const view = await getViewRecord(context.locals.runtime.env.DB, id, tenant.tenant);
  if (!view) return apiError(404, 'view_not_found');
  if (!view.groups.some((g) => g.id === groupId)) return apiError(404, 'group_not_found');

  const newGroups = view.groups.filter((g) => g.id !== groupId);
  const result = await patchViewRecord(context.locals.runtime.env.DB, id, tenant.tenant, { groups: newGroups });
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, { ok: true, tenant: tenant.tenant, view: result.record, deleted_group_id: groupId }));
};
