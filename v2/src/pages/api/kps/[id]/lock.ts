/**
 * v0.11.58 KP 锁切换 endpoint — admin-only。
 *
 * POST   /api/kps/:id/lock  → 锁定（locked_at = now, locked_by = userId）
 * DELETE /api/kps/:id/lock  → 解锁（locked_at = NULL）
 *
 * 锁定语义：locked KP 的 PATCH/DELETE/batch PATCH 走 422 kp_locked 拒绝；
 * 锁切换本身走这个专用 endpoint（admin 即可），避免普通 PATCH 误改 lock 字段。
 *
 * 鉴权：用 tenantForExistingKp 'write' — 即 canEdit(discipline) 的 admin 才能切换锁。
 */

import type { APIRoute } from 'astro';
import { json, noStore } from '~/lib/api-response';
import { setKpLock } from '~/lib/kp-api-store';
import { tenantForExistingKp } from '~/lib/tenant-context';

async function handle(context: Parameters<APIRoute>[0], lock: boolean): Promise<Response> {
  const id = context.params.id;
  if (!id) return noStore(json(400, { ok: false, reason: 'missing_id' }));

  const tenant = await tenantForExistingKp(context, id, 'write');
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  const result = await setKpLock(
    context.locals.runtime.env.DB,
    id,
    tenant.tenant,
    lock,
    context.locals.user!.id,
  );
  if (!result.ok) return noStore(json(result.status, { ok: false, reason: result.reason }));

  return noStore(json(200, { ok: true, tenant: tenant.tenant, kp: result.record }));
}

export const POST: APIRoute = (context) => handle(context, true);
export const DELETE: APIRoute = (context) => handle(context, false);
