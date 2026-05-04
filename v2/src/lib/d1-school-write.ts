/**
 * School 直写 D1 (v0.5.93)
 *
 * 写入边界：
 *   1. school 主表 (UPSERT)
 *   2. kp_school join — school-driven 那部分（school.concepts[] → position 0..N）
 *      KP-driven fallback rows（position 1000+i）保持不动，由 KP 写入路径维护
 *
 * 不在边界内：
 *   - scholar_school 反向派生（v0.4.17 三路并集）— 留 GH Actions 全量 sync 兜底
 *
 * 删除：
 *   - 调用方必须先做 0-KP gate 检查（v0.4.18），D1 helper 假设 caller 已校验
 */

import type { z } from 'zod';
import type { School } from '~/schemas/school';
import { SCHOOL_TABLE } from './d1-tables';
import { buildUpsertStmt } from './d1-upsert';
import { deepStripStrong } from './sanitize-strong';

type ParsedSchool = z.infer<typeof School>;

export async function upsertSchoolInD1(
  db: D1Database,
  school: ParsedSchool,
): Promise<void> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  school = deepStripStrong(school);

  const stmts: D1PreparedStatement[] = [];

  // 1. school 主表 UPSERT（accent 列已废弃但仍要写空字符串，跟 sync 脚本一致）
  stmts.push(
    buildUpsertStmt(db, SCHOOL_TABLE, {
      key: school.key,
      discipline: school.discipline,
      title_zh: school.title.zh,
      title_en: school.title.en ?? null,
      title_ja: school.title.ja ?? null,
      era: school.era ?? '',
      summary_zh: school.summary.zh,
      summary_ja: school.summary.ja ?? null,
      theme_key: school.themeKey,
      accent: '',
      tags_json: JSON.stringify(school.tags ?? []),
      created_at: school.createdAt,
      updated_at: school.updatedAt,
    }),
  );

  // 2. kp_school join — 重建 school-driven 部分（position < 1000）
  //    KP-driven fallback 保留（position >= 1000）
  stmts.push(
    db.prepare('DELETE FROM kp_school WHERE school_key = ? AND position < 1000')
      .bind(school.key),
  );
  school.concepts.forEach((kpId, position) => {
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO kp_school (kp_id, school_key, position)
         VALUES (?, ?, ?)`,
      ).bind(kpId, school.key, position),
    );
  });

  await db.batch(stmts);
}

/**
 * 删除 school（含所有 join 关联）。
 * 调用方先做 0-KP gate 检查 (count of kp_school where school_key = ?)
 */
export async function deleteSchoolInD1(
  db: D1Database,
  schoolKey: string,
): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM kp_school WHERE school_key = ?').bind(schoolKey),
    db.prepare('DELETE FROM scholar_school WHERE school_key = ?').bind(schoolKey),
    db.prepare('DELETE FROM school WHERE key = ?').bind(schoolKey),
  ]);
}
