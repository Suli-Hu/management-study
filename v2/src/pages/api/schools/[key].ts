import type { APIRoute } from 'astro';
import { apiError, json, noStore } from '~/lib/api-response';
import { deleteSchoolRecord, getSchoolRecord, patchSchoolRecord } from '~/lib/school-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';
import { SchoolPatchInput } from '~/schemas/school-api';

export const GET: APIRoute = async (context) => {
  const key = context.params.key;
  if (!key) return apiError(400, 'missing_key');

  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const school = await getSchoolRecord(context.locals.runtime.env.DB, key, tenant.tenant);
  if (!school) return apiError(404, 'school_not_found');

  return noStore(json(200, { ok: true, tenant: tenant.tenant, school }));
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

  const parsed = SchoolPatchInput.safeParse(raw);
  if (!parsed.success) return apiError(422, 'schema_invalid', parsed.error.issues);

  const result = await patchSchoolRecord(context.locals.runtime.env.DB, key, tenant.tenant, parsed.data);
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, { ok: true, tenant: tenant.tenant, school: result.record }));
};

export const DELETE: APIRoute = async (context) => {
  const key = context.params.key;
  if (!key) return apiError(400, 'missing_key');

  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const result = await deleteSchoolRecord(context.locals.runtime.env.DB, key, tenant.tenant);
  if (!result.ok) return apiError(result.status, result.reason, result.detail);

  return noStore(json(200, { ok: true, tenant: tenant.tenant }));
};
