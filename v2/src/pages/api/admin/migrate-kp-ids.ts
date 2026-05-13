/**
 * POST /api/admin/migrate-kp-ids (v0.11.39)
 *
 * 把 D1 里历史长 timestamp KP id（如 k1709876543210234）批量重命名为
 * 顺延数字短 id（k629/k630/...），跟 v0.11.38 起新生成的 ID 风格统一。
 *
 * 路径：
 *   POST /api/admin/migrate-kp-ids?discipline=keiei&dry_run=true&limit=10
 *
 * Query params:
 *   - discipline (required): keiei / marketing / sociology / ...
 *   - dry_run    (default true): true = 只返计划不动数据；false = 真改
 *   - limit      (default 10, max 50): 单次最多处理几个 KP
 *
 * 流程：
 *   1. SELECT 该 discipline 下 length(id) > 6 的 KP（按 created_at 升序）
 *   2. 取当前 discipline 的 max numeric id (max+i 给每个新 ID)
 *   3. 构建 {old: new} 重命名计划
 *   4. dry_run=true → 直接返计划 JSON，data 不动
 *   5. dry_run=false → 一次 db.batch() 原子事务执行所有 rename
 *
 * 每个 KP rename 的 batch 步骤（顺序关键）：
 *   a. INSERT 新 kp 行（SELECT 老行复制）
 *   b. UPDATE 所有 FK 引用表（kp_school / kp_scholar / kp_fts /
 *      knowledge_point_versions / study_session / user_note / user_progress）
 *   c. UPDATE knowledge_point_versions.snapshot_json
 *      REPLACE '"id":"old"' → '"id":"new"'（修嵌套的老 ID 字符串）
 *   d. DELETE 老 kp 行（此时所有 FK 已迁，ON DELETE CASCADE 找不到引用）
 *
 * 鉴权：super-admin only（与 migrate-quad-axes 一致）
 *
 * idempotent: 重跑会找剩余 length(id)>6 的 KP 继续 rename；rename 过的不再被选中
 *
 * 用法：
 *   # dry_run 先看计划
 *   curl -X POST -H "Authorization: Bearer $MS_TOKEN" \
 *     "https://study.sususu.org/api/admin/migrate-kp-ids?discipline=keiei&dry_run=true&limit=5"
 *
 *   # 第一次 wet run 1 个验证
 *   curl -X POST -H "Authorization: Bearer $MS_TOKEN" \
 *     "https://study.sususu.org/api/admin/migrate-kp-ids?discipline=keiei&dry_run=false&limit=1"
 *
 *   # 批量
 *   curl -X POST -H "Authorization: Bearer $MS_TOKEN" \
 *     "https://study.sususu.org/api/admin/migrate-kp-ids?discipline=keiei&dry_run=false&limit=20"
 */

import type { APIRoute } from 'astro';
import { json } from '~/lib/api-response';

interface PlanEntry {
  old: string;
  new: string;
  title_zh: string;
}

interface MigrateResult {
  ok: true;
  discipline: string;
  dry_run: boolean;
  processed: number;
  remaining_long_ids: number;
  plan: PlanEntry[];
}

export const POST: APIRoute = async ({ locals, url }) => {
  if (!locals.user) {
    return json(403, { ok: false, reason: 'not_admin' });
  }
  if (!locals.isSuperAdmin) {
    return json(403, { ok: false, reason: 'super_admin_required' });
  }

  const discipline = url.searchParams.get('discipline');
  if (!discipline || !/^[a-z][a-z0-9_-]*$/.test(discipline)) {
    return json(400, { ok: false, reason: 'discipline_required' });
  }

  const dry_run = url.searchParams.get('dry_run') !== 'false';
  const rawLimit = Number(url.searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 50) : 10;

  const db = locals.runtime.env.DB;
  const prefix = discipline.match(/^[a-z]/)?.[0] ?? 'k';

  // 1. 找当前 discipline 的长 ID（length > 6）
  const longRows = await db
    .prepare(
      `SELECT id, title_zh
       FROM kp
       WHERE discipline = ?
         AND length(id) > 6
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
    )
    .bind(discipline, limit)
    .all<{ id: string; title_zh: string }>();
  const longList = longRows.results ?? [];

  // 2. 取当前 max numeric id
  const maxRow = await db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(id, 2) AS INTEGER)) AS max_n
       FROM kp
       WHERE discipline = ?
         AND length(id) BETWEEN 4 AND 6
         AND SUBSTR(id, 1, 1) = ?
         AND CAST(SUBSTR(id, 2) AS INTEGER) > 0`,
    )
    .bind(discipline, prefix)
    .first<{ max_n: number | null }>();
  const startN = (maxRow?.max_n ?? 0) + 1;

  // 3. 构建 rename plan
  const plan: PlanEntry[] = longList.map((row, i) => ({
    old: row.id,
    new: `${prefix}${(startN + i).toString().padStart(3, '0')}`,
    title_zh: row.title_zh,
  }));

  // 4. 数 remaining
  const remainingRow = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM kp
       WHERE discipline = ?
         AND length(id) > 6`,
    )
    .bind(discipline)
    .first<{ n: number }>();
  const remaining = remainingRow?.n ?? 0;

  if (dry_run) {
    const result: MigrateResult = {
      ok: true,
      discipline,
      dry_run: true,
      processed: 0,
      remaining_long_ids: remaining,
      plan,
    };
    return json(200, result);
  }

  // 5. wet run: 构建原子 batch
  const stmts = [];
  for (const { old, new: newId } of plan) {
    // a. 新 kp 行（克隆所有列；列出全列防 schema 漂移后某列被 default 化）
    stmts.push(
      db
        .prepare(
          `INSERT INTO kp (
             id, tenant_id, discipline, year, title_zh, title_en, title_ja,
             tags_json, created_by, updated_by, created_at, updated_at,
             body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json,
             body_format, deleted_at
           )
           SELECT
             ?, tenant_id, discipline, year, title_zh, title_en, title_ja,
             tags_json, created_by, updated_by, created_at, updated_at,
             body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json,
             body_format, deleted_at
           FROM kp WHERE id = ?`,
        )
        .bind(newId, old),
    );

    // b. UPDATE 所有 FK kp_id 引用表
    stmts.push(db.prepare('UPDATE kp_school SET kp_id = ? WHERE kp_id = ?').bind(newId, old));
    stmts.push(db.prepare('UPDATE kp_scholar SET kp_id = ? WHERE kp_id = ?').bind(newId, old));
    stmts.push(db.prepare('UPDATE knowledge_point_versions SET kp_id = ? WHERE kp_id = ?').bind(newId, old));
    stmts.push(db.prepare('UPDATE study_session SET kp_id = ? WHERE kp_id = ?').bind(newId, old));
    stmts.push(db.prepare('UPDATE user_note SET kp_id = ? WHERE kp_id = ?').bind(newId, old));
    stmts.push(db.prepare('UPDATE user_progress SET kp_id = ? WHERE kp_id = ?').bind(newId, old));
    // kp_fts 用 id 不是 kp_id
    stmts.push(db.prepare('UPDATE kp_fts SET id = ? WHERE id = ?').bind(newId, old));

    // c. snapshot_json 字符串替换（修嵌套老 ID）
    stmts.push(
      db
        .prepare(
          `UPDATE knowledge_point_versions
           SET snapshot_json = REPLACE(snapshot_json, ?, ?)
           WHERE kp_id = ?`,
        )
        .bind(`"id":"${old}"`, `"id":"${newId}"`, newId),
    );

    // d. 删老 kp 行（CASCADE 触发但 b 已把所有引用搬走，cascade 影响 0 行）
    stmts.push(db.prepare('DELETE FROM kp WHERE id = ?').bind(old));
  }

  await db.batch(stmts);

  const result: MigrateResult = {
    ok: true,
    discipline,
    dry_run: false,
    processed: plan.length,
    remaining_long_ids: Math.max(0, remaining - plan.length),
    plan,
  };
  return json(200, result);
};
