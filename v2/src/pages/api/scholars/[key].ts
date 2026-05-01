import type { APIRoute } from 'astro';
import { apiError, json, noStore } from '~/lib/api-response';
import { deleteScholarRecord, getScholarRecord, patchScholarRecord } from '~/lib/scholar-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';
import { ScholarPatchInput } from '~/schemas/scholar-api';

export const GET: APIRoute = async (context) => {
  const key = context.params.key;
  if (!key) return apiError(400, 'missing_key');

  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const scholar = await getScholarRecord(context.locals.runtime.env.DB, key, tenant.tenant);
  if (!scholar) return apiError(404, 'scholar_not_found');

  return noStore(json(200, { ok: true, tenant: tenant.tenant, scholar }));
};

export const PATCH: APIRoute = async (context) => {
  const key = context.params.key;
  if (!key) return apiError(400, 'missing_key');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return apiError(400, 'body_must_be_json');
  }

  const parsed = ScholarPatchInput.safeParse(raw);
  if (!parsed.success) return apiError(422, 'schema_invalid', parsed.error.issues);

  const result = await patchScholarRecord(context.locals.runtime.env.DB, key, tenant.tenant, parsed.data);
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, { ok: true, tenant: tenant.tenant, scholar: result.record }));
};

export const DELETE: APIRoute = async (context) => {
  const key = context.params.key;
  if (!key) return apiError(400, 'missing_key');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const result = await deleteScholarRecord(context.locals.runtime.env.DB, key, tenant.tenant);
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, { ok: true, tenant: tenant.tenant }));
};
