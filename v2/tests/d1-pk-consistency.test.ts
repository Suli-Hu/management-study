/**
 * Schema vs TableMeta consistency 闸门。
 *
 * 跑全部 migrations 到 in-memory SQLite，从 pragma table_info(<name>) 拿真实
 * PRIMARY KEY 列集，断言 = src/lib/d1-tables.ts 里 TableMeta.pk。
 *
 * 这是把"PK 一致性"从「人工记得」升级为「CI 强制」的关键测试：
 *   - 改 migration 改了 PK，但 TableMeta.pk 没跟 → 此测试 fail
 *   - 改 TableMeta.pk，但 migration 没跟 → 此测试 fail
 *   - 因 buildUpsertStmt 从 TableMeta.pk 派生 ON CONFLICT，
 *     PK 一旦与 TableMeta 一致，ON CONFLICT 自动正确
 *
 * 历史背景：migration 0012 改 view 表 PK 为 (id, discipline)，但
 *   d1-view-write.ts 的 ON CONFLICT(id) 没跟改，bug 沉睡 7 个版本。
 *   有这个测试以前不会再发生。
 */

import { describe, expect, test } from 'vitest';
import { createTestD1 } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';
import { ALL_TABLES } from '~/lib/d1-tables';

interface TableInfoRow {
  name: string;
  pk: number; // 0 = not in PK, 1..N = position in composite PK
}

describe('TableMeta.pk vs migrations 实际 PK 一致性', () => {
  test.each(ALL_TABLES.map((t) => [t.name, t] as const))(
    '%s 表的 TableMeta.pk 必须等于 migrations 跑完后的真实 PRIMARY KEY',
    async (_name, table) => {
      const db = createTestD1();
      await applyAllMigrations(db);

      const cols = db.raw().pragma(`table_info(${table.name})`) as TableInfoRow[];
      const realPK = cols
        .filter((c) => c.pk > 0)
        .sort((a, b) => a.pk - b.pk) // pk 字段记录复合主键内的位置序
        .map((c) => c.name);

      expect(realPK, `表 ${table.name} 的真实 PK 与 TableMeta.pk 不一致`).toEqual(
        [...table.pk],
      );
    },
  );

  test('每个 TableMeta.cols 必须包含全部 pk 列（否则 ON CONFLICT 用的列没在 INSERT 列表）', () => {
    for (const table of ALL_TABLES) {
      const colSet = new Set<string>(table.cols);
      for (const pkCol of table.pk) {
        expect(colSet.has(pkCol), `${table.name}.cols 缺少 PK 列 ${pkCol}`).toBe(true);
      }
    }
  });
});
