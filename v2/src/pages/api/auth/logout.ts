/**
 * POST /api/auth/logout
 *   删 session row + 清 cookie + redirect /
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import { parseCookieSession, deleteSession, buildClearCookie } from '~/lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  const sessionId = parseCookieSession(request.headers.get('cookie'));
  if (sessionId) {
    await deleteSession(db, sessionId);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${reqOrigin}/`,
      'Set-Cookie': buildClearCookie(isSecure),
    },
  });
};
