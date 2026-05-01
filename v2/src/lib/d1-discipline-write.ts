/**
 * Discipline 直写 D1 (v0.6.7)
 *
 * 写入边界：
 *   - discipline 主表（11 列，含 themes_json / tags_json）
 *
 * 不在边界内：
 *   - school / scholar / kp / view 主表（discipline.json 改不影响它们 — themes/tags 是元数据）
 *   - sync_log（caller 决定要不要记）
 *
 * accent 列已废弃（v0.5.0 删 enum），写空字符串 '' 占位 —— 与 scripts/sync-to-d1.ts 行 258 一致。
 *
 * 删除：
 *   - 调用方先做"该 discipline 下无 school / scholar / kp / view"的 0-deps gate。
 *   - 这里直写 discipline 表 DELETE，不级联（FK 是 RESTRICT，子表存在会报错 — 这是想要的安全网）。
 */

import type { z } from 'zod';
import type { Discipline } from '~/schemas/discipline';

type ParsedDiscipline = z.infer<typeof Discipline>;

export async function upsertDisciplineInD1(
  db: D1Database,
  disc: ParsedDiscipline,
): Promise<void> {
  await db.prepare(
    `INSERT INTO discipline (
       key, title_zh, title_en, title_ja,
       tagline_zh, tagline_ja, accent,
       tags_json, themes_json, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       title_zh = excluded.title_zh,
       title_en = excluded.title_en,
       title_ja = excluded.title_ja,
       tagline_zh = excluded.tagline_zh,
       tagline_ja = excluded.tagline_ja,
       accent = excluded.accent,
       tags_json = excluded.tags_json,
       themes_json = excluded.themes_json,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      disc.key,
      disc.title.zh,
      disc.title.en ?? null,
      disc.title.ja ?? null,
      disc.tagline?.zh ?? null,
      disc.tagline?.ja ?? null,
      '',
      JSON.stringify(disc.tags ?? []),
      JSON.stringify(disc.themes ?? []),
      disc.createdAt,
      disc.updatedAt,
    )
    .run();
}

export async function deleteDisciplineInD1(
  db: D1Database,
  disciplineKey: string,
): Promise<void> {
  await db.prepare('DELETE FROM discipline WHERE key = ?').bind(disciplineKey).run();
}
