/**
 * GET /api/auth/verify?token=xxx
 *   验证 token → consume → 找/建 user → 建 session → Set-Cookie → redirect /
 *   失败 → redirect /login?error=invalid
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import { consumeMagicLink, findOrCreateUser, createSession, buildSessionCookie } from '~/lib/auth';

export const GET: APIRoute = async ({ url, request, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  // Secure cookie 只在 HTTPS 下有意义；localhost 不能带 Secure 否则 cookie 不 set
  const isSecure = reqUrl.protocol === 'https:';

  const token = url.searchParams.get('token');
  if (!token) {
    return Response.redirect(`${reqOrigin}/login?error=missing_token`, 302);
  }

  const email = await consumeMagicLink(db, token);
  if (!email) {
    return Response.redirect(`${reqOrigin}/login?error=invalid_or_expired`, 302);
  }

  const user = await findOrCreateUser(db, email);
  const sessionId = await createSession(db, user.id);
  const cookie = buildSessionCookie(sessionId, isSecure);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${reqOrigin}/`,
      'Set-Cookie': cookie,
    },
  });
};
