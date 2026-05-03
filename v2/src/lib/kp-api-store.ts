import type { KpCreateInput, KpPatchInput } from '~/schemas/kp-api';
import { parseBody } from './body-parser';
import { parsedToStructured, evalContentToEvaluations } from './kp-body-helpers';

/**
 * v0.8.0 Stage 1 双写 helper：从旧 string body + format + evalContent 派生 5 个新列字段。
 * 所有 API-first 写入路径（create / patch / batch）共用，保证双写完整性。
 */
function deriveStructuredColumns(input: {
  body: { zh: string; ja?: string | null };
  format: string;
  evalContent?: { zh?: Record<string, string>; ja?: Record<string, string> };
}): {
  body_zh_json: string;
  body_ja_json: string | null;
  evaluations_zh_json: string;
  evaluations_ja_json: string | null;
  body_format: string;
} {
  const fmt = (input.format ?? 'narrative') as Parameters<typeof parseBody>[1];
  const parsedZh = parseBody(input.body.zh, fmt);
  const parsedJa = input.body.ja ? parseBody(input.body.ja, fmt) : null;
  const structuredZh = parsedToStructured(parsedZh);
  const structuredJa = parsedJa ? parsedToStructured(parsedJa) : null;

  const evalsZh = input.evalContent?.zh && Object.keys(input.evalContent.zh).length > 0
    ? evalContentToEvaluations(input.evalContent.zh)
    : { meaning: '', limit: '', example: '', response: '', application: '', analogy: '' };
  const evalsJa = input.evalContent?.ja && Object.keys(input.evalContent.ja).length > 0
    ? evalContentToEvaluations(input.evalContent.ja)
    : null;

  return {
    body_zh_json: JSON.stringify(structuredZh),
    body_ja_json: structuredJa ? JSON.stringify(structuredJa) : null,
    evaluations_zh_json: JSON.stringify(evalsZh),
    evaluations_ja_json: evalsJa ? JSON.stringify(evalsJa) : null,
    body_format: fmt,
  };
}

export interface KpApiRecord {
  id: string;
  tenant_id: string;
  discipline: string;
  year: string;
  title: { zh: string; en?: string; ja?: string };
  body: { zh: string; ja?: string };
  tags: string[];
  format: string;
  schools: string[];
  scholars: string[];
  evalContent?: {
    zh?: Record<string, string>;
    ja?: Record<string, string>;
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
  body_zh: string;
  body_ja: string | null;
  tags_json: string;
  format: string;
  eval_content_zh_json?: string | null;
  eval_content_ja_json?: string | null;
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
  const evalZh = parseJson<Record<string, string>>(row.eval_content_zh_json, {});
  const evalJa = parseJson<Record<string, string>>(row.eval_content_ja_json, {});
  const evalContent =
    Object.keys(evalZh).length || Object.keys(evalJa).length
      ? { ...(Object.keys(evalZh).length ? { zh: evalZh } : {}), ...(Object.keys(evalJa).length ? { ja: evalJa } : {}) }
      : undefined;

  return {
    id: row.id,
    tenant_id: row.tenant_id ?? row.discipline,
    discipline: row.discipline,
    year: row.year,
    title: compactI18n(row.title_zh, row.title_en, row.title_ja),
    body: { zh: row.body_zh, ...(row.body_ja ? { ja: row.body_ja } : {}) },
    tags: parseJson<string[]>(row.tags_json, []),
    format: row.format,
    schools: refs.schools,
    scholars: refs.scholars,
    evalContent,
    created_by: row.created_by ?? null,
    updated_by: row.updated_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
    where.push('(k.title_zh LIKE ? OR k.title_en LIKE ? OR k.title_ja LIKE ? OR k.body_zh LIKE ? OR k.body_ja LIKE ?)');
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
  const id = input.id ?? generatedKpId(tenant.discipline);
  const existing = await db.prepare('SELECT id FROM kp WHERE id = ?').bind(id).first<{ id: string }>();
  if (existing) return { ok: false, status: 409, reason: 'kp_id_exists' };

  const refs = await assertRefsBelongToTenant(db, tenant.discipline, input.schools, input.scholars ?? []);
  if (!refs.ok) return { ok: false, status: 422, reason: refs.reason, detail: refs.detail };

  const now = new Date().toISOString();
  // v0.8.0 Stage 1 双写：派生 5 个新列字段
  const structured = deriveStructuredColumns({
    body: input.body,
    format: input.format ?? 'narrative',
    evalContent: input.evalContent,
  });
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO kp (
        id, tenant_id, discipline, year, title_zh, title_en, title_ja,
        body_zh, body_ja, tags_json, eval_content_zh_json, eval_content_ja_json,
        format, created_by, updated_by, created_at, updated_at,
        body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json, body_format
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      tenant.tenantId,
      tenant.discipline,
      input.year ?? '',
      input.title.zh,
      input.title.en ?? null,
      input.title.ja ?? null,
      input.body.zh,
      input.body.ja ?? null,
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.evalContent?.zh ?? {}),
      JSON.stringify(input.evalContent?.ja ?? {}),
      input.format ?? 'narrative',
      userId,
      userId,
      now,
      now,
      // v0.8.0 Stage 1 新列
      structured.body_zh_json,
      structured.body_ja_json,
      structured.evaluations_zh_json,
      structured.evaluations_ja_json,
      structured.body_format,
    ),
    db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(id),
    db.prepare(
      'INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(id, input.title.zh, input.title.en ?? '', input.title.ja ?? '', input.body.zh, input.body.ja ?? ''),
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
  const current = await getKpRecord(db, kpId);
  if (!current) return { ok: false, status: 404, reason: 'kp_not_found' };
  if (current.tenant_id !== tenant.tenantId || current.discipline !== tenant.discipline) {
    return { ok: false, status: 403, reason: 'tenant_mismatch' };
  }

  const next = {
    ...current,
    ...input,
    title: input.title ?? current.title,
    body: input.body ?? current.body,
    schools: input.schools ?? current.schools,
    scholars: input.scholars ?? current.scholars,
    tags: input.tags ?? current.tags,
    evalContent: input.evalContent ?? current.evalContent,
  };

  const refs = await assertRefsBelongToTenant(db, tenant.discipline, next.schools, next.scholars);
  if (!refs.ok) return { ok: false, status: 422, reason: refs.reason, detail: refs.detail };

  const now = new Date().toISOString();
  // v0.8.0 Stage 1 双写：派生 5 个新列字段
  const structured = deriveStructuredColumns({
    body: next.body,
    format: next.format,
    evalContent: next.evalContent,
  });
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE kp SET
        year = ?, title_zh = ?, title_en = ?, title_ja = ?,
        body_zh = ?, body_ja = ?, tags_json = ?,
        eval_content_zh_json = ?, eval_content_ja_json = ?,
        format = ?, updated_by = ?, updated_at = ?,
        body_zh_json = ?, body_ja_json = ?, evaluations_zh_json = ?, evaluations_ja_json = ?, body_format = ?
       WHERE id = ? AND COALESCE(tenant_id, discipline) = ? AND discipline = ?`,
    ).bind(
      next.year ?? '',
      next.title.zh,
      next.title.en ?? null,
      next.title.ja ?? null,
      next.body.zh,
      next.body.ja ?? null,
      JSON.stringify(next.tags ?? []),
      JSON.stringify(next.evalContent?.zh ?? {}),
      JSON.stringify(next.evalContent?.ja ?? {}),
      next.format,
      userId,
      now,
      // v0.8.0 Stage 1 新列
      structured.body_zh_json,
      structured.body_ja_json,
      structured.evaluations_zh_json,
      structured.evaluations_ja_json,
      structured.body_format,
      kpId,
      tenant.tenantId,
      tenant.discipline,
    ),
    db.prepare('DELETE FROM kp_school WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_scholar WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(kpId),
    db.prepare(
      'INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(kpId, next.title.zh, next.title.en ?? '', next.title.ja ?? '', next.body.zh, next.body.ja ?? ''),
  ];

  next.schools.forEach((schoolKey, i) => {
    stmts.push(db.prepare('INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)').bind(kpId, schoolKey, 1000 + i));
  });
  next.scholars.forEach((scholarKey, i) => {
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
