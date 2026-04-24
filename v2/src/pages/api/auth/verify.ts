/**
 * GET /api/auth/verify?token=xxx
 *   验证 token → consume → 找/建 user → 建 session → Set-Cookie → redirect /
 *   失败 → redirect /login?error=invalid
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  consumeMagicLink,
  findOrCreateUser,
  buildSignedSessionCookie,
  getSessionSecret,
} from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';

export const GET: APIRoute = async ({ url, request, locals }) => {
  const env = locals.runtime.env;
  // v0.2.9: password 模式下禁用 email flow
  if (env.AUTH_MODE === 'password') {
    return new Response('Email login disabled in password mode', { status: 404 });
  }
  const db = getDb(env);
  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  const token = url.searchParams.get('token');
  if (!token) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${reqOrigin}/login`,
        'Set-Cookie': buildFlashCookie({ error: 'missing_token' }, isSecure),
      },
    });
  }

  const email = await consumeMagicLink(db, token);
  if (!email) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${reqOrigin}/login`,
        'Set-Cookie': buildFlashCookie({ error: 'invalid_or_expired' }, isSecure),
      },
    });
  }

  const user = await findOrCreateUser(db, email);
  const secret = getSessionSecret(env.SESSION_SECRET);
  const cookie = await buildSignedSessionCookie(user, true, secret, isSecure);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${reqOrigin}/`,
      'Set-Cookie': cookie,
    },
  });
};
