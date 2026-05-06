/**
 * Migration 0023: kp_school.position 单段化测试
 *
 * 详见 v2/docs/KP-SCHOOL-POSITION-UNIFY-PRD.md §5
 *
 * 验证：
 * 1. 混合段位（< 1000 + >= 1000）数据规范化为 0..N-1，显示顺序保持
 * 2. 跨多个学派独立打号
 * 3. 幂等：跑两次结果不变
 */

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';

const MIGRATION_PATH = fileURLToPath(
  new URL('../migrations/0023_normalize_kp_school_position.sql', import.meta.url),
);

async function setupDb(): Promise<D1LikeDatabase> {
  const db = createTestD1();
  await applyAllMigrations(db);
  // applyAllMigrations 已跑过 0023（空表无效果），后续测试自己再 exec 一次
  return db;
}

async function readMigration0023(): Promise<string> {
  return readFileSync(MIGRATION_PATH, 'utf-8');
}

async function insertRow(
  db: D1LikeDatabase,
  kpId: string,
  schoolKey: string,
  position: number,
): Promise<void> {
  await db
    .prepare('INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)')
    .bind(kpId, schoolKey, position)
    .run();
}

async function readPositions(
  db: D1LikeDatabase,
  schoolKey: string,
): Promise<Array<{ kp_id: string; position: number }>> {
  const r = await db
    .prepare('SELECT kp_id, position FROM kp_school WHERE school_key = ? ORDER BY position ASC')
    .bind(schoolKey)
    .all<{ kp_id: string; position: number }>();
  return r.results;
}

describe('Migration 0023: kp_school.position 单段化', () => {
  test('混合段位规范化为 0..N-1，显示顺序保持', async () => {
    const db = await setupDb();
    const sql = await readMigration0023();

    // 学派 A 下 5 个 KP，混合段位：[0, 1, 2, 1000, 1001]
    // 显示顺序（按当前 position ASC）：kp1, kp2, kp3, kp4, kp5
    await insertRow(db, 'kp1', 'A', 0);
    await insertRow(db, 'kp2', 'A', 1);
    await insertRow(db, 'kp3', 'A', 2);
    await insertRow(db, 'kp4', 'A', 1000);
    await insertRow(db, 'kp5', 'A', 1001);

    await db.exec(sql);

    const rows = await readPositions(db, 'A');
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
    expect(rows.map((r) => r.kp_id)).toEqual(['kp1', 'kp2', 'kp3', 'kp4', 'kp5']);
  });

  test('多个学派各自独立打号', async () => {
    const db = await setupDb();
    const sql = await readMigration0023();

    // 学派 A：[1000, 1001]
    await insertRow(db, 'kpA1', 'A', 1000);
    await insertRow(db, 'kpA2', 'A', 1001);
    // 学派 B：[0, 1, 1000]
    await insertRow(db, 'kpB1', 'B', 0);
    await insertRow(db, 'kpB2', 'B', 1);
    await insertRow(db, 'kpB3', 'B', 1000);

    await db.exec(sql);

    const rowsA = await readPositions(db, 'A');
    expect(rowsA.map((r) => r.position)).toEqual([0, 1]);
    expect(rowsA.map((r) => r.kp_id)).toEqual(['kpA1', 'kpA2']);

    const rowsB = await readPositions(db, 'B');
    expect(rowsB.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(rowsB.map((r) => r.kp_id)).toEqual(['kpB1', 'kpB2', 'kpB3']);
  });

  test('幂等：跑两次结果不变', async () => {
    const db = await setupDb();
    const sql = await readMigration0023();

    // 已规范化数据：[0, 1, 2]
    await insertRow(db, 'kpX', 'X', 0);
    await insertRow(db, 'kpY', 'X', 1);
    await insertRow(db, 'kpZ', 'X', 2);

    await db.exec(sql);
    await db.exec(sql);

    const rows = await readPositions(db, 'X');
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.kp_id)).toEqual(['kpX', 'kpY', 'kpZ']);
  });

  test('同 position 多行 → 用 kp_id ASC 决断顺序', async () => {
    const db = await setupDb();
    const sql = await readMigration0023();

    // 边界：所有 position 相同（早期 bug 可能出现）
    await insertRow(db, 'kpb', 'C', 1000);
    await insertRow(db, 'kpa', 'C', 1000);
    await insertRow(db, 'kpc', 'C', 1000);

    await db.exec(sql);

    const rows = await readPositions(db, 'C');
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    // kp_id ASC fallback：kpa < kpb < kpc
    expect(rows.map((r) => r.kp_id)).toEqual(['kpa', 'kpb', 'kpc']);
  });
});
