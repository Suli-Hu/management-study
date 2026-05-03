/**
 * v0.8.0 Stage 1+2 — KP body 结构化新列 audit (PM 决策：Stage 3 hard cut go/no-go gate)
 *
 * 用途：
 *   - Stage 1/2 期间监控：哪些 KP 的 body_zh_json 不能被 KpBody.parse 通过
 *     （脏数据双写产物 — 见 PRD §6.3 防线 1，被 fallback 救命的 KP）
 *   - Stage 3 hard cut 前必跑：清单 = 0 才允许 cut，否则先修数据
 *
 * 设计：
 *   - auditKpStructured(db) — 扫全表，返脏 KP 清单 + 概览
 *   - 不修改任何数据（read-only）
 *   - 与 render-body-with-fallback 的 try-catch 一致 — 同样的 schema gate
 */

import { KpBody } from '~/schemas/kp-body-structured';

export interface AuditDirtyKp {
  id: string;
  discipline: string;
  format: string | null;
  /** zh / ja / both — 哪个语种的新列脏 */
  langs: Array<'zh' | 'ja'>;
  /** 第一个 lang 的 zod 报错信息（trimmed） */
  reason: string;
}

export interface AuditSummary {
  total_kps: number;
  /** 新列至少有一个 lang 不为 NULL 的 KP 数 */
  with_new_col: number;
  /** 新列全 NULL 的 KP 数（backfill 未跑或写入路径漏写） */
  missing_new_col: number;
  /** schema 校验失败的 KP（脏数据，Stage 3 hard cut 会被 422） */
  dirty_kps: AuditDirtyKp[];
}

interface KpAuditRow {
  id: string;
  discipline: string;
  body_zh_json: string | null;
  body_ja_json: string | null;
  body_format: string | null;
}

export async function auditKpStructured(db: D1Database): Promise<AuditSummary> {
  const all = await db
    .prepare(
      `SELECT id, discipline, body_zh_json, body_ja_json, body_format
       FROM kp
       WHERE COALESCE(deleted_at, '') = ''`,
    )
    .all<KpAuditRow>();
  const rows = all.results ?? [];

  const dirty: AuditDirtyKp[] = [];
  let missing = 0;
  let withNew = 0;

  for (const row of rows) {
    if (!row.body_zh_json && !row.body_ja_json) {
      missing++;
      continue;
    }
    withNew++;

    const langs: Array<'zh' | 'ja'> = [];
    let firstReason = '';

    if (row.body_zh_json) {
      const r = tryParse(row.body_zh_json);
      if (!r.ok) {
        langs.push('zh');
        firstReason ||= r.reason;
      }
    }
    if (row.body_ja_json) {
      const r = tryParse(row.body_ja_json);
      if (!r.ok) {
        langs.push('ja');
        firstReason ||= r.reason;
      }
    }

    if (langs.length > 0) {
      dirty.push({
        id: row.id,
        discipline: row.discipline,
        format: row.body_format,
        langs,
        reason: firstReason,
      });
    }
  }

  return {
    total_kps: rows.length,
    with_new_col: withNew,
    missing_new_col: missing,
    dirty_kps: dirty,
  };
}

function tryParse(json: string): { ok: true } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, reason: `json_parse: ${(e as Error).message}` };
  }
  const r = KpBody.safeParse(parsed);
  if (r.success) return { ok: true };
  return { ok: false, reason: r.error.issues[0]?.message ?? 'kpbody_invalid' };
}
