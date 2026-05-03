/**
 * POST /api/admin/backfill-kp-body-structured (v0.8.0 Stage 1)
 *
 * 一次性把存量 KP 旧列数据填充到 5 个新列。idempotent + 分批。
 *
 * 策略：
 *   - SELECT id, discipline, body_zh, body_ja, format, eval_content_*_json
 *     FROM kp WHERE body_zh_json IS NULL LIMIT N
 *     → 已经填过的 KP 不会再处理（idempotent）
 *   - 对每条：parseBody → parsedToStructured → UPDATE 新列
 *   - 返 { processed, remaining, errors }
 *   - 调用方循环调直到 remaining = 0
 *
 * 安全：仅 super-admin 可调（与 /api/admin/disciplines 同 gate）
 *
 * 用法（admin）：
 *   while remaining > 0:
 *     curl -X POST -H "Authorization: Bearer $MS_TOKEN" \
 *       https://study.sususu.org/api/admin/backfill-kp-body-structured?batch=50
 */

import type { APIRoute } from 'astro';
import { parseBody, type Format } from '~/lib/body-parser';
import { parsedToStructured, evalContentToEvaluations } from '~/lib/kp-body-helpers';

interface KpRow {
  id: string;
  discipline: string;
  body_zh: string;
  body_ja: string | null;
  format: string;
  eval_content_zh_json: string | null;
  eval_content_ja_json: string | null;
}

interface BackfillResult {
  ok: true;
  processed: number;
  remaining: number;
  errors: Array<{ id: string; reason: string; detail?: string }>;
}

const MAX_BATCH = 100;
const DEFAULT_BATCH = 50;

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return json(403, { ok: false, reason: 'not_admin' });
  }
  if (!locals.isSuperAdmin) {
    return json(403, { ok: false, reason: 'super_admin_required' });
  }

  const url = new URL(request.url);
  const rawBatch = Number(url.searchParams.get('batch') ?? String(DEFAULT_BATCH));
  const batch = Number.isFinite(rawBatch)
    ? Math.min(Math.max(Math.floor(rawBatch), 1), MAX_BATCH)
    : DEFAULT_BATCH;

  const db = locals.runtime.env.DB;

  // 拉一批未填的 KP
  const { results } = await db
    .prepare(
      `SELECT id, discipline, body_zh, body_ja, format,
              eval_content_zh_json, eval_content_ja_json
       FROM kp
       WHERE body_zh_json IS NULL
       LIMIT ?`,
    )
    .bind(batch)
    .all<KpRow>();

  const errors: Array<{ id: string; reason: string; detail?: string }> = [];
  let processed = 0;

  for (const row of results ?? []) {
    try {
      const fmt = (row.format ?? 'narrative') as Format;
      const parsedZh = parseBody(row.body_zh ?? '', fmt);
      const parsedJa = row.body_ja ? parseBody(row.body_ja, fmt) : null;
      const structuredZh = parsedToStructured(parsedZh);
      const structuredJa = parsedJa ? parsedToStructured(parsedJa) : null;

      const evalContentZh = row.eval_content_zh_json
        ? safeJsonParse<Record<string, string>>(row.eval_content_zh_json, {})
        : {};
      const evalContentJa = row.eval_content_ja_json
        ? safeJsonParse<Record<string, string>>(row.eval_content_ja_json, {})
        : {};

      const evalsZh = Object.keys(evalContentZh).length > 0
        ? evalContentToEvaluations(evalContentZh)
        : { meaning: '', limit: '', example: '', response: '', application: '', analogy: '' };
      const evalsJa = Object.keys(evalContentJa).length > 0
        ? evalContentToEvaluations(evalContentJa)
        : null;

      await db
        .prepare(
          `UPDATE kp SET
            body_zh_json = ?, body_ja_json = ?,
            evaluations_zh_json = ?, evaluations_ja_json = ?,
            body_format = ?
           WHERE id = ?`,
        )
        .bind(
          JSON.stringify(structuredZh),
          structuredJa ? JSON.stringify(structuredJa) : null,
          JSON.stringify(evalsZh),
          evalsJa ? JSON.stringify(evalsJa) : null,
          fmt,
          row.id,
        )
        .run();

      processed++;
    } catch (e) {
      errors.push({
        id: row.id,
        reason: 'backfill_failed',
        detail: (e as Error).message,
      });
    }
  }

  // 还剩多少未填
  const remainingRow = await db
    .prepare('SELECT COUNT(*) as n FROM kp WHERE body_zh_json IS NULL')
    .first<{ n: number }>();
  const remaining = remainingRow?.n ?? 0;

  const result: BackfillResult = { ok: true, processed, remaining, errors };
  return json(200, result);
};

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
