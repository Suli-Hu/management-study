/**
 * POST /api/auth/password  (form: password)
 *   v0.2.9 考试期简化登录：
 *     password === env.ADMIN_PASSWORD → admin（用 email=ADMIN_EMAILS 第一条建 user）
 *     password === env.GUEST_PASSWORD → guest（共用 env.GUEST_EMAIL）
 *     else → 303 /login?error=bad_password
 *
 *   仅当 env.AUTH_MODE === 'password' 时响应；email 模式下直接 404。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  findOrCreateUser,
  buildSignedSessionCookie,
  getSessionSecret,
  getPrimaryAdminEmail,
  timingSafeEqual,
} from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.AUTH_MODE !== 'password') {
    return new Response('Not Found', { status: 404 });
  }

  const db = getDb(env);
  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let password = '';
  let remember = true;
  try {
    const body = await request.formData();
    password = String(body.get('password') ?? '').trim();
    // checkbox：未勾选时根本不在 FormData 里；勾选时值通常 "1" / "on"
    remember = body.get('remember') !== null;
  } catch (err) {
    console.error('[/api/auth/password] formData parse failed:', err);
  }
  if (!password) {
    try {
      const json = (await request.json()) as { password?: string; remember?: boolean };
      password = (json.password ?? '').trim();
      if (typeof json.remember === 'boolean') remember = json.remember;
    } catch (err) {
      console.error('[/api/auth/password] json parse failed:', err);
    }
  }

  const badPasswordResponse = () =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${reqOrigin}/login`,
        'Set-Cookie': buildFlashCookie({ error: 'bad_password' }, isSecure),
      },
    });

  if (!password) return badPasswordResponse();

  // timing-safe 比对，避免早期 bail 泄漏长度差异
  const adminPwd = env.ADMIN_PASSWORD ?? '';
  const guestPwd = env.GUEST_PASSWORD ?? '';
  const isAdminPwd = adminPwd.length > 0 && timingSafeEqual(password, adminPwd);
  const isGuestPwd = guestPwd.length > 0 && timingSafeEqual(password, guestPwd);

  let email: string;
  if (isAdminPwd) {
    email = getPrimaryAdminEmail(env.ADMIN_EMAILS) ?? 'admin@local';
  } else if (isGuestPwd) {
    email = env.GUEST_EMAIL ?? 'guest@local';
  } else {
    return badPasswordResponse();
  }

  const user = await findOrCreateUser(db, email);
  const secret = getSessionSecret(env.SESSION_SECRET);
  const cookie = await buildSignedSessionCookie(user, remember, secret, isSecure);

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${reqOrigin}/`,
      'Set-Cookie': cookie,
    },
  });
};
