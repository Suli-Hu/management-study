import type { APIRoute } from 'astro';
import { apiError, json, noStore } from '~/lib/api-response';
import { createScholarRecord, listScholarsForTenant } from '~/lib/scholar-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';
import { ScholarCreateInput } from '~/schemas/scholar-api';

export const GET: APIRoute = async (context) => {
  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const url = new URL(context.request.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 50;
  const rawOffset = Number(url.searchParams.get('offset') ?? '0');
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0;

  const result = await listScholarsForTenant(context.locals.runtime.env.DB, tenant.tenant, {
    limit,
    offset,
    q: url.searchParams.get('q') ?? undefined,
    school: url.searchParams.get('school') ?? undefined,
  });

  return noStore(json(200, {
    ok: true,
    tenant: tenant.tenant,
    scholars: result.items,
    page: {
      limit,
      offset,
      total: result.total,
      next_offset: offset + result.items.length < result.total ? offset + result.items.length : null,
    },
  }));
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

  const parsed = ScholarCreateInput.safeParse(raw);
  if (!parsed.success) return apiError(422, 'schema_invalid', parsed.error.issues);

  const result = await createScholarRecord(context.locals.runtime.env.DB, tenant.tenant, parsed.data);
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(201, { ok: true, tenant: tenant.tenant, scholar: result.record }));
};
