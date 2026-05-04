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
 * accent 列已废弃（v0.5.0 删 enum），写空字符串 '' 占位 —— 与 scripts/sync-to-d1.ts 一致。
 *
 * 删除：
 *   - 调用方先做"该 discipline 下无 school / scholar / kp / view"的 0-deps gate。
 *   - 这里直写 discipline 表 DELETE，不级联（FK 是 RESTRICT，子表存在会报错 — 这是想要的安全网）。
 */

import type { z } from 'zod';
import type { Discipline } from '~/schemas/discipline';
import { DISCIPLINE_TABLE } from './d1-tables';
import { buildUpsertStmt } from './d1-upsert';
import { deepStripStrong } from './sanitize-strong';

type ParsedDiscipline = z.infer<typeof Discipline>;

export async function upsertDisciplineInD1(
  db: D1Database,
  disc: ParsedDiscipline,
): Promise<void> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  disc = deepStripStrong(disc);

  await buildUpsertStmt(db, DISCIPLINE_TABLE, {
    key: disc.key,
    title_zh: disc.title.zh,
    title_en: disc.title.en ?? null,
    title_ja: disc.title.ja ?? null,
    tagline_zh: disc.tagline?.zh ?? null,
    tagline_ja: disc.tagline?.ja ?? null,
    accent: '',
    tags_json: JSON.stringify(disc.tags ?? []),
    themes_json: JSON.stringify(disc.themes ?? []),
    created_at: disc.createdAt,
    updated_at: disc.updatedAt,
  }).run();
}

export async function deleteDisciplineInD1(
  db: D1Database,
  disciplineKey: string,
): Promise<void> {
  await db.prepare('DELETE FROM discipline WHERE key = ?').bind(disciplineKey).run();
}
