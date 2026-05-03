import type { APIRoute } from 'astro';
import { KpPatchInput } from '~/schemas/kp-api';
import { json, noStore } from '~/lib/api-response';
import { deleteKpRecord, getKpRecord, patchKpRecord } from '~/lib/kp-api-store';
import { tenantForExistingKp } from '~/lib/tenant-context';
import {
  detectLegacyContract,
  classifyZodFailure,
  legacyContractResponseBody,
  structureFailureResponseBody,
} from '~/lib/kp-legacy-detector';

export const GET: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return noStore(json(400, { ok: false, reason: 'missing_id' }));

  const tenant = await tenantForExistingKp(context, id, 'read');
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  const kp = await getKpRecord(context.locals.runtime.env.DB, id);
  if (!kp) return noStore(json(404, { ok: false, reason: 'kp_not_found' }));

  return noStore(json(200, { ok: true, tenant: tenant.tenant, kp }));
};

export const PATCH: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return noStore(json(400, { ok: false, reason: 'missing_id' }));

  const tenant = await tenantForExistingKp(context, id, 'write');
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return noStore(json(400, { ok: false, reason: 'body_must_be_json' }));
  }

  // v0.8.0 Stage 3：先识别旧 contract，再 zod parse 新 contract
  const legacy = detectLegacyContract(raw);
  if (legacy) {
    return noStore(json(422, legacyContractResponseBody(legacy)));
  }

  const parsed = KpPatchInput.safeParse(raw);
  if (!parsed.success) {
    const cls = classifyZodFailure(parsed.error);
    return noStore(json(422, structureFailureResponseBody(cls.reason, cls.detail)));
  }

  const result = await patchKpRecord(
    context.locals.runtime.env.DB,
    id,
    tenant.tenant,
    parsed.data,
    context.locals.user!.id,
  );
  if (!result.ok) {
    return noStore(json(result.status, { ok: false, reason: result.reason, detail: result.detail }));
  }

  return noStore(json(200, { ok: true, tenant: tenant.tenant, kp: result.record }));
};

export const DELETE: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return noStore(json(400, { ok: false, reason: 'missing_id' }));

  const tenant = await tenantForExistingKp(context, id, 'write');
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  const result = await deleteKpRecord(
    context.locals.runtime.env.DB,
    id,
    tenant.tenant,
    context.locals.user!.id,
  );
  if (!result.ok) return noStore(json(result.status, { ok: false, reason: result.reason }));

  return noStore(json(200, { ok: true, tenant: tenant.tenant }));
};
