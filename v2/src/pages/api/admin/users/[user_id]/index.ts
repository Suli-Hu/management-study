/**
 * DELETE /api/admin/users/<user_id>  (v0.7.7)
 *
 * super-admin only。彻底删除一个 user 行（FK CASCADE 自动清 user_permission /
 * tenant_member / session / user_progress / user_note / study_session /
 * pending_signup / pending_email_change / password_reset 等所有关联）。
 *
 * 防御：
 *   - 不是 super-admin → 403
 *   - target 是 super-admin（ADMIN_EMAILS 命中）→ 403（super-admin 由 env 决定，
 *     代码层不能跨过 env 删除）
 *   - target == 当前 super-admin 自己 → 403（防自杀）
 *
 * Response:
 *   200 { ok: true, user_id, email }
 *   403 not_admin / super_admin_required / cannot_delete_super_admin / cannot_delete_self
 *   404 user_not_found
 */

import type { APIRoute } from 'astro';

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });

  const userId = params.user_id;
  if (!userId) return json(400, { ok: false, reason: 'bad_request', detail: 'user_id required' });

  const env = locals.runtime.env;

  const target = await env.DB
    .prepare('SELECT id, email FROM user WHERE id = ?')
    .bind(userId)
    .first<{ id: string; email: string }>();
  if (!target) return json(404, { ok: false, reason: 'user_not_found' });

  // 防自杀
  if (target.id === locals.user.id) {
    return json(403, { ok: false, reason: 'cannot_delete_self', detail: '不能删除自己。如要注销，去 /settings/account。' });
  }

  // 防删 super-admin（ADMIN_EMAILS env 命中的 user）
  const superAdminEmails = (env.ADMIN_EMAILS ?? '')
    .split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  if (superAdminEmails.includes(target.email.toLowerCase())) {
    return json(403, {
      ok: false,
      reason: 'cannot_delete_super_admin',
      detail: 'super-admin 由 ADMIN_EMAILS env 决定。要删先改 wrangler.toml。',
    });
  }

  // CASCADE 删（FK 配置在 migrations 中）
  await env.DB
    .prepare('DELETE FROM user WHERE id = ?')
    .bind(userId)
    .run();

  return json(200, { ok: true, user_id: userId, email: target.email });
};
