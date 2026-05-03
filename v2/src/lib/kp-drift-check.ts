/**
 * v0.8.0 Stage 1+ — KP 双写漂移检测 (PRD §6.3 防线 2)
 *
 * 用途：
 *   - Stage 1 backfill 验收门禁：跑一次 sample 100 → 0 drift 才算 backfill 完成
 *   - Stage 4 起接 cron 定时跑（这里只提供 lib，定时任务另接）
 *
 * 漂移定义：对同一 KP 行：
 *   旧列派生：parseBody(body_zh, format) → parsedToStructured  → JSON
 *   新列原值：JSON.parse(body_zh_json)
 *   两者结构应严格相等（key 顺序无关）。不等 = drift。
 *
 * 设计：
 *   - checkKpDrift(db, sampleSize) — 抽 N 条返 drift 清单
 *   - 不修改任何数据
 *   - 跳过新列 NULL 的（那是 backfill 未跑，不算 drift — 走 audit 就行）
 *   - 跳过旧列 parse 自己 throw 的（旧数据本身就有问题，不算双写漂移）
 */

import { parseBody, type Format } from './body-parser';
import { parsedToStructured, evalContentToEvaluations } from './kp-body-helpers';

export interface DriftEntry {
  id: string;
  discipline: string;
  /** 哪个字段漂移 */
  field: 'body_zh' | 'body_ja' | 'evaluations_zh' | 'evaluations_ja';
  /** 简要描述（前 200 字） */
  detail: string;
}

export interface DriftReport {
  sampled: number;
  skipped: number;
  drifts: DriftEntry[];
}

interface KpDriftRow {
  id: string;
  discipline: string;
  body_zh: string;
  body_ja: string | null;
  format: string;
  eval_content_zh_json: string | null;
  eval_content_ja_json: string | null;
  body_zh_json: string | null;
  body_ja_json: string | null;
  evaluations_zh_json: string | null;
  evaluations_ja_json: string | null;
}

export async function checkKpDrift(
  db: D1Database,
  sampleSize = 100,
): Promise<DriftReport> {
  const rows = await db
    .prepare(
      `SELECT id, discipline, body_zh, body_ja, format,
              eval_content_zh_json, eval_content_ja_json,
              body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json
       FROM kp
       WHERE body_zh_json IS NOT NULL
         AND COALESCE(deleted_at, '') = ''
       ORDER BY RANDOM()
       LIMIT ?`,
    )
    .bind(sampleSize)
    .all<KpDriftRow>();

  const drifts: DriftEntry[] = [];
  let skipped = 0;
  const sample = rows.results ?? [];

  for (const row of sample) {
    const fmt = (row.format ?? 'narrative') as Format;

    // body_zh
    try {
      const fromOld = parsedToStructured(parseBody(row.body_zh ?? '', fmt));
      const fromNew = JSON.parse(row.body_zh_json!) as unknown;
      if (!structurallyEqual(fromOld, fromNew)) {
        drifts.push({
          id: row.id,
          discipline: row.discipline,
          field: 'body_zh',
          detail: summarize(fromOld, fromNew),
        });
      }
    } catch (e) {
      skipped++;
      continue;
    }

    // body_ja（仅当两边都有 / 都没有；只有一边算 drift）
    const jaOldExists = row.body_ja != null && row.body_ja !== '';
    const jaNewExists = row.body_ja_json != null;
    if (jaOldExists !== jaNewExists) {
      drifts.push({
        id: row.id,
        discipline: row.discipline,
        field: 'body_ja',
        detail: `presence drift: old=${jaOldExists} new=${jaNewExists}`,
      });
    } else if (jaOldExists && jaNewExists) {
      try {
        const fromOld = parsedToStructured(parseBody(row.body_ja!, fmt));
        const fromNew = JSON.parse(row.body_ja_json!) as unknown;
        if (!structurallyEqual(fromOld, fromNew)) {
          drifts.push({
            id: row.id,
            discipline: row.discipline,
            field: 'body_ja',
            detail: summarize(fromOld, fromNew),
          });
        }
      } catch {
        skipped++;
      }
    }

    // evaluations_zh
    if (row.evaluations_zh_json) {
      const oldEval = safeJson<Record<string, string>>(row.eval_content_zh_json, {});
      const fromOld = evalContentToEvaluations(oldEval);
      const fromNew = safeJson<unknown>(row.evaluations_zh_json, null);
      if (!structurallyEqual(fromOld, fromNew)) {
        drifts.push({
          id: row.id,
          discipline: row.discipline,
          field: 'evaluations_zh',
          detail: summarize(fromOld, fromNew),
        });
      }
    }
  }

  return {
    sampled: sample.length,
    skipped,
    drifts,
  };
}

/** 结构相等：JSON 比较 + 对象 key 排序消除顺序差异。 */
function structurallyEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

function summarize(a: unknown, b: unknown): string {
  const aStr = JSON.stringify(a).slice(0, 100);
  const bStr = JSON.stringify(b).slice(0, 100);
  return `old=${aStr} new=${bStr}`;
}

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
