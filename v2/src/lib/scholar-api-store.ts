import type { ScholarCreateInput, ScholarPatchInput } from '~/schemas/scholar-api';
import { deepStripStrong } from './sanitize-strong';
import { generateUniqueKey } from './slugify';

export interface ScholarApiRecord {
  key: string;
  tenant_id: string;
  discipline: string;
  name: { zh: string; en?: string; ja?: string };
  schools: string[];
  contribution: { zh: string; ja?: string };
  institution: string;
  born: string;
  died: string;
  nationality: string;
  flag: string;
  origin: string;
  field: string;
  tags: string[];
  nobel: { year: string; detail: string } | null;
  kpsOrder: string[];
  kp_count: number;
  school_count: number;
  created_at: string;
  updated_at: string;
}

export interface ListScholarsOptions {
  limit: number;
  offset: number;
  q?: string;
  school?: string;
}

interface ScholarRow {
  key: string;
  discipline: string;
  name_zh: string;
  name_en: string | null;
  name_ja: string | null;
  contribution_zh: string;
  contribution_ja: string | null;
  institution: string;
  born: string | null;
  died: string | null;
  nationality: string | null;
  flag: string | null;
  origin: string | null;
  field: string | null;
  tags_json: string;
  nobel_year: string | null;
  nobel_detail: string | null;
  created_at: string;
  updated_at: string;
  kp_count: number;
  school_count: number;
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

async function schoolsForScholar(db: D1Database, discipline: string, scholarKey: string): Promise<string[]> {
  const result = await db
    .prepare('SELECT school_key FROM scholar_school WHERE scholar_discipline = ? AND scholar_key = ? ORDER BY position ASC, school_key ASC')
    .bind(discipline, scholarKey)
    .all<{ school_key: string }>();
  return (result.results ?? []).map((r) => r.school_key);
}

async function kpsForScholar(db: D1Database, discipline: string, scholarKey: string): Promise<string[]> {
  const result = await db
    .prepare('SELECT kp_id FROM kp_scholar WHERE scholar_discipline = ? AND scholar_key = ? ORDER BY position ASC, kp_id ASC')
    .bind(discipline, scholarKey)
    .all<{ kp_id: string }>();
  return (result.results ?? []).map((r) => r.kp_id);
}

async function toRecord(db: D1Database, row: ScholarRow, tenantId: string): Promise<ScholarApiRecord> {
  const [schools, kpsOrder] = await Promise.all([
    schoolsForScholar(db, row.discipline, row.key),
    kpsForScholar(db, row.discipline, row.key),
  ]);
  return {
    key: row.key,
    tenant_id: tenantId,
    discipline: row.discipline,
    name: compactI18n(row.name_zh, row.name_en, row.name_ja),
    schools,
    contribution: { zh: row.contribution_zh, ...(row.contribution_ja ? { ja: row.contribution_ja } : {}) },
    institution: row.institution,
    born: row.born ?? '',
    died: row.died ?? '',
    nationality: row.nationality ?? '',
    flag: row.flag ?? '',
    origin: row.origin ?? '',
    field: row.field ?? '',
    tags: parseJson<string[]>(row.tags_json, []),
    nobel: row.nobel_year || row.nobel_detail ? { year: row.nobel_year ?? '', detail: row.nobel_detail ?? '' } : null,
    kpsOrder,
    kp_count: row.kp_count,
    school_count: row.school_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function baseScholarSelect(): string {
  return `
    SELECT s.*,
      (SELECT COUNT(*) FROM kp_scholar ks WHERE ks.scholar_discipline = s.discipline AND ks.scholar_key = s.key) as kp_count,
      (SELECT COUNT(*) FROM scholar_school ss WHERE ss.scholar_discipline = s.discipline AND ss.scholar_key = s.key) as school_count
    FROM scholar s
  `;
}

export async function listScholarsForTenant(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
  options: ListScholarsOptions,
): Promise<{ items: ScholarApiRecord[]; total: number }> {
  const where = ['s.discipline = ?'];
  const binds: unknown[] = [tenant.discipline];

  const q = options.q?.trim();
  if (q) {
    const like = `%${q}%`;
    where.push('(s.name_zh LIKE ? OR s.name_en LIKE ? OR s.name_ja LIKE ? OR s.contribution_zh LIKE ? OR s.contribution_ja LIKE ?)');
    binds.push(like, like, like, like, like);
  }
  if (options.school) {
    where.push('EXISTS (SELECT 1 FROM scholar_school ss WHERE ss.scholar_discipline = s.discipline AND ss.scholar_key = s.key AND ss.school_key = ?)');
    binds.push(options.school);
  }

  const whereSql = where.join(' AND ');
  const totalRow = await db
    .prepare(`SELECT COUNT(*) as n FROM scholar s WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();
  const result = await db
    .prepare(`${baseScholarSelect()} WHERE ${whereSql} ORDER BY s.name_zh ASC, s.key ASC LIMIT ? OFFSET ?`)
    .bind(...binds, options.limit, options.offset)
    .all<ScholarRow>();
  const items = await Promise.all((result.results ?? []).map((row) => toRecord(db, row, tenant.tenantId)));
  return { items, total: totalRow?.n ?? 0 };
}

export async function getScholarRecord(
  db: D1Database,
  key: string,
  tenant: { tenantId: string; discipline: string },
): Promise<ScholarApiRecord | null> {
  const row = await db
    .prepare(`${baseScholarSelect()} WHERE s.key = ? AND s.discipline = ?`)
    .bind(key, tenant.discipline)
    .first<ScholarRow>();
  return row ? toRecord(db, row, tenant.tenantId) : null;
}

async function assertSchoolsBelongToTenant(
  db: D1Database,
  discipline: string,
  schools: string[],
): Promise<{ ok: true } | { ok: false; reason: string; detail: string[] }> {
  if (schools.length === 0) return { ok: true };
  const placeholders = schools.map(() => '?').join(', ');
  const result = await db
    .prepare(`SELECT key FROM school WHERE discipline = ? AND key IN (${placeholders})`)
    .bind(discipline, ...schools)
    .all<{ key: string }>();
  const found = new Set((result.results ?? []).map((r) => r.key));
  const missing = schools.filter((key) => !found.has(key));
  return missing.length > 0 ? { ok: false, reason: 'school_not_in_tenant', detail: missing } : { ok: true };
}

async function assertKpsBelongToTenant(
  db: D1Database,
  discipline: string,
  kps: string[],
): Promise<{ ok: true } | { ok: false; reason: string; detail: string[] }> {
  if (kps.length === 0) return { ok: true };
  const placeholders = kps.map(() => '?').join(', ');
  const result = await db
    .prepare(`SELECT id FROM kp WHERE discipline = ? AND id IN (${placeholders})`)
    .bind(discipline, ...kps)
    .all<{ id: string }>();
  const found = new Set((result.results ?? []).map((r) => r.id));
  const missing = kps.filter((id) => !found.has(id));
  return missing.length > 0 ? { ok: false, reason: 'kp_not_in_tenant', detail: missing } : { ok: true };
}

function scholarValues(input: { name: { zh: string; en?: string; ja?: string }; contribution: { zh: string; ja?: string }; institution?: string; born?: string; died?: string; nationality?: string; flag?: string; origin?: string; field?: string; tags?: string[]; nobel?: { year: string; detail: string } | null }, key: string, tenant: { discipline: string }, now: string, createdAt: string) {
  return [
    key,
    tenant.discipline,
    input.name.zh,
    input.name.en ?? null,
    input.name.ja ?? null,
    input.contribution.zh,
    input.contribution.ja ?? null,
    input.institution ?? '',
    input.born ?? '',
    input.died ?? '',
    input.nationality ?? '',
    input.flag ?? '',
    input.origin ?? '',
    input.field ?? '',
    '',
    JSON.stringify(input.tags ?? []),
    input.nobel?.year ?? null,
    input.nobel?.detail ?? null,
    createdAt,
    now,
  ];
}

export async function createScholarRecord(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
  input: ScholarCreateInput,
): Promise<{ ok: true; record: ScholarApiRecord } | { ok: false; status: number; reason: string; detail?: unknown }> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  input = deepStripStrong(input);

  // v0.8.9 Q2=A: key 可选 — 不传则从 name.en/name.zh slugify 生成
  let key: string;
  if (input.key) {
    const existing = await db.prepare('SELECT key FROM scholar WHERE discipline = ? AND key = ?').bind(tenant.discipline, input.key).first<{ key: string }>();
    if (existing) return { ok: false, status: 409, reason: 'scholar_key_exists' };
    key = input.key;
  } else {
    key = await generateUniqueKey(
      input.name.en ?? input.name.zh,
      's',
      async (k) => {
        const row = await db.prepare('SELECT key FROM scholar WHERE discipline = ? AND key = ?').bind(tenant.discipline, k).first<{ key: string }>();
        return row !== null;
      },
    );
  }

  const schoolRefs = await assertSchoolsBelongToTenant(db, tenant.discipline, input.schools ?? []);
  if (!schoolRefs.ok) return { ok: false, status: 422, reason: schoolRefs.reason, detail: schoolRefs.detail };
  const kpRefs = await assertKpsBelongToTenant(db, tenant.discipline, input.kpsOrder ?? []);
  if (!kpRefs.ok) return { ok: false, status: 422, reason: kpRefs.reason, detail: kpRefs.detail };

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO scholar (
        key, discipline, name_zh, name_en, name_ja,
        contribution_zh, contribution_ja, institution,
        born, died, nationality, flag, origin, field, accent, tags_json,
        nobel_year, nobel_detail, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(...scholarValues(input, key, tenant, now, now)),
  ];
  input.schools.forEach((schoolKey, position) => {
    stmts.push(db.prepare('INSERT OR IGNORE INTO scholar_school (scholar_discipline, scholar_key, school_key, position) VALUES (?, ?, ?, ?)').bind(tenant.discipline, key, schoolKey, position));
  });
  input.kpsOrder.forEach((kpId, position) => {
    stmts.push(db.prepare('INSERT OR IGNORE INTO kp_scholar (kp_id, scholar_discipline, scholar_key, position) VALUES (?, ?, ?, ?)').bind(kpId, tenant.discipline, key, position));
  });
  await db.batch(stmts);

  const record = await getScholarRecord(db, key, tenant);
  return record ? { ok: true, record } : { ok: false, status: 500, reason: 'create_failed' };
}

export async function patchScholarRecord(
  db: D1Database,
  key: string,
  tenant: { tenantId: string; discipline: string },
  input: ScholarPatchInput,
): Promise<{ ok: true; record: ScholarApiRecord } | { ok: false; status: number; reason: string; detail?: unknown }> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  input = deepStripStrong(input);

  const current = await getScholarRecord(db, key, tenant);
  if (!current) return { ok: false, status: 404, reason: 'scholar_not_found' };
  const next = {
    ...current,
    ...input,
    name: input.name ?? current.name,
    schools: input.schools ?? current.schools,
    contribution: input.contribution ?? current.contribution,
    tags: input.tags ?? current.tags,
    nobel: input.nobel === undefined ? current.nobel : input.nobel,
    kpsOrder: input.kpsOrder ?? current.kpsOrder,
  };

  const schoolRefs = await assertSchoolsBelongToTenant(db, tenant.discipline, next.schools ?? []);
  if (!schoolRefs.ok) return { ok: false, status: 422, reason: schoolRefs.reason, detail: schoolRefs.detail };
  const kpRefs = await assertKpsBelongToTenant(db, tenant.discipline, next.kpsOrder ?? []);
  if (!kpRefs.ok) return { ok: false, status: 422, reason: kpRefs.reason, detail: kpRefs.detail };

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE scholar SET
         name_zh = ?, name_en = ?, name_ja = ?,
         contribution_zh = ?, contribution_ja = ?, institution = ?,
         born = ?, died = ?, nationality = ?, flag = ?, origin = ?, field = ?,
         accent = ?, tags_json = ?, nobel_year = ?, nobel_detail = ?, updated_at = ?
       WHERE key = ? AND discipline = ?`,
    ).bind(
      next.name.zh,
      next.name.en ?? null,
      next.name.ja ?? null,
      next.contribution.zh,
      next.contribution.ja ?? null,
      next.institution ?? '',
      next.born ?? '',
      next.died ?? '',
      next.nationality ?? '',
      next.flag ?? '',
      next.origin ?? '',
      next.field ?? '',
      '',
      JSON.stringify(next.tags ?? []),
      next.nobel?.year ?? null,
      next.nobel?.detail ?? null,
      now,
      key,
      tenant.discipline,
    ),
    db.prepare('DELETE FROM scholar_school WHERE scholar_discipline = ? AND scholar_key = ? AND position < 1000').bind(tenant.discipline, key),
    db.prepare('DELETE FROM kp_scholar WHERE scholar_discipline = ? AND scholar_key = ? AND position < 1000').bind(tenant.discipline, key),
  ];
  next.schools.forEach((schoolKey, position) => {
    stmts.push(db.prepare('INSERT OR IGNORE INTO scholar_school (scholar_discipline, scholar_key, school_key, position) VALUES (?, ?, ?, ?)').bind(tenant.discipline, key, schoolKey, position));
  });
  next.kpsOrder.forEach((kpId, position) => {
    stmts.push(db.prepare('INSERT OR IGNORE INTO kp_scholar (kp_id, scholar_discipline, scholar_key, position) VALUES (?, ?, ?, ?)').bind(kpId, tenant.discipline, key, position));
  });
  await db.batch(stmts);

  const record = await getScholarRecord(db, key, tenant);
  return record ? { ok: true, record } : { ok: false, status: 500, reason: 'patch_failed' };
}

export async function deleteScholarRecord(
  db: D1Database,
  key: string,
  tenant: { tenantId: string; discipline: string },
): Promise<{ ok: true } | { ok: false; status: number; reason: string; detail?: unknown }> {
  const current = await getScholarRecord(db, key, tenant);
  if (!current) return { ok: false, status: 404, reason: 'scholar_not_found' };
  if (current.kp_count > 0) return { ok: false, status: 409, reason: 'scholar_has_kps', detail: current.kp_count };

  await db.batch([
    db.prepare('DELETE FROM kp_scholar WHERE scholar_discipline = ? AND scholar_key = ?').bind(tenant.discipline, key),
    db.prepare('DELETE FROM scholar_school WHERE scholar_discipline = ? AND scholar_key = ?').bind(tenant.discipline, key),
    db.prepare('DELETE FROM scholar WHERE key = ? AND discipline = ?').bind(key, tenant.discipline),
  ]);
  return { ok: true };
}
