/**
 * /api/admin/tokens  (v0.5.96)
 *
 * GET  — 列 token 列表
 *       super-admin 看所有 user 的 token
 *       普通 user 看自己的（暂时只 super-admin 能用此页，所以等价）
 * POST — 创建新 token，返一次性明文 (plaintext)
 *       Body: { name, user_id, scopes: string[], expires_days: number | null }
 *       expires_days null = 永不过期，否则 created + N 天
 *
 * Scope safety:
 *   - scopes=[] means "all permissions this user already has"
 *   - non-super-admin target users cannot receive scopes outside their tenant_member disciplines
 *   - super-admin target users may scope to any existing discipline
 */

import type { APIRoute } from 'astro';
import { generateToken, generateTokenId } from '~/lib/api-token';

interface TokenListRow {
  id: string;
  user_id: string;
  user_email: string;
  name: string;
  scopes_json: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface CreateBody {
  name?: string;
  user_id?: string;
  scopes?: string[];
  expires_days?: number | null;
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

  const rows = await env.DB.prepare(
    `SELECT t.id, t.user_id, u.email as user_email, t.name, t.scopes_json,
            t.created_at, t.expires_at, t.last_used_at, t.revoked_at
       FROM api_token t
       JOIN user u ON u.id = t.user_id
       ORDER BY t.revoked_at IS NULL DESC, t.created_at DESC`,
  ).all<TokenListRow>();

  return json(200, {
    ok: true,
    tokens: (rows.results ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      user_email: r.user_email,
      name: r.name,
      scopes: JSON.parse(r.scopes_json) as string[],
      created_at: r.created_at,
      expires_at: r.expires_at,
      last_used_at: r.last_used_at,
      revoked_at: r.revoked_at,
    })),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.isSuperAdmin) return json(403, { ok: false, reason: 'super_admin_required' });
  const env = locals.runtime.env;

  let body: CreateBody;
  try { body = (await request.json()) as CreateBody; }
  catch { return json(400, { ok: false, reason: 'bad_request', detail: 'invalid json' }); }

  const name = (body.name ?? '').trim();
  const userId = body.user_id;
  const scopes = body.scopes ?? [];
  const expiresDays = body.expires_days;

  if (!name) return json(400, { ok: false, reason: 'bad_request', detail: 'name required' });
  if (!userId) return json(400, { ok: false, reason: 'bad_request', detail: 'user_id required' });
  if (!Array.isArray(scopes)) return json(400, { ok: false, reason: 'bad_request', detail: 'scopes must be array' });

  // 验证 user 存在
  const userRow = await env.DB
    .prepare('SELECT id, email FROM user WHERE id = ?')
    .bind(userId)
    .first<{ id: string; email: string }>();
  if (!userRow) return json(404, { ok: false, reason: 'user_not_found' });

  const superAdminEmails = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  const targetIsSuperAdmin = superAdminEmails.includes(userRow.email.toLowerCase());

  // 验证 scope discipline 都存在
  for (const s of scopes) {
    const disc = await env.DB.prepare('SELECT key FROM discipline WHERE key = ?').bind(s).first();
    if (!disc) return json(400, { ok: false, reason: 'bad_request', detail: `unknown discipline in scope: ${s}` });
  }

  if (!targetIsSuperAdmin && scopes.length > 0) {
    const rows = await env.DB
      .prepare(`
        SELECT t.discipline_key
        FROM tenant_member tm
        INNER JOIN tenant t ON t.id = tm.tenant_id
        WHERE tm.user_id = ?
      `)
      .bind(userId)
      .all<{ discipline_key: string }>();
    const allowed = new Set((rows.results ?? []).map((r) => r.discipline_key));
    const forbidden = scopes.filter((s) => !allowed.has(s));
    if (forbidden.length > 0) {
      return json(403, {
        ok: false,
        reason: 'scope_exceeds_tenant_membership',
        detail: forbidden,
      });
    }
  }

  const { plain, hash } = await generateToken();
  const id = generateTokenId();
  const now = new Date().toISOString();
  const expiresAt = (expiresDays && expiresDays > 0)
    ? new Date(Date.now() + expiresDays * 86400_000).toISOString()
    : null;

  await env.DB.prepare(
    `INSERT INTO api_token (id, user_id, name, token_hash, scopes_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, name, hash, JSON.stringify(scopes), now, expiresAt).run();

  return json(200, {
    ok: true,
    token: plain, // 一次性返明文！
    id,
    user_id: userId,
    user_email: userRow.email,
    name,
    scopes,
    created_at: now,
    expires_at: expiresAt,
  });
};
