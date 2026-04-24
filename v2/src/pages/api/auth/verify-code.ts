/**
 * POST /api/auth/verify-code  (form: email + code)
 *   跨设备 code 登录：电脑端发起 → 手机收邮件 → 电脑端输 6 位 code → 电脑登录
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  consumeMagicLinkByCode,
  findOrCreateUser,
  buildSignedSessionCookie,
  getSessionSecret,
} from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  // v0.2.9: password 模式下禁用 email flow
  if (env.AUTH_MODE === 'password') {
    return new Response('Email login disabled in password mode', { status: 404 });
  }
  const db = getDb(env);
  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let email = '';
  let code = '';
  try {
    const body = await request.formData();
    email = String(body.get('email') ?? '').trim().toLowerCase();
    code = String(body.get('code') ?? '').trim();
  } catch (err) {
    console.error('[/api/auth/verify-code] formData parse failed:', err);
  }
  if (!email || !code) {
    try {
      const json = (await request.json()) as { email?: string; code?: string };
      email = (json.email ?? '').trim().toLowerCase();
      code = (json.code ?? '').trim();
    } catch (err) {
      console.error('[/api/auth/verify-code] json parse failed:', err);
    }
  }

  if (!email || !code) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${reqOrigin}/login`,
        'Set-Cookie': buildFlashCookie({ error: 'missing_code' }, isSecure),
      },
    });
  }

  const verifiedEmail = await consumeMagicLinkByCode(db, email, code);
  if (!verifiedEmail) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${reqOrigin}/login/sent`,
        'Set-Cookie': buildFlashCookie({ email, error: 'invalid_code' }, isSecure),
      },
    });
  }

  const user = await findOrCreateUser(db, verifiedEmail);
  const secret = getSessionSecret(env.SESSION_SECRET);
  const cookie = await buildSignedSessionCookie(user, true, secret, isSecure);

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${reqOrigin}/`,
      'Set-Cookie': cookie,
    },
  });
};
