/**
 * 把 v2/migrations/*.sql 按文件名顺序 apply 到 in-memory D1。
 *
 * 给真 SQL integration test 用 — 让 schema 与 prod migrations 完全一致。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { D1LikeDatabase } from './d1-test-db';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * apply 全部 migrations。返回已 apply 的文件名列表（用于诊断）。
 */
export async function applyAllMigrations(db: D1LikeDatabase): Promise<string[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // 命名 0001_xxx.sql 保证字典序 = 应用顺序

  const applied: string[] = [];
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    try {
      await db.exec(sql);
      applied.push(f);
    } catch (err) {
      throw new Error(`migration ${f} failed: ${(err as Error).message}`);
    }
  }

  // 关键：D1 prod 上 PRAGMA foreign_keys 是 informational，不实际 enforce
  // （见 migrations/0014_scholar_composite_pk.sql 注释）。多个 migration 在末尾
  // 显式 PRAGMA foreign_keys = ON，会让 better-sqlite3 真去 enforce FK，
  // 但 D1 不会 — 测试需要复现 D1 行为，最后强制关掉。
  db.raw().pragma('foreign_keys = OFF');

  return applied;
}
