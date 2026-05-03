/**
 * PATCH /api/kps/batch (v0.7.35)
 *
 * 批量 KP 局部编辑端点。详细 PRD：v2/docs/BATCH-KP-EDIT-PRD.md
 *
 * 行为简述：
 *   - 一次提交 ≤ 50 条 KP 的局部更新（partial patch）
 *   - title/body/evalContent 走 shallow merge，不传的子字段保持原值
 *   - schools/scholars/tags 整体替换；空数组 = 真清空
 *   - 必传 ifMatchVersion（非 dryRun）— 乐观锁
 *   - dryRun 模式：返 diff + current_version，不写
 *   - 逐条独立结果，summary 给聚合数字
 *
 * 不写 git，不调 sync 接口 —— API-first 直接写 D1。
 */

import type { APIRoute } from 'astro';
import { json, noStore } from '~/lib/api-response';
import { KpBatchRequest } from '~/schemas/kp-batch-api';
import { patchKpsBatch } from '~/lib/kp-batch-store';
import { resolveTenantContext } from '~/lib/tenant-context';

const MAX_BATCH_ITEMS = 50;

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

  // zod 校验整体形状（每条 patch 也走 strict() 拒未知 key）
  const parsed = KpBatchRequest.safeParse(raw);
  if (!parsed.success) {
    return noStore(json(422, { ok: false, reason: 'schema_invalid', detail: parsed.error.issues }));
  }

  const outcome = await patchKpsBatch(
    context.locals.runtime.env.DB,
    parsed.data.updates,
    {
      dryRun: parsed.data.dryRun,
      tenant: tenant.tenant,
      userId: context.locals.user!.id,
    },
    rawUpdates,
  );

  return noStore(
    json(200, {
      ok: true,
      dryRun: parsed.data.dryRun,
      tenant: tenant.tenant,
      summary: outcome.summary,
      results: outcome.results,
    }),
  );
};
