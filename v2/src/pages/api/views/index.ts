import type { APIRoute } from 'astro';
import { apiError, json, noStore } from '~/lib/api-response';
import { createViewRecord, listViewsForTenant } from '~/lib/view-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';
import { ViewCreateInput } from '~/schemas/view-api';

export const GET: APIRoute = async (context) => {
  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const views = await listViewsForTenant(context.locals.runtime.env.DB, tenant.tenant);
  return noStore(json(200, { ok: true, tenant: tenant.tenant, views }));
};

export const POST: APIRoute = async (context) => {
  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return apiError(400, 'body_must_be_json');
  }

  const parsed = ViewCreateInput.safeParse(raw);
  if (!parsed.success) return apiError(422, 'schema_invalid', parsed.error.issues);

  const result = await createViewRecord(context.locals.runtime.env.DB, tenant.tenant, parsed.data);
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(201, { ok: true, tenant: tenant.tenant, view: result.record }));
};
