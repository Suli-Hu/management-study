/**
 * POST /api/account/logout-all
 *
 * v0.7.5 退出所有设备：DELETE 所有 D1 session 行 + 清当前 cookie → 跳 /signin（v0.7.9）。
 *
 * 注意：v0.3.5 后 session 表行只在 cookie-less 路径用（webhook 等），主流
 * 程靠 signed cookie。所以"退出所有设备"主要清 cookie 表行；其他设备的
 * cookie 在 exp 前仍可能继续生效（同 reset 流的 tradeoff）。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import { deleteAllSessionsForUser, buildClearCookie } from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  await deleteAllSessionsForUser(db, locals.user.id);

  const headers = new Headers();
  headers.append('Location', `${reqOrigin}/signin`);
  headers.append('Set-Cookie', buildClearCookie(isSecure));
  headers.append('Set-Cookie', buildFlashCookie({ ok: 'logged_out_all' }, isSecure));
  return new Response(null, { status: 303, headers });
};
