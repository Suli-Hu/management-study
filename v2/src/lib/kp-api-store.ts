/**
 * KP API store — v0.8.10 Stage 5: 拆双轨后只读写新列。
 *
 * 写入接受 KpCreateInput / KpPatchInput 新 contract（KpBody discriminated union）：
 *   - body_zh_json / body_ja_json     （structured KpBody JSON）
 *   - body_format                     （冗余 cache = body.zh.format）
 *   - evaluations_zh_json / evaluations_ja_json （6 字段英文 key dict 或 NULL）
 *
 * 旧列（body_zh / body_ja / format / eval_content_*_json）migration 0022 已 DROP，
 * 任何残留代码读取会 SQL 错；不再 backfill / fallback。
 *
 * GET response 切 v0.8 shape（migration-v0.8.md §13）：
 *   - body: { zh: KpBody, ja?: KpBody }
 *   - evaluations: { zh?: KpEvaluationsLang, ja?: KpEvaluationsLang }
 *   - 顶层 format 字段彻底不返
 */

import type { KpCreateInput, KpPatchInput } from '~/schemas/kp-api';
import type { KpBody, KpEvaluationsLang } from '~/schemas/kp-body-structured';
import { hasEvaluationsContent, structuredToSearchText } from './kp-body-helpers';
import { deepStripStrong } from './sanitize-strong';

interface DerivedCols {
  body_zh_json: string;
  body_ja_json: string | null;
  evaluations_zh_json: string | null;
  evaluations_ja_json: string | null;
  body_format: string;
}

/**
 * 从结构化 body + evaluations 派生 D1 写入列。
 * v0.7.42 PM 决策：evaluations 任一字段空时整体写 null（4 路径一致）。
 */
function deriveCols(input: {
  body: { zh: KpBody; ja?: KpBody };
  evaluations?: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang };
}): DerivedCols {
  const evalZh = input.evaluations?.zh;
  const evalJa = input.evaluations?.ja;
  const hasZh = hasEvaluationsContent(evalZh);
  const hasJa = hasEvaluationsContent(evalJa);

  return {
    body_zh_json: JSON.stringify(input.body.zh),
    body_ja_json: input.body.ja ? JSON.stringify(input.body.ja) : null,
    evaluations_zh_json: hasZh && evalZh ? JSON.stringify(evalZh) : null,
    evaluations_ja_json: hasJa && evalJa ? JSON.stringify(evalJa) : null,
    body_format: input.body.zh.format,
  };
}

export interface KpApiRecord {
  id: string;
  tenant_id: string;
  discipline: string;
  year: string;
  title: { zh: string; en?: string; ja?: string };
  body: { zh: KpBody; ja?: KpBody };
  tags: string[];
  schools: string[];
  scholars: string[];
  evaluations?: {
    zh?: KpEvaluationsLang;
    ja?: KpEvaluationsLang;
  };
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KpVersionRecord {
  id: number;
  kp_id: string;
  tenant_id: string;
  version: number;
  snapshot: unknown;
  edited_by: string | null;
  created_at: string;
}

interface KpVersionRow {
  id: number;
  kp_id: string;
  tenant_id: string;
  version: number;
  snapshot_json: string;
  edited_by: string | null;
  created_at: string;
}

interface KpRow {
  id: string;
  tenant_id: string | null;
  discipline: string;
  year: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  tags_json: string;
  body_zh_json: string;
  body_ja_json: string | null;
  evaluations_zh_json: string | null;
  evaluations_ja_json: string | null;
  body_format: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function compactI18n(zh: string, en: string | null, ja: string | null): { zh: string; en?: string; ja?: string } {
  return {
    zh,
    ...(en ? { en } : {}),
    ...(ja ? { ja } : {}),
  };
}

async function refsForKp(db: D1Database, kpId: string): Promise<{ schools: string[]; scholars: string[] }> {
  const [schoolsResult, scholarsResult] = await Promise.all([
    db.prepare('SELECT school_key FROM kp_school WHERE kp_id = ? ORDER BY position ASC, school_key ASC').bind(kpId).all<{ school_key: string }>(),
    db.prepare('SELECT scholar_key FROM kp_scholar WHERE kp_id = ? ORDER BY position ASC, scholar_key ASC').bind(kpId).all<{ scholar_key: string }>(),
  ]);
  return {
    schools: (schoolsResult.results ?? []).map((r) => r.school_key),
    scholars: (scholarsResult.results ?? []).map((r) => r.scholar_key),
  };
}

async function toRecord(db: D1Database, row: KpRow): Promise<KpApiRecord> {
  const refs = await refsForKp(db, row.id);

  const bodyZh = parseJson<KpBody | null>(row.body_zh_json, null);
  if (!bodyZh) {
    throw new Error(`kp ${row.id} body_zh_json missing or unparseable; data inconsistent post-Stage 5`);
  }
  const bodyJa = row.body_ja_json ? parseJson<KpBody | null>(row.body_ja_json, null) : null;

  const evalZh = row.evaluations_zh_json
    ? parseJson<KpEvaluationsLang | null>(row.evaluations_zh_json, null)
    : null;
  const evalJa = row.evaluations_ja_json
    ? parseJson<KpEvaluationsLang | null>(row.evaluations_ja_json, null)
    : null;
  const evaluations =
    evalZh || evalJa
      ? {
          ...(evalZh ? { zh: evalZh } : {}),
          ...(evalJa ? { ja: evalJa } : {}),
        }
      : undefined;

  return {
    id: row.id,
    tenant_id: row.tenant_id ?? row.discipline,
    discipline: row.discipline,
    year: row.year,
    title: compactI18n(row.title_zh, row.title_en, row.title_ja),
    body: { zh: bodyZh, ...(bodyJa ? { ja: bodyJa } : {}) },
    tags: parseJson<string[]>(row.tags_json, []),
    schools: refs.schools,
    scholars: refs.scholars,
    evaluations,
    created_by: row.created_by ?? null,
    updated_by: row.updated_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 内部 helper：从 D1 row 反序列化结构化 body / evaluations（PATCH 合并时用）。 */
async function getKpStructured(
  db: D1Database,
  kpId: string,
): Promise<{ body: { zh: KpBody; ja?: KpBody }; evaluations: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang } } | null> {
  const row = await db
    .prepare(
      'SELECT body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json FROM kp WHERE id = ? AND deleted_at IS NULL',
    )
    .bind(kpId)
    .first<{
      body_zh_json: string | null;
      body_ja_json: string | null;
      evaluations_zh_json: string | null;
      evaluations_ja_json: string | null;
    }>();
  if (!row || !row.body_zh_json) return null;
  const bodyZh = parseJson<KpBody | null>(row.body_zh_json, null);
  if (!bodyZh) return null;
  const bodyJa = row.body_ja_json ? parseJson<KpBody | null>(row.body_ja_json, null) : null;
  const evalZh = row.evaluations_zh_json
    ? parseJson<KpEvaluationsLang | null>(row.evaluations_zh_json, null)
    : null;
  const evalJa = row.evaluations_ja_json
    ? parseJson<KpEvaluationsLang | null>(row.evaluations_ja_json, null)
    : null;
  return {
    body: { zh: bodyZh, ...(bodyJa ? { ja: bodyJa } : {}) },
    evaluations: {
      ...(evalZh ? { zh: evalZh } : {}),
      ...(evalJa ? { ja: evalJa } : {}),
    },
  };
}

export interface ListKpsOptions {
  limit: number;
  offset: number;
  q?: string;
  school?: string;
  scholar?: string;
}

export async function listKpsForTenant(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
  options: ListKpsOptions,
): Promise<{ items: KpApiRecord[]; total: number }> {
  const where = [
    'COALESCE(k.tenant_id, k.discipline) = ?',
    'k.discipline = ?',
    'k.deleted_at IS NULL',
  ];
  const binds: unknown[] = [tenant.tenantId, tenant.discipline];

  const q = options.q?.trim();
  if (q) {
    const like = `%${q}%`;
    // v0.8.10 Stage 5: body 旧 string 列已 drop，body LIKE 改读结构化 JSON 文本（粗粒度，
    // 真正 fts 在 kp_fts 索引；此处仍是 fallback list 搜索）。
    where.push('(k.title_zh LIKE ? OR k.title_en LIKE ? OR k.title_ja LIKE ? OR k.body_zh_json LIKE ? OR k.body_ja_json LIKE ?)');
    binds.push(like, like, like, like, like);
  }
  if (options.school) {
    where.push('EXISTS (SELECT 1 FROM kp_school ks WHERE ks.kp_id = k.id AND ks.school_key = ?)');
    binds.push(options.school);
  }
  if (options.scholar) {
    where.push('EXISTS (SELECT 1 FROM kp_scholar ksch WHERE ksch.kp_id = k.id AND ksch.scholar_discipline = ? AND ksch.scholar_key = ?)');
    binds.push(tenant.discipline, options.scholar);
  }

  const whereSql = where.join(' AND ');
  const totalRow = await db
    .prepare(`SELECT COUNT(*) as n FROM kp k WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const result = await db
    .prepare(`
      SELECT k.*
      FROM kp k
      WHERE ${whereSql}
      ORDER BY k.updated_at DESC, k.id ASC
      LIMIT ?
      OFFSET ?
    `)
    .bind(...binds, options.limit, options.offset)
    .all<KpRow>();

  const items = await Promise.all((result.results ?? []).map((row) => toRecord(db, row)));
  return { items, total: totalRow?.n ?? 0 };
}

export async function getKpRecord(db: D1Database, kpId: string): Promise<KpApiRecord | null> {
  const row = await db
    .prepare('SELECT * FROM kp WHERE id = ? AND deleted_at IS NULL')
    .bind(kpId)
    .first<KpRow>();
  return row ? toRecord(db, row) : null;
}

async function assertRefsBelongToTenant(
  db: D1Database,
  discipline: string,
  schools: string[],
  scholars: string[],
): Promise<{ ok: true } | { ok: false; reason: string; detail: string[] }> {
  if (schools.length > 0) {
    const placeholders = schools.map(() => '?').join(', ');
    const result = await db
      .prepare(`SELECT key FROM school WHERE discipline = ? AND key IN (${placeholders})`)
      .bind(discipline, ...schools)
      .all<{ key: string }>();
    const found = new Set((result.results ?? []).map((r) => r.key));
    const missing = schools.filter((key) => !found.has(key));
    if (missing.length > 0) return { ok: false, reason: 'school_not_in_tenant', detail: missing };
  }

  if (scholars.length > 0) {
    const placeholders = scholars.map(() => '?').join(', ');
    const result = await db
      .prepare(`SELECT key FROM scholar WHERE discipline = ? AND key IN (${placeholders})`)
      .bind(discipline, ...scholars)
      .all<{ key: string }>();
    const found = new Set((result.results ?? []).map((r) => r.key));
    const missing = scholars.filter((key) => !found.has(key));
    if (missing.length > 0) return { ok: false, reason: 'scholar_not_in_tenant', detail: missing };
  }

  return { ok: true };
}

function generatedKpId(discipline: string): string {
  const prefix = discipline.match(/^[a-z]/)?.[0] ?? 'k';
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${Date.now()}${rand}`;
}

async function nextVersion(db: D1Database, kpId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(MAX(version), 0) + 1 as version FROM knowledge_point_versions WHERE kp_id = ?')
    .bind(kpId)
    .first<{ version: number }>();
  return row?.version ?? 1;
}

function snapshot(record: KpApiRecord): string {
  return JSON.stringify(record);
}

export async function createKpRecord(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
  input: KpCreateInput,
  userId: string,
): Promise<{ ok: true; record: KpApiRecord } | { ok: false; status: number; reason: string; detail?: unknown }> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>，调用方不需要记规则。
  // 见 migration-v0.8.md §11 + sanitize-strong.ts。
  input = deepStripStrong(input);

  const id = input.id ?? generatedKpId(tenant.discipline);
  const existing = await db.prepare('SELECT id FROM kp WHERE id = ?').bind(id).first<{ id: string }>();
  if (existing) return { ok: false, status: 409, reason: 'kp_id_exists' };

  const refs = await assertRefsBelongToTenant(db, tenant.discipline, input.schools, input.scholars ?? []);
  if (!refs.ok) return { ok: false, status: 422, reason: refs.reason, detail: refs.detail };

  const now = new Date().toISOString();
  const cols = deriveCols({
    body: input.body,
    evaluations: input.evaluations,
  });
  const ftsTextZh = structuredToSearchText(input.body.zh);
  const ftsTextJa = input.body.ja ? structuredToSearchText(input.body.ja) : '';

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO kp (
        id, tenant_id, discipline, year, title_zh, title_en, title_ja,
        tags_json, created_by, updated_by, created_at, updated_at,
        body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json, body_format
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      tenant.tenantId,
      tenant.discipline,
      input.year ?? '',
      input.title.zh,
      input.title.en ?? null,
      input.title.ja ?? null,
      JSON.stringify(input.tags ?? []),
      userId,
      userId,
      now,
      now,
      cols.body_zh_json,
      cols.body_ja_json,
      cols.evaluations_zh_json,
      cols.evaluations_ja_json,
      cols.body_format,
    ),
    db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(id),
    db.prepare(
      'INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(id, input.title.zh, input.title.en ?? '', input.title.ja ?? '', ftsTextZh, ftsTextJa),
  ];

  input.schools.forEach((schoolKey, i) => {
    stmts.push(db.prepare('INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)').bind(id, schoolKey, 1000 + i));
  });
  (input.scholars ?? []).forEach((scholarKey, i) => {
    stmts.push(db.prepare('INSERT INTO kp_scholar (kp_id, scholar_discipline, scholar_key, position) VALUES (?, ?, ?, ?)').bind(id, tenant.discipline, scholarKey, 1000 + i));
  });

  await db.batch(stmts);
  const record = await getKpRecord(db, id);
  if (!record) return { ok: false, status: 500, reason: 'create_failed' };

  await db.prepare(
    'INSERT INTO knowledge_point_versions (kp_id, tenant_id, version, snapshot_json, edited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, tenant.tenantId, 1, snapshot(record), userId, now).run();

  return { ok: true, record };
}

export async function patchKpRecord(
  db: D1Database,
  kpId: string,
  tenant: { tenantId: string; discipline: string },
  input: KpPatchInput,
  userId: string,
): Promise<{ ok: true; record: KpApiRecord } | { ok: false; status: number; reason: string; detail?: unknown }> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  input = deepStripStrong(input);

  const current = await getKpRecord(db, kpId);
  if (!current) return { ok: false, status: 404, reason: 'kp_not_found' };
  if (current.tenant_id !== tenant.tenantId || current.discipline !== tenant.discipline) {
    return { ok: false, status: 403, reason: 'tenant_mismatch' };
  }

  const currentStructured = await getKpStructured(db, kpId);
  if (!currentStructured) {
    return { ok: false, status: 500, reason: 'kp_structured_missing' };
  }

  // partial-by-language merge — title/body/evaluations 都按语种 shallow merge
  const mergedTitle = {
    zh: input.title?.zh ?? current.title.zh,
    ...(input.title?.ja !== undefined ? { ja: input.title.ja } : current.title.ja !== undefined ? { ja: current.title.ja } : {}),
    ...(input.title?.en !== undefined ? { en: input.title.en } : current.title.en !== undefined ? { en: current.title.en } : {}),
  };

  const mergedBody: { zh: KpBody; ja?: KpBody } = {
    zh: input.body?.zh ?? currentStructured.body.zh,
    ...(input.body?.ja !== undefined
      ? { ja: input.body.ja }
      : currentStructured.body.ja !== undefined
        ? { ja: currentStructured.body.ja }
        : {}),
  };

  const mergedEvaluations: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang } = {
    ...(input.evaluations?.zh !== undefined
      ? { zh: input.evaluations.zh }
      : currentStructured.evaluations.zh
        ? { zh: currentStructured.evaluations.zh }
        : {}),
    ...(input.evaluations?.ja !== undefined
      ? { ja: input.evaluations.ja }
      : currentStructured.evaluations.ja
        ? { ja: currentStructured.evaluations.ja }
        : {}),
  };

  const nextSchools = input.schools ?? current.schools;
  const nextScholars = input.scholars ?? current.scholars;
  const nextTags = input.tags ?? current.tags;
  const nextYear = input.year ?? current.year;

  const refs = await assertRefsBelongToTenant(db, tenant.discipline, nextSchools, nextScholars);
  if (!refs.ok) return { ok: false, status: 422, reason: refs.reason, detail: refs.detail };

  const now = new Date().toISOString();
  const cols = deriveCols({ body: mergedBody, evaluations: mergedEvaluations });
  const ftsTextZh = structuredToSearchText(mergedBody.zh);
  const ftsTextJa = mergedBody.ja ? structuredToSearchText(mergedBody.ja) : '';

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE kp SET
        year = ?, title_zh = ?, title_en = ?, title_ja = ?,
        tags_json = ?, updated_by = ?, updated_at = ?,
        body_zh_json = ?, body_ja_json = ?, evaluations_zh_json = ?, evaluations_ja_json = ?, body_format = ?
       WHERE id = ? AND COALESCE(tenant_id, discipline) = ? AND discipline = ?`,
    ).bind(
      nextYear,
      mergedTitle.zh,
      mergedTitle.en ?? null,
      mergedTitle.ja ?? null,
      JSON.stringify(nextTags),
      userId,
      now,
      cols.body_zh_json,
      cols.body_ja_json,
      cols.evaluations_zh_json,
      cols.evaluations_ja_json,
      cols.body_format,
      kpId,
      tenant.tenantId,
      tenant.discipline,
    ),
    db.prepare('DELETE FROM kp_school WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_scholar WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(kpId),
    db.prepare(
      'INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(kpId, mergedTitle.zh, mergedTitle.en ?? '', mergedTitle.ja ?? '', ftsTextZh, ftsTextJa),
  ];

  nextSchools.forEach((schoolKey, i) => {
    stmts.push(db.prepare('INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)').bind(kpId, schoolKey, 1000 + i));
  });
  nextScholars.forEach((scholarKey, i) => {
    stmts.push(db.prepare('INSERT INTO kp_scholar (kp_id, scholar_discipline, scholar_key, position) VALUES (?, ?, ?, ?)').bind(kpId, tenant.discipline, scholarKey, 1000 + i));
  });

  await db.batch(stmts);
  const record = await getKpRecord(db, kpId);
  if (!record) return { ok: false, status: 500, reason: 'patch_failed' };

  await db.prepare(
    'INSERT INTO knowledge_point_versions (kp_id, tenant_id, version, snapshot_json, edited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(kpId, tenant.tenantId, await nextVersion(db, kpId), snapshot(record), userId, now).run();

  return { ok: true, record };
}

export async function deleteKpRecord(
  db: D1Database,
  kpId: string,
  tenant: { tenantId: string; discipline: string },
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  const current = await getKpRecord(db, kpId);
  if (!current) return { ok: false, status: 404, reason: 'kp_not_found' };
  if (current.tenant_id !== tenant.tenantId || current.discipline !== tenant.discipline) {
    return { ok: false, status: 403, reason: 'tenant_mismatch' };
  }

  const now = new Date().toISOString();
  const version = await nextVersion(db, kpId);
  await db.batch([
    db.prepare(
      'INSERT INTO knowledge_point_versions (kp_id, tenant_id, version, snapshot_json, edited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(kpId, tenant.tenantId, version, snapshot({ ...current, updated_by: userId, updated_at: now }), userId, now),
    db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_school WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_scholar WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp WHERE id = ?').bind(kpId),
  ]);

  return { ok: true };
}

export async function listKpVersions(
  db: D1Database,
  kpId: string,
  tenant: { tenantId: string },
): Promise<KpVersionRecord[]> {
  const rows = await db.prepare(
    `SELECT id, kp_id, tenant_id, version, snapshot_json, edited_by, created_at
     FROM knowledge_point_versions
     WHERE kp_id = ? AND tenant_id = ?
     ORDER BY version DESC`,
  ).bind(kpId, tenant.tenantId).all<KpVersionRow>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    kp_id: row.kp_id,
    tenant_id: row.tenant_id,
    version: row.version,
    snapshot: parseJson<unknown>(row.snapshot_json, null),
    edited_by: row.edited_by,
    created_at: row.created_at,
  }));
}

// Re-export for callers that need to read structured form (e.g., batch store).
export { getKpStructured };
export type { KpRow };
