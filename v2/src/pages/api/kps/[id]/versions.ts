import type { APIRoute } from 'astro';
import { apiError, json, noStore } from '~/lib/api-response';
import { listKpVersions } from '~/lib/kp-api-store';
import { tenantForExistingKp } from '~/lib/tenant-context';

export const GET: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return apiError(400, 'missing_id');

  const tenant = await tenantForExistingKp(context, id, 'read');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const versions = await listKpVersions(context.locals.runtime.env.DB, id, tenant.tenant);
  return noStore(json(200, {
    ok: true,
    tenant: tenant.tenant,
    kp_id: id,
    versions,
  }));
};
