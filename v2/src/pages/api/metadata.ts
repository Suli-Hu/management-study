import type { APIRoute } from 'astro';
import { apiError, json, noStore } from '~/lib/api-response';
import { getMetadataForTenant } from '~/lib/metadata-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';

export const GET: APIRoute = async (context) => {
  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return apiError(tenant.status, tenant.reason);

  const metadata = await getMetadataForTenant(context.locals.runtime.env.DB, tenant.tenant);
  return noStore(json(200, { ok: true, tenant: tenant.tenant, ...metadata }));
};
