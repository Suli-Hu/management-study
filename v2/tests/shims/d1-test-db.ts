/**
 * D1Database 兼容 shim — 用 better-sqlite3 in-memory 提供真实 SQL 执行。
 *
 * 用途：让需要真 SQL 的测试（sync-resource、schema 一致性、ON CONFLICT 检测）
 *      不再依赖现有 mockDb()（mockDb 只检查 SQL 字符串关键字，不真正 run）。
 *
 * 兼容范围：
 *   - prepare(sql).bind(...).run() / .all() / .first()
 *   - batch([stmt, ...]) — 包在事务里执行
 *   - exec(sql) — DDL / 多语句
 *
 * 不兼容（D1 独有，目前测试不需要）：
 *   - meta.duration / meta.changes 精度
 *   - 某些 D1 特殊错误码（仅返回 SQLite native error）
 */

import Database from 'better-sqlite3';
import type { Database as SqliteDb } from 'better-sqlite3';

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number };
}

interface PreparedStmt {
  sql: string;
  binds: unknown[];
  bind(...args: unknown[]): PreparedStmt;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
}

export interface D1LikeDatabase {
  prepare(sql: string): PreparedStmt;
  batch(stmts: PreparedStmt[]): Promise<D1Result[]>;
  exec(sql: string): Promise<D1Result>;
  /** test-only: 拿到底层 SQLite 句柄（跑 PRAGMA、查 sqlite_master 等） */
  raw(): SqliteDb;
}

export function createTestD1(): D1LikeDatabase {
  const db = new Database(':memory:');
  // D1 默认 FK OFF（migration 0014 注释明确说："PRAGMA foreign_keys 在 D1 默认 OFF"）
  // 测试环境保持一致，避免 FK 干扰 sync 路径独立测试
  db.pragma('foreign_keys = OFF');

  function makeStmt(sql: string, binds: unknown[] = []): PreparedStmt {
    return {
      sql,
      binds,
      bind(...args: unknown[]) {
        return makeStmt(sql, args);
      },
      async run(): Promise<D1Result> {
        const stmt = db.prepare(sql);
        const info = stmt.run(...(binds as never[]));
        return {
          results: [],
          success: true,
          meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
        };
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...(binds as never[])) as T[];
        return {
          results: rows,
          success: true,
          meta: { changes: 0, last_row_id: 0 },
        };
      },
      async first<T = unknown>(): Promise<T | null> {
        const stmt = db.prepare(sql);
        const row = stmt.get(...(binds as never[])) as T | undefined;
        return row ?? null;
      },
    };
  }

  return {
    prepare(sql: string): PreparedStmt {
      return makeStmt(sql);
    },
    async batch(stmts: PreparedStmt[]): Promise<D1Result[]> {
      // D1 batch 是原子的 — 包在事务里
      const tx = db.transaction((items: PreparedStmt[]) => {
        const results: D1Result[] = [];
        for (const s of items) {
          const stmt = db.prepare(s.sql);
          // batch 里的 statement 通常是 INSERT/DELETE/UPDATE，run() 即可
          const info = stmt.run(...(s.binds as never[]));
          results.push({
            results: [],
            success: true,
            meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
          });
        }
        return results;
      });
      return tx(stmts);
    },
    async exec(sql: string): Promise<D1Result> {
      db.exec(sql);
      return { results: [], success: true, meta: { changes: 0, last_row_id: 0 } };
    },
    raw(): SqliteDb {
      return db;
    },
  };
}
