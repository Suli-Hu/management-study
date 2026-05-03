import type { APIRoute } from 'astro';
import { KpCreateInput } from '~/schemas/kp-api';
import { json, noStore } from '~/lib/api-response';
import { createKpRecord, listKpsForTenant } from '~/lib/kp-api-store';
import { resolveTenantContext } from '~/lib/tenant-context';
import {
  detectLegacyContract,
  classifyZodFailure,
  legacyContractResponseBody,
  structureFailureResponseBody,
} from '~/lib/kp-legacy-detector';

export const GET: APIRoute = async (context) => {
  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  const url = new URL(context.request.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 50;
  const rawOffset = Number(url.searchParams.get('offset') ?? '0');
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0;

  const result = await listKpsForTenant(context.locals.runtime.env.DB, tenant.tenant, {
    limit,
    offset,
    q: url.searchParams.get('q') ?? undefined,
    school: url.searchParams.get('school') ?? undefined,
    scholar: url.searchParams.get('scholar') ?? undefined,
  });
  return noStore(json(200, {
    ok: true,
    tenant: tenant.tenant,
    kps: result.items,
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
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return noStore(json(400, { ok: false, reason: 'body_must_be_json' }));
  }

  // v0.8.0 Stage 3：先识别旧 contract 输入并返明确 reason，再 zod parse 新 contract
  const legacy = detectLegacyContract(raw);
  if (legacy) {
    return noStore(json(422, legacyContractResponseBody(legacy)));
  }

  const parsed = KpCreateInput.safeParse(raw);
  if (!parsed.success) {
    const cls = classifyZodFailure(parsed.error);
    return noStore(json(422, structureFailureResponseBody(cls.reason, cls.detail)));
  }

  const result = await createKpRecord(
    context.locals.runtime.env.DB,
    tenant.tenant,
    parsed.data,
    context.locals.user!.id,
  );
  if (!result.ok) {
    return noStore(json(result.status, { ok: false, reason: result.reason, detail: result.detail }));
  }

  return noStore(json(201, { ok: true, tenant: tenant.tenant, kp: result.record }));
};
