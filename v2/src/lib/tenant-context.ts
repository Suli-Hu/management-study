import type { APIContext } from 'astro';

export type TenantRole = 'owner' | 'editor' | 'viewer';

export interface TenantContext {
  tenantId: string;
  discipline: string;
  role: TenantRole | 'super-admin' | 'invite-viewer';
}

type Access = 'read' | 'write';

export function requestedDiscipline(context: APIContext): string | null {
  const url = new URL(context.request.url);
  return (
    url.searchParams.get('discipline') ||
    context.request.headers.get('x-discipline-key') ||
    null
  );
}

export async function resolveTenantContext(
  context: APIContext,
  access: Access,
): Promise<{ ok: true; tenant: TenantContext } | { ok: false; status: number; reason: string }> {
  const { locals } = context;
  if (!locals.user) return { ok: false, status: 401, reason: 'not_authenticated' };

  const db = locals.runtime.env.DB;
  const requested = requestedDiscipline(context);
  const requiredRole = access === 'write' ? ['owner', 'editor'] : ['owner', 'editor', 'viewer'];

  if (requested) {
    const row = await db
      .prepare('SELECT id, discipline_key FROM tenant WHERE discipline_key = ? OR id = ?')
      .bind(requested, requested)
      .first<{ id: string; discipline_key: string }>();
    if (!row) return { ok: false, status: 404, reason: 'tenant_not_found' };

    if (locals.isSuperAdmin) {
      const allowedByTokenScope = access === 'write'
        ? locals.canEdit(row.discipline_key)
        : locals.canRead(row.discipline_key);
      if (!allowedByTokenScope) {
        return { ok: false, status: 403, reason: access === 'write' ? 'not_editor' : 'not_viewer' };
      }
      return { ok: true, tenant: { tenantId: row.id, discipline: row.discipline_key, role: 'super-admin' } };
    }

    const member = await db
      .prepare('SELECT role FROM tenant_member WHERE tenant_id = ? AND user_id = ?')
      .bind(row.id, locals.user.id)
      .first<{ role: TenantRole }>();
    if (member && requiredRole.includes(member.role)) {
      return { ok: true, tenant: { tenantId: row.id, discipline: row.discipline_key, role: member.role } };
    }

    return { ok: false, status: 403, reason: access === 'write' ? 'not_editor' : 'not_viewer' };
  }

  if (locals.isSuperAdmin) {
    return { ok: false, status: 400, reason: 'discipline_required_for_super_admin' };
  }

  const memberships = await db
    .prepare(`
      SELECT t.id, t.discipline_key, tm.role
      FROM tenant_member tm
      INNER JOIN tenant t ON t.id = tm.tenant_id
      WHERE tm.user_id = ?
        AND tm.role IN (${requiredRole.map(() => '?').join(', ')})
      ORDER BY t.discipline_key
    `)
    .bind(locals.user.id, ...requiredRole)
    .all<{ id: string; discipline_key: string; role: TenantRole }>();

  const rows = memberships.results ?? [];
  if (rows.length === 1) {
    const row = rows[0];
    return { ok: true, tenant: { tenantId: row.id, discipline: row.discipline_key, role: row.role } };
  }
  if (rows.length > 1) return { ok: false, status: 400, reason: 'discipline_required_for_multi_tenant_user' };

  return { ok: false, status: 403, reason: access === 'write' ? 'not_editor' : 'not_viewer' };
}

export async function tenantForExistingKp(
  context: APIContext,
  kpId: string,
  access: Access,
): Promise<{ ok: true; tenant: TenantContext } | { ok: false; status: number; reason: string }> {
  const db = context.locals.runtime.env.DB;
  const row = await db
    .prepare('SELECT id, discipline, COALESCE(tenant_id, discipline) as tenant_id FROM kp WHERE id = ? AND deleted_at IS NULL')
    .bind(kpId)
    .first<{ id: string; discipline: string; tenant_id: string }>();
  if (!row) return { ok: false, status: 404, reason: 'kp_not_found' };

  const url = new URL(context.request.url);
  url.searchParams.set('discipline', row.discipline);
  const request = new Request(url.toString(), context.request);
  return resolveTenantContext({ ...context, request }, access);
}
