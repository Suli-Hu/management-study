import type { ViewCreateInput, ViewPatchInput, ViewReorderInput } from '~/schemas/view-api';
import { schoolIdsFromGroups } from '~/schemas/view-api';

export interface ViewApiRecord {
  id: string;
  tenant_id: string;
  discipline: string;
  name: string;
  jp: string;
  icon: string;
  description: string;
  flow: string;
  scope: 'public';
  kind: 'manual';
  isDefault: boolean;
  position: number;
  groups: Array<{ id: string; title: string; flow: string; schoolIds: string[] }>;
  created_at: string;
  updated_at: string;
}

interface ViewRow {
  id: string;
  discipline: string;
  name: string;
  jp: string;
  icon: string;
  description: string;
  flow: string;
  scope: 'public';
  kind: 'manual';
  is_default: number;
  position: number;
  groups_json: string;
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

function toRecord(row: ViewRow, tenantId: string): ViewApiRecord {
  return {
    id: row.id,
    tenant_id: tenantId,
    discipline: row.discipline,
    name: row.name,
    jp: row.jp,
    icon: row.icon,
    description: row.description,
    flow: row.flow,
    scope: row.scope,
    kind: row.kind,
    isDefault: Boolean(row.is_default),
    position: row.position,
    groups: parseJson(row.groups_json, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listViewsForTenant(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
): Promise<ViewApiRecord[]> {
  const result = await db
    .prepare('SELECT * FROM view WHERE discipline = ? ORDER BY position ASC, id ASC')
    .bind(tenant.discipline)
    .all<ViewRow>();
  return (result.results ?? []).map((row) => toRecord(row, tenant.tenantId));
}

export async function getViewRecord(
  db: D1Database,
  id: string,
  tenant: { tenantId: string; discipline: string },
): Promise<ViewApiRecord | null> {
  const row = await db
    .prepare('SELECT * FROM view WHERE id = ? AND discipline = ?')
    .bind(id, tenant.discipline)
    .first<ViewRow>();
  return row ? toRecord(row, tenant.tenantId) : null;
}

async function assertSchoolsBelongToTenant(
  db: D1Database,
  discipline: string,
  schoolIds: string[],
): Promise<{ ok: true } | { ok: false; reason: string; detail: string[] }> {
  if (schoolIds.length === 0) return { ok: true };
  const placeholders = schoolIds.map(() => '?').join(', ');
  const result = await db
    .prepare(`SELECT key FROM school WHERE discipline = ? AND key IN (${placeholders})`)
    .bind(discipline, ...schoolIds)
    .all<{ key: string }>();
  const found = new Set((result.results ?? []).map((r) => r.key));
  const missing = schoolIds.filter((key) => !found.has(key));
  return missing.length > 0 ? { ok: false, reason: 'school_not_in_tenant', detail: missing } : { ok: true };
}

function viewValues(input: ViewCreateInput | (ViewApiRecord & ViewPatchInput), id: string, tenant: { discipline: string }, now: string, createdAt: string) {
  return [
    id,
    tenant.discipline,
    input.name,
    input.jp ?? '',
    input.icon,
    input.description ?? '',
    input.flow ?? '',
    input.scope,
    input.kind,
    input.isDefault ? 1 : 0,
    input.isDefault ? 0 : input.position,
    JSON.stringify(input.groups ?? []),
    createdAt,
    now,
  ];
}

export async function createViewRecord(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
  input: ViewCreateInput,
): Promise<{ ok: true; record: ViewApiRecord } | { ok: false; status: number; reason: string; detail?: unknown }> {
  const existing = await db
    .prepare('SELECT id FROM view WHERE id = ? AND discipline = ?')
    .bind(input.id, tenant.discipline)
    .first<{ id: string }>();
  if (existing) return { ok: false, status: 409, reason: 'view_id_exists' };

  const refs = await assertSchoolsBelongToTenant(db, tenant.discipline, schoolIdsFromGroups(input.groups));
  if (!refs.ok) return { ok: false, status: 422, reason: refs.reason, detail: refs.detail };

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  if (input.isDefault) {
    stmts.push(db.prepare('UPDATE view SET is_default = 0 WHERE discipline = ?').bind(tenant.discipline));
  }
  stmts.push(
    db.prepare(
      `INSERT INTO view (
        id, discipline, name, jp, icon, description, flow,
        scope, kind, is_default, position, groups_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(...viewValues(input, input.id, tenant, now, now)),
  );
  await db.batch(stmts);

  const record = await getViewRecord(db, input.id, tenant);
  return record ? { ok: true, record } : { ok: false, status: 500, reason: 'create_failed' };
}

export async function patchViewRecord(
  db: D1Database,
  id: string,
  tenant: { tenantId: string; discipline: string },
  input: ViewPatchInput,
): Promise<{ ok: true; record: ViewApiRecord } | { ok: false; status: number; reason: string; detail?: unknown }> {
  const current = await getViewRecord(db, id, tenant);
  if (!current) return { ok: false, status: 404, reason: 'view_not_found' };
  const next = {
    ...current,
    ...input,
    groups: input.groups ?? current.groups,
  };

  const refs = await assertSchoolsBelongToTenant(db, tenant.discipline, schoolIdsFromGroups(next.groups));
  if (!refs.ok) return { ok: false, status: 422, reason: refs.reason, detail: refs.detail };

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  if (next.isDefault) {
    stmts.push(db.prepare('UPDATE view SET is_default = 0 WHERE discipline = ?').bind(tenant.discipline));
  }
  stmts.push(
    db.prepare(
      `UPDATE view SET
         name = ?, jp = ?, icon = ?, description = ?, flow = ?,
         scope = ?, kind = ?, is_default = ?, position = ?, groups_json = ?, updated_at = ?
       WHERE id = ? AND discipline = ?`,
    ).bind(
      next.name,
      next.jp ?? '',
      next.icon,
      next.description ?? '',
      next.flow ?? '',
      next.scope,
      next.kind,
      next.isDefault ? 1 : 0,
      next.isDefault ? 0 : next.position,
      JSON.stringify(next.groups ?? []),
      now,
      id,
      tenant.discipline,
    ),
  );
  await db.batch(stmts);

  const record = await getViewRecord(db, id, tenant);
  return record ? { ok: true, record } : { ok: false, status: 500, reason: 'patch_failed' };
}

export async function deleteViewRecord(
  db: D1Database,
  id: string,
  tenant: { tenantId: string; discipline: string },
): Promise<{ ok: true } | { ok: false; status: number; reason: string; detail?: unknown }> {
  const current = await getViewRecord(db, id, tenant);
  if (!current) return { ok: false, status: 404, reason: 'view_not_found' };
  if (current.isDefault) return { ok: false, status: 409, reason: 'view_is_default' };

  await db.prepare('DELETE FROM view WHERE id = ? AND discipline = ?').bind(id, tenant.discipline).run();
  return { ok: true };
}

export async function reorderViewsForTenant(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
  input: ViewReorderInput,
): Promise<{ ok: true; views: ViewApiRecord[] } | { ok: false; status: number; reason: string; detail?: unknown }> {
  const current = await listViewsForTenant(db, tenant);
  const existing = new Set(current.map((view) => view.id));
  if (existing.size !== input.viewIds.length || input.viewIds.some((id) => !existing.has(id))) {
    return { ok: false, status: 422, reason: 'view_ids_mismatch', detail: current.map((view) => view.id) };
  }

  const defaultViewId = input.defaultViewId ?? current.find((view) => view.isDefault)?.id ?? input.viewIds[0];
  if (!existing.has(defaultViewId)) {
    return { ok: false, status: 422, reason: 'default_view_not_found', detail: defaultViewId };
  }

  await db.batch(input.viewIds.map((id, position) => db
    .prepare('UPDATE view SET position = ?, is_default = ?, updated_at = ? WHERE id = ? AND discipline = ?')
    .bind(position, id === defaultViewId ? 1 : 0, new Date().toISOString(), id, tenant.discipline)));

  return { ok: true, views: await listViewsForTenant(db, tenant) };
}
