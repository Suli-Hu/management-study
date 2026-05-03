/**
 * PATCH /api/kps/batch — v0.8.0 Stage 3 hard cut.
 *
 * 行为简述：
 *   - 一次提交 ≤ 50 条 KP 的 partial patch（v0.8.0 contract）
 *   - title/body/evaluations 按语种 shallow merge；body.zh/ja 整体替换 KpBody
 *   - 数组字段整体替换；空数组 = 真清空
 *   - 必传 ifMatchVersion（非 dryRun）— 乐观锁
 *   - dryRun 模式：返 diff + current_version，不写
 *   - 单条 patch 命中 v0.8.0 legacy contract → 该条 results[] 返 legacy_* reason
 *     不影响其它条（migration-v0.8.md §7.3）
 *
 * 不写 git，不调 sync 接口 —— API-first 直接写 D1。
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, noStore } from '~/lib/api-response';
import { patchKpsBatch, type RawBatchUpdate } from '~/lib/kp-batch-store';
import { resolveTenantContext } from '~/lib/tenant-context';
import { KpId } from '~/schemas/kp';

const MAX_BATCH_ITEMS = 50;

/**
 * Lenient outer schema：patch 是 record（任意 object）— 真正的 strict KpBatchPatchInput
 * 校验 + legacy detector 由 store 内部 per-item 跑，错误分散到 results[] 而非整批 422。
 */
const BatchOuterRequest = z.object({
  dryRun: z.boolean().default(false),
  updates: z.array(
    z.object({
      id: KpId,
      ifMatchVersion: z.number().int().nonnegative().optional(),
      patch: z.record(z.unknown()),
    }),
  ),
});

export const PATCH: APIRoute = async (context) => {
  const tenant = await resolveTenantContext(context, 'write');
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return noStore(json(400, { ok: false, reason: 'body_must_be_json' }));
  }

  // 早期范围检查：用 raw.updates 判断是否空 / 超长，再做 zod parse
  // 这样 51 条返 too_many_items 而不是 zod schema_invalid 的 array length 错误
  const rawUpdates =
    raw && typeof raw === 'object' && Array.isArray((raw as { updates?: unknown }).updates)
      ? ((raw as { updates: unknown[] }).updates)
      : null;

  if (!rawUpdates) {
    return noStore(json(400, { ok: false, reason: 'schema_invalid', detail: 'updates must be an array' }));
  }
  if (rawUpdates.length === 0) {
    return noStore(json(400, { ok: false, reason: 'updates_empty' }));
  }
  if (rawUpdates.length > MAX_BATCH_ITEMS) {
    return noStore(
      json(400, {
        ok: false,
        reason: 'too_many_items',
        detail: { max: MAX_BATCH_ITEMS, got: rawUpdates.length },
      }),
    );
  }

  // 验外层形状（id/ifMatchVersion/patch 是 object），但不强校 patch 内容
  // patch 内的 v0.8.0 legacy contract / strict parse 在 store per-item 跑
  const parsedOuter = BatchOuterRequest.safeParse(raw);
  if (!parsedOuter.success) {
    return noStore(json(422, { ok: false, reason: 'schema_invalid', detail: parsedOuter.error.issues }));
  }

  const updates: RawBatchUpdate[] = parsedOuter.data.updates.map((u) => ({
    id: u.id,
    ifMatchVersion: u.ifMatchVersion,
    patch: u.patch,
  }));

  const outcome = await patchKpsBatch(
    context.locals.runtime.env.DB,
    updates,
    {
      dryRun: parsedOuter.data.dryRun,
      tenant: tenant.tenant,
      userId: context.locals.user!.id,
    },
  );

  return noStore(
    json(200, {
      ok: true,
      dryRun: parsedOuter.data.dryRun,
      tenant: tenant.tenant,
      summary: outcome.summary,
      results: outcome.results,
    }),
  );
};
