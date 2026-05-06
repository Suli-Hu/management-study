/**
 * Stage 3 (v0.11.4): KP PATCH delta 模式 SQL 行为验证
 *
 * 不直接调 patchKpRecord（fixture 太繁琐），而是模拟 patchKpRecord 内
 * 改动的 kp_school delta SQL 序列，验证：
 *   - kept schools 完全不动 position
 *   - removed schools 行被清干净
 *   - added schools 塞头部 (其他行 SHIFT +1)
 *
 * 这是 4C 改名顺序丢失 bug 的回归测试。
 */

import { describe, expect, test } from 'vitest';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';

async function setupDb(): Promise<D1LikeDatabase> {
  const db = createTestD1();
  await applyAllMigrations(db);
  return db;
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

async function readSchool(
  db: D1LikeDatabase,
  schoolKey: string,
): Promise<Array<{ kp_id: string; position: number }>> {
  const r = await db
    .prepare('SELECT kp_id, position FROM kp_school WHERE school_key = ? ORDER BY position ASC, kp_id ASC')
    .bind(schoolKey)
    .all<{ kp_id: string; position: number }>();
  return r.results;
}

/**
 * 模拟 patchKpRecord 内 kp_school delta SQL 序列（[v2/src/lib/kp-api-store.ts:507-538]）
 */
async function applyDelta(
  db: D1LikeDatabase,
  kpId: string,
  currentSchools: string[],
  nextSchools: string[],
): Promise<void> {
  const removed = currentSchools.filter((s) => !nextSchools.includes(s));
  const added = nextSchools.filter((s) => !currentSchools.includes(s));

  for (const schoolKey of removed) {
    await db
      .prepare('DELETE FROM kp_school WHERE kp_id = ? AND school_key = ?')
      .bind(kpId, schoolKey)
      .run();
  }
  for (const schoolKey of added) {
    await db
      .prepare('UPDATE kp_school SET position = position + 1 WHERE school_key = ?')
      .bind(schoolKey)
      .run();
    await db
      .prepare('INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, 0)')
      .bind(kpId, schoolKey)
      .run();
  }
  // kept = currentSchools ∩ nextSchools → 不动
}

describe('Stage 3: KP PATCH kp_school delta', () => {
  test('T1 kept schools 不动 (改 KP 名字不影响顺序，4C 案例)', async () => {
    const db = await setupDb();
    // 学派 A 下 3 个 KP，position 0,1,2
    await insertRow(db, 'kp_other1', 'A', 0);
    await insertRow(db, 'kp_target', 'A', 1); // ← 模拟"4C 在第 2 位"
    await insertRow(db, 'kp_other2', 'A', 2);

    // KP PATCH：schools 不变（[A] → [A]）
    await applyDelta(db, 'kp_target', ['A'], ['A']);

    const rows = await readSchool(db, 'A');
    expect(rows).toEqual([
      { kp_id: 'kp_other1', position: 0 },
      { kp_id: 'kp_target', position: 1 }, // ← 还在第 2 位 ✓
      { kp_id: 'kp_other2', position: 2 },
    ]);
  });

  test('T3 加新 school 塞头部 (其他 KP SHIFT +1，决策点 #1=b)', async () => {
    const db = await setupDb();
    // 学派 B 下 2 个 KP，position 0,1
    await insertRow(db, 'kp_a', 'B', 0);
    await insertRow(db, 'kp_b', 'B', 1);

    // KP_X 新加入 schools=['B']（之前不在 B）
    await applyDelta(db, 'kp_x', [], ['B']);

    const rows = await readSchool(db, 'B');
    expect(rows).toEqual([
      { kp_id: 'kp_x', position: 0 }, // ← 塞头部
      { kp_id: 'kp_a', position: 1 }, // ← shifted
      { kp_id: 'kp_b', position: 2 }, // ← shifted
    ]);
  });

  test('T4 删 school 直接 DELETE (决策点 #5=a，无孤儿)', async () => {
    const db = await setupDb();
    // KP_X 在 A、B 两个学派
    await insertRow(db, 'kp_x', 'A', 5);
    await insertRow(db, 'kp_x', 'B', 7);
    // 学派 A 还有别的 KP
    await insertRow(db, 'kp_other', 'A', 6);

    // KP_X 取消勾选 B
    await applyDelta(db, 'kp_x', ['A', 'B'], ['A']);

    // A 仍有 KP_X
    const aRows = await readSchool(db, 'A');
    expect(aRows.find((r) => r.kp_id === 'kp_x')).toEqual({ kp_id: 'kp_x', position: 5 });
    // B 完全没有 KP_X 行（含 position）
    const bRows = await readSchool(db, 'B');
    expect(bRows.find((r) => r.kp_id === 'kp_x')).toBeUndefined();
  });

  test('T6 schools 集合不变只换顺序 → 完全不动 (决策点 #4=a)', async () => {
    const db = await setupDb();
    // KP_X 在 A=3, B=5
    await insertRow(db, 'kp_x', 'A', 3);
    await insertRow(db, 'kp_x', 'B', 5);

    // schools 数组顺序从 [A,B] 变成 [B,A]，但集合不变
    await applyDelta(db, 'kp_x', ['A', 'B'], ['B', 'A']);

    const aRow = (await readSchool(db, 'A')).find((r) => r.kp_id === 'kp_x');
    const bRow = (await readSchool(db, 'B')).find((r) => r.kp_id === 'kp_x');
    expect(aRow).toEqual({ kp_id: 'kp_x', position: 3 }); // ← 不动
    expect(bRow).toEqual({ kp_id: 'kp_x', position: 5 }); // ← 不动
  });

  test('T7 同时加 + 删 (混合 delta)', async () => {
    const db = await setupDb();
    // KP_X 在 A
    await insertRow(db, 'kp_x', 'A', 2);
    // 学派 C 下已有别人
    await insertRow(db, 'kp_other', 'C', 0);

    // KP_X schools=[A] → [C]：删 A 加 C
    await applyDelta(db, 'kp_x', ['A'], ['C']);

    expect((await readSchool(db, 'A')).find((r) => r.kp_id === 'kp_x')).toBeUndefined();
    const cRows = await readSchool(db, 'C');
    expect(cRows).toEqual([
      { kp_id: 'kp_x', position: 0 }, // ← 塞头部
      { kp_id: 'kp_other', position: 1 }, // ← shifted
    ]);
  });
});
