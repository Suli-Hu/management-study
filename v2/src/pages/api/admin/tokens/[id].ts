/**
 * DELETE /api/admin/tokens/<id>  (v0.5.96)
 * 撤销 token (revoked_at = now，不真删行，保留历史 audit)。
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
  const env = locals.runtime.env;

  const id = params.id;
  if (!id) return json(400, { ok: false, reason: 'bad_request' });

  const row = await env.DB
    .prepare('SELECT id, revoked_at FROM api_token WHERE id = ?')
    .bind(id)
    .first<{ id: string; revoked_at: string | null }>();
  if (!row) return json(404, { ok: false, reason: 'token_not_found' });
  if (row.revoked_at) return json(200, { ok: true, id, revoked_at: row.revoked_at, note: 'already revoked' });

  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE api_token SET revoked_at = ? WHERE id = ?').bind(now, id).run();

  return json(200, { ok: true, id, revoked_at: now });
};
