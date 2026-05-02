/**
 * POST /api/auth/signup-verify  (form: email + code)
 *
 * 注册流第二步：校验 6 位 code → promote pending_signup 行到 user 表 →
 * 删 pending_signup → 写 session cookie → 跳首页。
 *
 * 错误 → 跳 /signup/sent + flash:
 *   wrong_code           code 不对（仍可重试）
 *   wrong_code_locked    达 5 次失败上限 → 整个 pending_signup 锁定（要重新 signup）
 *   expired              30 分钟过期
 *   not_found            pending_signup 行不存在（异常 / 直接访问端点）
 *
 * 注意：promote 之前再 check 一次 user 表，防 race（极罕见，但 0.3.2 A1
 * 教训说"INSERT 之前 SELECT" 不安全）。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  consumePendingSignupByCode,
  deletePendingSignup,
  createSignupUser,
  findUserByEmail,
  buildSignedSessionCookie,
  getSessionSecret,
} from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.AUTH_MODE === 'password') {
    return new Response('Signup disabled in password mode', { status: 404 });
  }
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let email = '';
  let code = '';
  // 按 content-type 路由（同 signup.ts 注释）
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as { email?: string; code?: string };
      email = (json.email ?? '').trim().toLowerCase();
      code = (json.code ?? '').trim();
    } catch (err) {
      console.error('[/api/auth/signup-verify] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      email = String(body.get('email') ?? '').trim().toLowerCase();
      code = String(body.get('code') ?? '').trim();
    } catch (err) {
      console.error('[/api/auth/signup-verify] formData parse failed:', err);
    }
  }

  if (!email || !code) {
    return redirect303(reqOrigin, '/signup', { error: 'missing_code' }, isSecure);
  }

  const result = await consumePendingSignupByCode(db, email, code);
  if (!result.ok) {
    const errorKey =
      result.reason === 'locked' ? 'wrong_code_locked' :
      result.reason === 'expired' ? 'expired' :
      result.reason === 'not_found' ? 'not_found' :
      'wrong_code';
    return redirect303(reqOrigin, '/signup/sent', { email, error: errorKey }, isSecure);
  }

  const { row } = result;

  // race 二次防御：promote 前再 check user 表（A1 教训）
  const existing = await findUserByEmail(db, row.email);
  if (existing) {
    // 极罕见：pending_signup 写入后、verify 期间 user 已被并发流程创建。
    // 视为成功"注册"，但不重新 hash —— 继续登录已有 user。
    await deletePendingSignup(db, row.email);
    const secret = getSessionSecret(env.SESSION_SECRET);
    const cookie = await buildSignedSessionCookie(existing, true, secret, isSecure);
    return new Response(null, {
      status: 303,
      headers: { Location: `${reqOrigin}/`, 'Set-Cookie': cookie },
    });
  }

  // promote
  const user = await createSignupUser(db, {
    email: row.email,
    passwordHash: row.password_hash,
    salt: row.salt,
    displayName: row.display_name,
  });
  await deletePendingSignup(db, row.email);

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

function redirect303(
  origin: string,
  path: string,
  flash: Record<string, string>,
  isSecure: boolean,
): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${origin}${path}`,
      'Set-Cookie': buildFlashCookie(flash, isSecure),
    },
  });
}
