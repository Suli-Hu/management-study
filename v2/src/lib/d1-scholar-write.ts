/**
 * Scholar 直写 D1 (v0.5.93, v0.6.8 复合 PK 改造)
 *
 * 写入边界：
 *   1. scholar 主表 (UPSERT) — PK 复合 (discipline, key)
 *   2. scholar_school join — 重建 schools[] 声明部分（position 0..N），含 scholar_discipline
 *      KP-driven fallback rows（position 1000）保持不动
 *   3. kp_scholar join — 按 kpsOrder[] 重建 scholar-driven 部分（position 0..N），含 scholar_discipline
 *      KP-driven fallback (position 1000+i) 保留不动
 *
 * 不在边界内：
 *   - schoolsExplicit / kpsOrder 都是 git-only 字段（D1 没专门列），
 *     这里仅"按 git 真源 reconcile join 表的 scholar-driven 部分"
 *
 * 删除：
 *   - 调用方先做 0-KP gate 检查（避免删后相关 KP 学者列变空）
 *   - 签名按 (discipline, key) 复合 — caller 必须传 discipline
 */

import type { z } from 'zod';
import type { Scholar } from '~/schemas/scholar';

type ParsedScholar = z.infer<typeof Scholar>;

export async function upsertScholarInD1(
  db: D1Database,
  scholar: ParsedScholar,
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  // 1. scholar 主表 UPSERT — ON CONFLICT 复合 (discipline, key)
  stmts.push(
    db.prepare(
      `INSERT INTO scholar (
        key, discipline, name_zh, name_en, name_ja,
        contribution_zh, contribution_ja, lifespan, institution,
        born, died, nationality, flag, origin, field, accent, tags_json,
        nobel_year, nobel_detail, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(discipline, key) DO UPDATE SET
        name_zh = excluded.name_zh,
        name_en = excluded.name_en,
        name_ja = excluded.name_ja,
        contribution_zh = excluded.contribution_zh,
        contribution_ja = excluded.contribution_ja,
        lifespan = excluded.lifespan,
        institution = excluded.institution,
        born = excluded.born,
        died = excluded.died,
        nationality = excluded.nationality,
        flag = excluded.flag,
        origin = excluded.origin,
        field = excluded.field,
        accent = excluded.accent,
        tags_json = excluded.tags_json,
        nobel_year = excluded.nobel_year,
        nobel_detail = excluded.nobel_detail,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`,
    ).bind(
      scholar.key,
      scholar.discipline,
      scholar.name.zh,
      scholar.name.en ?? null,
      scholar.name.ja ?? null,
      scholar.contribution.zh,
      scholar.contribution.ja ?? null,
      scholar.lifespan ?? '',
      scholar.institution ?? '',
      scholar.born ?? '',
      scholar.died ?? '',
      scholar.nationality ?? '',
      scholar.flag ?? '',
      scholar.origin ?? '',
      scholar.field ?? '',
      '',
      JSON.stringify(scholar.tags ?? []),
      scholar.nobel?.year ?? null,
      scholar.nobel?.detail ?? null,
      scholar.createdAt,
      scholar.updatedAt,
    ),
  );

  // 2. scholar_school join — 重建 scholar-driven 部分 (position < 1000)
  //    用 (scholar_discipline, scholar_key) 复合定位
  stmts.push(
    db.prepare(
      `DELETE FROM scholar_school
       WHERE scholar_discipline = ? AND scholar_key = ? AND position < 1000`,
    ).bind(scholar.discipline, scholar.key),
  );
  scholar.schools.forEach((schoolKey, position) => {
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO scholar_school (scholar_discipline, scholar_key, school_key, position)
         VALUES (?, ?, ?, ?)`,
      ).bind(scholar.discipline, scholar.key, schoolKey, position),
    );
  });

  // 3. kp_scholar join — 按 kpsOrder[] 重建 scholar-driven 部分 (position < 1000)
  stmts.push(
    db.prepare(
      `DELETE FROM kp_scholar
       WHERE scholar_discipline = ? AND scholar_key = ? AND position < 1000`,
    ).bind(scholar.discipline, scholar.key),
  );
  scholar.kpsOrder.forEach((kpId, position) => {
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO kp_scholar (kp_id, scholar_discipline, scholar_key, position)
         VALUES (?, ?, ?, ?)`,
      ).bind(kpId, scholar.discipline, scholar.key, position),
    );
  });

  await db.batch(stmts);
}

export async function deleteScholarInD1(
  db: D1Database,
  discipline: string,
  scholarKey: string,
): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM kp_scholar WHERE scholar_discipline = ? AND scholar_key = ?')
      .bind(discipline, scholarKey),
    db.prepare('DELETE FROM scholar_school WHERE scholar_discipline = ? AND scholar_key = ?')
      .bind(discipline, scholarKey),
    db.prepare('DELETE FROM scholar WHERE discipline = ? AND key = ?')
      .bind(discipline, scholarKey),
  ]);
}
