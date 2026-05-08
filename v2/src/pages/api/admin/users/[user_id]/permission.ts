/**
 * POST /api/admin/users/<user_id>/permission  (v0.5.95)
 *
 * 修改某 user 的某 discipline 权限。super-admin only。
 *
 * Body:
 *   { discipline: string, role: 'admin' | 'guest' | null }
 *   role=null → DELETE 该 row（user 在该 discipline 完全无权）
 *
 * Response:
 *   200 { ok: true, user_id, discipline, role }
 *   403 not_admin / super_admin_required / cannot_modify_super_admin
 *   404 user_not_found / discipline_not_found
 */

import type { APIRoute } from 'astro';

interface ReqBody {
  discipline?: string;
  role?: 'admin' | 'guest' | null;
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });

  const userId = params.user_id;
  if (!userId) return json(400, { ok: false, reason: 'bad_request', detail: 'user_id required' });

  let body: ReqBody;
  try { body = (await request.json()) as ReqBody; }
  catch { return json(400, { ok: false, reason: 'bad_request', detail: 'invalid json body' }); }

  if (!body.discipline) return json(400, { ok: false, reason: 'bad_request', detail: 'discipline required' });
  if (body.role !== undefined && body.role !== null && body.role !== 'admin' && body.role !== 'guest') {
    return json(400, { ok: false, reason: 'bad_request', detail: `invalid role: ${body.role}` });
  }

  const env = locals.runtime.env;

  // 验证 user 存在 + 不是 super-admin
  const target = await env.DB
    .prepare('SELECT id, email FROM user WHERE id = ?')
    .bind(userId)
    .first<{ id: string; email: string }>();
  if (!target) return json(404, { ok: false, reason: 'user_not_found' });

  const superAdminEmails = (env.ADMIN_EMAILS ?? '')
    .split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  if (superAdminEmails.includes(target.email.toLowerCase())) {
    return json(403, { ok: false, reason: 'cannot_modify_super_admin', detail: 'super-admin 权限由 ADMIN_EMAILS env 决定，不可改' });
  }

  // 验证 discipline 存在
  const disc = await env.DB
    .prepare('SELECT key FROM discipline WHERE key = ?')
    .bind(body.discipline)
    .first<{ key: string }>();
  if (!disc) return json(404, { ok: false, reason: 'discipline_not_found', detail: body.discipline });

  // API-first migration: ensure every discipline has a tenant row before writing membership.
  await env.DB.prepare(
    `INSERT INTO tenant (id, discipline_key, title_zh, title_en, title_ja, created_at, updated_at)
     SELECT key, key, title_zh, title_en, title_ja, created_at, updated_at
     FROM discipline
     WHERE key = ?
     ON CONFLICT(id) DO NOTHING`,
  ).bind(body.discipline).run();

  // role=null → DELETE
  if (body.role === null || body.role === undefined) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM tenant_member WHERE user_id = ? AND tenant_id = ?').bind(userId, body.discipline),
    ]);
    return json(200, { ok: true, user_id: userId, discipline: body.discipline, role: null });
  }

  // UPSERT
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO tenant_member (tenant_id, user_id, role, created_at, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, user_id) DO UPDATE SET
       role = excluded.role,
       created_at = excluded.created_at,
       created_by = excluded.created_by`,
  ).bind(
    body.discipline,
    userId,
    body.role === 'admin' ? 'editor' : 'viewer',
    now,
    locals.user.email,
  ).run();

  return json(200, { ok: true, user_id: userId, discipline: body.discipline, role: body.role });
};
