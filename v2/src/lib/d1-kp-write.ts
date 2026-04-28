/**
 * KP 直写 D1 (v0.5.89) — 编辑 API 保存成功后立即更新 D1，让用户刷新就看到。
 *
 * 不依赖 GitHub Actions sync 跑完。等 GH Actions 跑完会用 sync 脚本重建 D1，
 * 内容相同（git 已 commit），只是 kp_school / kp_scholar 的 position
 * 顺序可能微调（sync 用 school.concepts / scholar.kpsOrder 真序，这里
 * fallback 用 KP 自己的 schools/scholars 数组顺序）。视觉上无差异。
 *
 * 写入边界：
 *   1. kp 主表（UPSERT）
 *   2. kp_school join — 该 kp 的旧行删掉，按 KP.schools 顺序重新插入
 *   3. kp_scholar join — 该 kp 的旧行删掉，按 KP.scholars 顺序重新插入
 *   4. kp_fts — 该 kp 的旧行删掉，重新插入
 *
 * 用 D1 batch API 批量执行（原子性）。
 */

import type { Kp as KpType } from '~/schemas/kp';
import { z } from 'zod';
import { Kp } from '~/schemas/kp';

type ParsedKp = z.infer<typeof Kp>;

/** 通用 retry：尝试 attempts 次，每次失败 backoff 200/400/600ms */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 200,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * 把单个 KP UPSERT 进 D1（含主表 + joins + FTS）。
 * 用 db.batch() 原子执行 — 任一步失败全部 rollback。
 */
export async function upsertKpInD1(
  db: D1Database,
  kp: ParsedKp,
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  // 1. KP 主表 UPSERT
  stmts.push(
    db.prepare(
      `INSERT INTO kp (id, discipline, year, title_zh, title_en, title_ja,
                        body_zh, body_ja, tags_json,
                        eval_content_zh_json, eval_content_ja_json,
                        format, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         discipline = excluded.discipline,
         year = excluded.year,
         title_zh = excluded.title_zh,
         title_en = excluded.title_en,
         title_ja = excluded.title_ja,
         body_zh = excluded.body_zh,
         body_ja = excluded.body_ja,
         tags_json = excluded.tags_json,
         eval_content_zh_json = excluded.eval_content_zh_json,
         eval_content_ja_json = excluded.eval_content_ja_json,
         format = excluded.format,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
    ).bind(
      kp.id,
      kp.discipline,
      kp.year ?? '',
      kp.title.zh,
      kp.title.en ?? null,
      kp.title.ja ?? null,
      kp.body.zh,
      kp.body.ja ?? null,
      JSON.stringify(kp.tags ?? []),
      JSON.stringify(kp.evalContent?.zh ?? {}),
      JSON.stringify(kp.evalContent?.ja ?? {}),
      kp.format,
      kp.createdAt,
      kp.updatedAt,
    ),
  );

  // 2. kp_school joins — 删旧建新（fallback position：1000+i 跟 sync 脚本一致）
  stmts.push(db.prepare('DELETE FROM kp_school WHERE kp_id = ?').bind(kp.id));
  kp.schools.forEach((schoolKey, i) => {
    stmts.push(
      db.prepare(
        'INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)',
      ).bind(kp.id, schoolKey, 1000 + i),
    );
  });

  // 3. kp_scholar joins — 同上
  stmts.push(db.prepare('DELETE FROM kp_scholar WHERE kp_id = ?').bind(kp.id));
  kp.scholars.forEach((scholarKey, i) => {
    stmts.push(
      db.prepare(
        'INSERT INTO kp_scholar (kp_id, scholar_key, position) VALUES (?, ?, ?)',
      ).bind(kp.id, scholarKey, 1000 + i),
    );
  });

  // 4. kp_fts — 删旧建新
  stmts.push(db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(kp.id));
  stmts.push(
    db.prepare(
      `INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      kp.id,
      kp.title.zh,
      kp.title.en ?? '',
      kp.title.ja ?? '',
      kp.body.zh,
      kp.body.ja ?? '',
    ),
  );

  await db.batch(stmts);
}

/**
 * 删除 KP 在 D1 的所有行（主表 + joins + FTS）。
 * 主表 DELETE 会触发 cascade（kp_school / kp_scholar / user_progress），
 * user_note 是 SET NULL（migration 0005）。但显式删 join 行更明确。
 */
export async function deleteKpInD1(
  db: D1Database,
  kpId: string,
): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_school WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_scholar WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp WHERE id = ?').bind(kpId),
  ]);
}

export type { KpType };
