import type { SchoolCreateInput, SchoolPatchInput } from '~/schemas/school-api';
import { deepStripStrong } from './sanitize-strong';
import { generateUniqueKey } from './slugify';
import { assertTagsInLibrary } from './tag-library';

export interface SchoolApiRecord {
  key: string;
  tenant_id: string;
  discipline: string;
  title: { zh: string; en?: string; ja?: string };
  era: string;
  summary: { zh: string; ja?: string };
  themeKey: string;
  tags: string[];
  concepts: string[];
  kp_count: number;
  scholar_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface ListSchoolsOptions {
  limit: number;
  offset: number;
  q?: string;
  theme?: string;
}

interface SchoolRow {
  key: string;
  discipline: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  era: string;
  summary_zh: string;
  summary_ja: string | null;
  theme_key: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
  kp_count: number;
  scholar_count: number;
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

async function conceptsForSchool(db: D1Database, schoolKey: string): Promise<string[]> {
  const result = await db
    .prepare('SELECT kp_id FROM kp_school WHERE school_key = ? ORDER BY position ASC, kp_id ASC')
    .bind(schoolKey)
    .all<{ kp_id: string }>();
  return (result.results ?? []).map((r) => r.kp_id);
}

async function viewCountForSchool(db: D1Database, discipline: string, schoolKey: string): Promise<number> {
  const result = await db
    .prepare('SELECT groups_json FROM view WHERE discipline = ?')
    .bind(discipline)
    .all<{ groups_json: string }>();
  let count = 0;
  for (const row of result.results ?? []) {
    const groups = parseJson<Array<{ schoolIds?: string[] }>>(row.groups_json, []);
    if (groups.some((g) => (g.schoolIds ?? []).includes(schoolKey))) count += 1;
  }
  return count;
}

async function toRecord(db: D1Database, row: SchoolRow, tenantId: string): Promise<SchoolApiRecord> {
  const [concepts, viewCount] = await Promise.all([
    conceptsForSchool(db, row.key),
    viewCountForSchool(db, row.discipline, row.key),
  ]);
  return {
    key: row.key,
    tenant_id: tenantId,
    discipline: row.discipline,
    title: compactI18n(row.title_zh, row.title_en, row.title_ja),
    era: row.era,
    summary: { zh: row.summary_zh, ...(row.summary_ja ? { ja: row.summary_ja } : {}) },
    themeKey: row.theme_key,
    tags: parseJson<string[]>(row.tags_json, []),
    concepts,
    kp_count: row.kp_count,
    scholar_count: row.scholar_count,
    view_count: viewCount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function baseSchoolSelect(): string {
  return `
    SELECT s.*,
      (SELECT COUNT(*) FROM kp_school ks WHERE ks.school_key = s.key) as kp_count,
      (SELECT COUNT(*) FROM scholar_school ss WHERE ss.school_key = s.key) as scholar_count
    FROM school s
  `;
}

export async function listSchoolsForTenant(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
  options: ListSchoolsOptions,
): Promise<{ items: SchoolApiRecord[]; total: number }> {
  const where = ['s.discipline = ?'];
  const binds: unknown[] = [tenant.discipline];

  const q = options.q?.trim();
  if (q) {
    const like = `%${q}%`;
    where.push('(s.title_zh LIKE ? OR s.title_en LIKE ? OR s.title_ja LIKE ? OR s.summary_zh LIKE ? OR s.summary_ja LIKE ?)');
    binds.push(like, like, like, like, like);
  }
  if (options.theme) {
    where.push('s.theme_key = ?');
    binds.push(options.theme);
  }

  const whereSql = where.join(' AND ');
  const totalRow = await db
    .prepare(`SELECT COUNT(*) as n FROM school s WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const result = await db
    .prepare(`${baseSchoolSelect()} WHERE ${whereSql} ORDER BY s.title_zh ASC, s.key ASC LIMIT ? OFFSET ?`)
    .bind(...binds, options.limit, options.offset)
    .all<SchoolRow>();
  const items = await Promise.all((result.results ?? []).map((row) => toRecord(db, row, tenant.tenantId)));
  return { items, total: totalRow?.n ?? 0 };
}

export async function getSchoolRecord(
  db: D1Database,
  key: string,
  tenant: { tenantId: string; discipline: string },
): Promise<SchoolApiRecord | null> {
  const row = await db
    .prepare(`${baseSchoolSelect()} WHERE s.key = ? AND s.discipline = ?`)
    .bind(key, tenant.discipline)
    .first<SchoolRow>();
  return row ? toRecord(db, row, tenant.tenantId) : null;
}

async function assertConceptsBelongToTenant(
  db: D1Database,
  discipline: string,
  concepts: string[],
): Promise<{ ok: true } | { ok: false; reason: string; detail: string[] }> {
  if (concepts.length === 0) return { ok: true };
  const placeholders = concepts.map(() => '?').join(', ');
  const result = await db
    .prepare(`SELECT id FROM kp WHERE discipline = ? AND id IN (${placeholders})`)
    .bind(discipline, ...concepts)
    .all<{ id: string }>();
  const found = new Set((result.results ?? []).map((r) => r.id));
  const missing = concepts.filter((id) => !found.has(id));
  return missing.length > 0 ? { ok: false, reason: 'kp_not_in_tenant', detail: missing } : { ok: true };
}

async function assertThemeExists(
  db: D1Database,
  discipline: string,
  themeKey: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT themes_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ themes_json: string }>();
  const themes = parseJson<Array<{ key?: string }>>(row?.themes_json, []);
  return themes.length === 0 || themes.some((t) => t.key === themeKey);
}

function schoolValues(input: { title: { zh: string; en?: string; ja?: string }; era?: string; summary: { zh: string; ja?: string }; themeKey: string; tags?: string[] }, key: string, tenant: { discipline: string }, now: string, createdAt: string) {
  return [
    key,
    tenant.discipline,
    input.title.zh,
    input.title.en ?? null,
    input.title.ja ?? null,
    input.era ?? '',
    input.summary.zh,
    input.summary.ja ?? null,
    input.themeKey,
    '',
    JSON.stringify(input.tags ?? []),
    createdAt,
    now,
  ];
}

export async function createSchoolRecord(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
  input: SchoolCreateInput,
): Promise<{ ok: true; record: SchoolApiRecord } | { ok: false; status: number; reason: string; detail?: unknown }> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  input = deepStripStrong(input);

  // v0.8.9 Q2=A: key 可选 — 不传则 server 端 slugify 生成
  let key: string;
  if (input.key) {
    const existing = await db.prepare('SELECT key FROM school WHERE key = ?').bind(input.key).first<{ key: string }>();
    if (existing) return { ok: false, status: 409, reason: 'school_key_exists' };
    key = input.key;
  } else {
    key = await generateUniqueKey(
      input.title.en ?? input.title.zh,
      'sch',
      async (k) => {
        const row = await db.prepare('SELECT key FROM school WHERE key = ?').bind(k).first<{ key: string }>();
        return row !== null;
      },
    );
  }

  if (!await assertThemeExists(db, tenant.discipline, input.themeKey)) {
    return { ok: false, status: 422, reason: 'theme_not_in_tenant', detail: input.themeKey };
  }
  const refs = await assertConceptsBelongToTenant(db, tenant.discipline, input.concepts ?? []);
  if (!refs.ok) return { ok: false, status: 422, reason: refs.reason, detail: refs.detail };

  // v0.8.37 Phase 3: tags 必须在 discipline.tags 库里
  const tagCheck = await assertTagsInLibrary(db, tenant.discipline, input.tags);
  if (!tagCheck.ok) return { ok: false, status: 422, reason: tagCheck.reason, detail: tagCheck };

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO school (key, discipline, title_zh, title_en, title_ja,
                           era, summary_zh, summary_ja, theme_key, accent,
                           tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(...schoolValues(input, key, tenant, now, now)),
  ];
  input.concepts.forEach((kpId, position) => {
    stmts.push(db.prepare('INSERT OR IGNORE INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)').bind(kpId, key, position));
  });
  await db.batch(stmts);

  const record = await getSchoolRecord(db, key, tenant);
  return record ? { ok: true, record } : { ok: false, status: 500, reason: 'create_failed' };
}

export async function patchSchoolRecord(
  db: D1Database,
  key: string,
  tenant: { tenantId: string; discipline: string },
  input: SchoolPatchInput,
): Promise<{ ok: true; record: SchoolApiRecord } | { ok: false; status: number; reason: string; detail?: unknown }> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  input = deepStripStrong(input);

  const current = await getSchoolRecord(db, key, tenant);
  if (!current) return { ok: false, status: 404, reason: 'school_not_found' };
  const next = {
    ...current,
    ...input,
    title: input.title ?? current.title,
    summary: input.summary ?? current.summary,
    tags: input.tags ?? current.tags,
    concepts: input.concepts ?? current.concepts,
  };

  if (!await assertThemeExists(db, tenant.discipline, next.themeKey)) {
    return { ok: false, status: 422, reason: 'theme_not_in_tenant', detail: next.themeKey };
  }
  const refs = await assertConceptsBelongToTenant(db, tenant.discipline, next.concepts ?? []);
  if (!refs.ok) return { ok: false, status: 422, reason: refs.reason, detail: refs.detail };

  // v0.8.37 Phase 3: tags 必须在 discipline.tags 库里 (仅当 input.tags 显式传时校验)
  if (input.tags !== undefined) {
    const tagCheck = await assertTagsInLibrary(db, tenant.discipline, input.tags);
    if (!tagCheck.ok) return { ok: false, status: 422, reason: tagCheck.reason, detail: tagCheck };
  }

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE school SET
         title_zh = ?, title_en = ?, title_ja = ?, era = ?,
         summary_zh = ?, summary_ja = ?, theme_key = ?, accent = ?,
         tags_json = ?, updated_at = ?
       WHERE key = ? AND discipline = ?`,
    ).bind(
      next.title.zh,
      next.title.en ?? null,
      next.title.ja ?? null,
      next.era ?? '',
      next.summary.zh,
      next.summary.ja ?? null,
      next.themeKey,
      '',
      JSON.stringify(next.tags ?? []),
      now,
      key,
      tenant.discipline,
    ),
    db.prepare('DELETE FROM kp_school WHERE school_key = ? AND position < 1000').bind(key),
  ];
  next.concepts.forEach((kpId, position) => {
    stmts.push(db.prepare('INSERT OR IGNORE INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)').bind(kpId, key, position));
  });
  await db.batch(stmts);

  const record = await getSchoolRecord(db, key, tenant);
  return record ? { ok: true, record } : { ok: false, status: 500, reason: 'patch_failed' };
}

export async function deleteSchoolRecord(
  db: D1Database,
  key: string,
  tenant: { tenantId: string; discipline: string },
): Promise<{ ok: true } | { ok: false; status: number; reason: string; detail?: unknown }> {
  const current = await getSchoolRecord(db, key, tenant);
  if (!current) return { ok: false, status: 404, reason: 'school_not_found' };
  if (current.kp_count > 0) return { ok: false, status: 409, reason: 'school_has_kps', detail: current.kp_count };
  if (current.scholar_count > 0) return { ok: false, status: 409, reason: 'school_has_scholars', detail: current.scholar_count };
  if (current.view_count > 0) return { ok: false, status: 409, reason: 'school_used_in_views', detail: current.view_count };

  await db.batch([
    db.prepare('DELETE FROM kp_school WHERE school_key = ?').bind(key),
    db.prepare('DELETE FROM scholar_school WHERE school_key = ?').bind(key),
    db.prepare('DELETE FROM school WHERE key = ? AND discipline = ?').bind(key, tenant.discipline),
  ]);
  return { ok: true };
}
