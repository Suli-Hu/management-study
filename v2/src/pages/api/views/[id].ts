import type { APIRoute } from 'astro';
import { apiError, json, noStore } from '~/lib/api-response';
import { deleteViewRecord, getViewRecord, patchViewRecord } from '~/lib/view-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';
import { ViewPatchInput } from '~/schemas/view-api';

export const GET: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return apiError(400, 'missing_id');

  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const view = await getViewRecord(context.locals.runtime.env.DB, id, tenant.tenant);
  if (!view) return apiError(404, 'view_not_found');

  return noStore(json(200, { ok: true, tenant: tenant.tenant, view }));
};

export const PATCH: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return apiError(400, 'missing_id');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return apiError(400, 'body_must_be_json');
  }

  const parsed = ViewPatchInput.safeParse(raw);
  if (!parsed.success) return apiError(422, 'schema_invalid', parsed.error.issues);

  const result = await patchViewRecord(context.locals.runtime.env.DB, id, tenant.tenant, parsed.data);
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, { ok: true, tenant: tenant.tenant, view: result.record }));
};

export const DELETE: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return apiError(400, 'missing_id');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const result = await deleteViewRecord(context.locals.runtime.env.DB, id, tenant.tenant);
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, { ok: true, tenant: tenant.tenant }));
};
