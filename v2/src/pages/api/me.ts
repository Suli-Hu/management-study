import type { APIRoute } from 'astro';
import { json, noStore } from '~/lib/api-response';

interface DisciplineRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  tenant_id: string | null;
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return noStore(json(401, { ok: false, reason: 'not_authenticated' }));

  const rows = await locals.runtime.env.DB
    .prepare(`
      SELECT d.key, d.title_zh, d.title_en, t.id as tenant_id
      FROM discipline d
      LEFT JOIN tenant t ON t.discipline_key = d.key
      ORDER BY d.key
    `)
    .all<DisciplineRow>();

  const disciplines = (rows.results ?? [])
    .filter((d) => locals.canRead(d.key))
    .map((d) => {
      const explicitRole = locals.permissions.get(d.key);
      const role =
        locals.isSuperAdmin ? 'super-admin' :
        explicitRole === 'owner' ? 'owner' :
        explicitRole === 'editor' ? 'editor' :
        explicitRole === 'viewer' ? 'viewer' :
        locals.isInviteGuest ? 'invite-viewer' :
        'viewer';

      return {
        key: d.key,
        tenant_id: d.tenant_id ?? d.key,
        title: { zh: d.title_zh, ...(d.title_en ? { en: d.title_en } : {}) },
        role,
        can_read: true,
        can_edit: locals.canEdit(d.key),
      };
    });

  return noStore(json(200, {
    ok: true,
    user: {
      id: locals.user.id,
      email: locals.user.email,
      display_name: locals.user.display_name,
    },
    auth: {
      is_super_admin: locals.isSuperAdmin,
      is_invite_guest: locals.isInviteGuest,
      token_scopes: locals.apiTokenScopes,
    },
    disciplines,
  }));
};
