/**
 * 通用 D1 upsert helper — 从 TableMeta 派生 INSERT...ON CONFLICT DO UPDATE。
 *
 * 价值：
 *   1. ON CONFLICT 列集自动 = TableMeta.pk，不可能与主键错位。
 *   2. INSERT 列序 = TableMeta.cols 顺序；bind 按 col 名取 row[col]，
 *      消除"位置型 .bind() 与列名错位"风险。
 *   3. UPDATE SET 子句自动覆盖所有非 PK 列。
 *
 * 不在范围内：
 *   - join 表（kp_school / kp_scholar / scholar_school）— 走 delete-then-insert，
 *     没有 upsert 语义，由各 writer 自行维护。
 *   - kp_fts 虚拟表 — 也走 delete-then-insert。
 */

import type { TableMeta } from './d1-tables';

/**
 * 构造 INSERT...ON CONFLICT DO UPDATE D1PreparedStatement。
 * row 必须含 TableMeta.cols 列出的全部 key（缺一个会 bind null/undefined，可能违反 NOT NULL）。
 */
export function buildUpsertStmt(
  db: D1Database,
  table: TableMeta,
  row: Record<string, unknown>,
): D1PreparedStatement {
  const cols = table.cols;
  const placeholders = cols.map(() => '?').join(', ');
  const conflictCols = table.pk.join(', ');
  // ON CONFLICT 后只更新非 PK 列（PK 改了等于换行，不在 upsert 语义内）
  const updateCols = cols.filter((c) => !(table.pk as readonly string[]).includes(c));
  const updateClause = updateCols.map((c) => `${c} = excluded.${c}`).join(',\n         ');

  const sql = `INSERT INTO ${table.name} (${cols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT(${conflictCols}) DO UPDATE SET
         ${updateClause}`;

  const values = cols.map((c) => row[c]);
  return db.prepare(sql).bind(...values);
}
