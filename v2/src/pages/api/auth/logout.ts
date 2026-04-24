/**
 * POST /api/auth/logout
 *   清 cookie + redirect /（v0.3.5 起 cookie 是 stateless signed，清掉即失效）
 */

import type { APIRoute } from 'astro';
import { buildClearCookie } from '~/lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${reqOrigin}/`,
      'Set-Cookie': buildClearCookie(isSecure),
    },
  });
};
