/**
 * GET /api/admin/users  (v0.5.95)
 *
 * 列出所有 user + 各自 per-discipline 权限。super-admin only。
 *
 * Response:
 *   {
 *     ok: true,
 *     users: [{ id, email, display_name, created_at, email_verified_at, permissions: {keiei:'admin',marketing:'guest',...} }],
 *     disciplines: [{ key, title_zh }],
 *     super_admin_emails: ['husuli0623@gmail.com'],
 *   }
 */

import type { APIRoute } from 'astro';

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  email_verified_at: string | null;
}
interface PermRow {
  user_id: string;
  discipline_key: string;
  role: 'owner' | 'editor' | 'viewer';
}
interface DisciplineRow {
  key: string;
  title_zh: string;
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });
  const env = locals.runtime.env;

  const usersRes = await env.DB.prepare(
    `SELECT id, email, display_name, created_at, email_verified_at
     FROM user
     ORDER BY created_at DESC`,
  ).all<UserRow>();

  const permsRes = await env.DB.prepare(
    `SELECT tm.user_id, t.discipline_key, tm.role
       FROM tenant_member tm
       INNER JOIN tenant t ON t.id = tm.tenant_id`,
  ).all<PermRow>();

  const discRes = await env.DB.prepare(
    `SELECT key, title_zh FROM discipline ORDER BY key`,
  ).all<DisciplineRow>();

  const permsByUser = new Map<string, Record<string, 'owner' | 'editor' | 'viewer'>>();
  for (const p of permsRes.results ?? []) {
    if (!permsByUser.has(p.user_id)) permsByUser.set(p.user_id, {});
    permsByUser.get(p.user_id)![p.discipline_key] = p.role;
  }

  const superAdminEmails = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);

  return json(200, {
    ok: true,
    users: (usersRes.results ?? []).map((u) => ({
      ...u,
      permissions: permsByUser.get(u.id) ?? {},
      is_super_admin: superAdminEmails.includes(u.email.toLowerCase()),
    })),
    disciplines: discRes.results ?? [],
    super_admin_emails: superAdminEmails,
  });
};
