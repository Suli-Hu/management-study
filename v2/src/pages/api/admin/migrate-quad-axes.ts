/**
 * POST /api/admin/migrate-quad-axes (v0.8.4 Stage 4 fix)
 *
 * 把现有 quad KP 的 body_zh_json / body_ja_json 中的 string yAxis/xAxis
 * smart split 成新 QuadAxis 对象 ({low, label, high})。
 *
 * 策略：
 *   - SELECT id, body_zh_json, body_ja_json FROM kp WHERE body_format = 'quad'
 *   - 对每个 KP 的两个 lang body：
 *     - parse JSON → 如果 yAxis 是 string (legacy v0.8.3 数据) → splitQuadAxisString
 *     - 如果已经是 object (新 schema 已写过) → skip
 *   - smart split: 试 `-` → 试 `/` → 失败 = dirty
 *   - 成功的 UPDATE body_zh_json + body_ja_json (re-stringify)
 *   - 0/1 段无法 split 的 KP 进 dirty list 不强写
 *
 * idempotent: 重跑只 process legacy string axes，已经是 object 的 skip。
 *
 * 安全：仅 super-admin 可调（与 backfill-kp-body-structured 同 gate）
 *
 * 用法：
 *   curl -X POST -H "Authorization: Bearer $MS_TOKEN" \
 *     https://study.sususu.org/api/admin/migrate-quad-axes
 */

import type { APIRoute } from 'astro';
import { splitQuadAxisString } from '~/lib/kp-body-helpers';

interface KpRow {
  id: string;
  body_zh_json: string | null;
  body_ja_json: string | null;
}

interface DirtyEntry {
  id: string;
  lang: 'zh' | 'ja';
  axis: 'yAxis' | 'xAxis';
  raw: string;
  reason: 'no_separator' | 'parse_error' | 'unexpected_shape';
}

interface MigrateResult {
  ok: true;
  processed: number;
  succeeded: number;
  skipped_already_object: number;
  dirty: DirtyEntry[];
}

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return json(403, { ok: false, reason: 'not_admin' });
  }
  if (!locals.isSuperAdmin) {
    return json(403, { ok: false, reason: 'super_admin_required' });
  }

  const db = locals.runtime.env.DB;

  const { results } = await db
    .prepare(
      `SELECT id, body_zh_json, body_ja_json
       FROM kp
       WHERE body_format = 'quad'`,
    )
    .all<KpRow>();

  const dirty: DirtyEntry[] = [];
  let processed = 0;
  let succeeded = 0;
  let skippedAlreadyObject = 0;

  for (const row of results ?? []) {
    processed++;
    const langs: Array<{ key: 'zh' | 'ja'; raw: string | null }> = [
      { key: 'zh', raw: row.body_zh_json },
      { key: 'ja', raw: row.body_ja_json },
    ];

    let didMutate = false;
    let allLangAlreadyObject = true;
    let langFailed = false;
    const nextJson: { zh: string | null; ja: string | null } = {
      zh: row.body_zh_json,
      ja: row.body_ja_json,
    };

    for (const { key, raw } of langs) {
      if (!raw) continue;
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        dirty.push({ id: row.id, lang: key, axis: 'yAxis', raw, reason: 'parse_error' });
        langFailed = true;
        continue;
      }
      if (!isQuadShaped(body)) {
        dirty.push({
          id: row.id,
          lang: key,
          axis: 'yAxis',
          raw,
          reason: 'unexpected_shape',
        });
        langFailed = true;
        continue;
      }
      const next = { ...body };
      let changedThisLang = false;
      let bothAlreadyObject = true;
      for (const axis of ['yAxis', 'xAxis'] as const) {
        const cur = (body as Record<string, unknown>)[axis];
        if (isQuadAxisObject(cur)) continue;
        bothAlreadyObject = false;
        if (typeof cur !== 'string') {
          dirty.push({
            id: row.id,
            lang: key,
            axis,
            raw: JSON.stringify(cur),
            reason: 'unexpected_shape',
          });
          langFailed = true;
          continue;
        }
        const split = splitQuadAxisString(cur);
        if (!split) {
          dirty.push({ id: row.id, lang: key, axis, raw: cur, reason: 'no_separator' });
          langFailed = true;
          continue;
        }
        next[axis] = split;
        changedThisLang = true;
      }
      if (!bothAlreadyObject) allLangAlreadyObject = false;
      if (changedThisLang) {
        nextJson[key] = JSON.stringify(next);
        didMutate = true;
      }
    }

    if (allLangAlreadyObject && !didMutate && !langFailed) {
      skippedAlreadyObject++;
      continue;
    }

    if (langFailed) continue;

    if (didMutate) {
      await db
        .prepare(`UPDATE kp SET body_zh_json = ?, body_ja_json = ? WHERE id = ?`)
        .bind(nextJson.zh, nextJson.ja, row.id)
        .run();
      succeeded++;
    }
  }

  const result: MigrateResult = {
    ok: true,
    processed,
    succeeded,
    skipped_already_object: skippedAlreadyObject,
    dirty,
  };
  return json(200, result);
};

function isQuadShaped(b: unknown): b is Record<string, unknown> {
  return (
    typeof b === 'object' &&
    b !== null &&
    'format' in b &&
    (b as { format?: unknown }).format === 'quad'
  );
}

function isQuadAxisObject(v: unknown): v is { low: string; label?: string; high: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'low' in v &&
    'high' in v &&
    typeof (v as { low: unknown }).low === 'string' &&
    typeof (v as { high: unknown }).high === 'string'
  );
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
