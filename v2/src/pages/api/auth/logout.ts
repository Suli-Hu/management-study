/**
 * POST /api/auth/logout
 *   清 cookie + redirect /signin（v0.7.9 改：跳 /signin 而非 /，让真账户
 *   用户 logout 后直接看到账户登录页；演示访客通常不主动 logout，少数
 *   走错的可点 footer "演示访问 →" 回 /login）
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
      Location: `${reqOrigin}/signin`,
      'Set-Cookie': buildClearCookie(isSecure),
    },
  });
};
