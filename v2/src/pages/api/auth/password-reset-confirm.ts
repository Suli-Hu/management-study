/**
 * POST /api/auth/password-reset-confirm  (form: token + password + password_confirm)
 *
 * 忘记密码第二步：consume token → 校验密码强度 + 两次输入一致 → hash →
 * UPDATE user.password_hash → DELETE 该 user 所有 D1 session 行（防被盗
 * cookie）→ 写新 session cookie 自动登录 → 跳首页。
 *
 * 安全要点：
 *   - token 只能用一次（consumePasswordReset 会标 used_at）
 *   - 失败的 confirm（token 错 / 密码弱）不消耗 token，可重试
 *   - 重置成功后立即写 session：减少用户回 /login 再输一次密码的摩擦
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  consumePasswordReset,
  updateUserPassword,
  deleteAllSessionsForUser,
  buildSignedSessionCookie,
  getSessionSecret,
} from '~/lib/auth';
import { hashPassword, checkPasswordStrength } from '~/lib/password';
import { buildFlashCookie } from '~/lib/flash';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.AUTH_MODE === 'password') {
    return new Response('Reset disabled in password mode', { status: 404 });
  }
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let token = '';
  let password = '';
  let passwordConfirm = '';

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as {
        token?: string;
        password?: string;
        password_confirm?: string;
      };
      token = (json.token ?? '').trim();
      password = json.password ?? '';
      passwordConfirm = json.password_confirm ?? '';
    } catch (err) {
      console.error('[/api/auth/password-reset-confirm] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      token = String(body.get('token') ?? '').trim();
      password = String(body.get('password') ?? '');
      passwordConfirm = String(body.get('password_confirm') ?? '');
    } catch (err) {
      console.error('[/api/auth/password-reset-confirm] formData parse failed:', err);
    }
  }

  if (!token) {
    // 没 token 直接回 /password-reset
    return redirect303(reqOrigin, '/password-reset', { error: 'missing_token' }, isSecure);
  }

  // 不一致 → 失败但不 consume token
  if (password !== passwordConfirm) {
    return redirectConfirm(reqOrigin, token, 'password_mismatch', isSecure);
  }

  // 强度校验 → 失败但不 consume token
  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return redirectConfirm(reqOrigin, token, `weak_password:${strength.reason}`, isSecure);
  }

  // consume token（一旦走到这一步，token 即被标 used）
  const result = await consumePasswordReset(db, token);
  if (!result.ok) {
    const errKey =
      result.reason === 'expired' ? 'token_expired' :
      result.reason === 'used' ? 'token_used' :
      'token_invalid';
    return redirect303(reqOrigin, '/password-reset', { error: errKey }, isSecure);
  }

  // hash 新密码 + UPDATE user
  const { hash, salt } = await hashPassword(password);
  await updateUserPassword(db, result.userId, hash, salt);

  // 失效该 user 所有现存 session（防被盗 cookie 仍有效）
  await deleteAllSessionsForUser(db, result.userId);

  // 写新 session cookie 自动登录
  const secret = getSessionSecret(env.SESSION_SECRET);
  // 此处 buildSignedSessionCookie 需要 user 的 email —— 我们没单独 SELECT，
  // 但 password_reset.user_id → user 的 email 可以通过 result.userId join 出。
  // 简化：再 SELECT 一次拿 email。
  const userRow = await db
    .prepare('SELECT id, email FROM user WHERE id = ?')
    .bind(result.userId)
    .first<{ id: string; email: string }>();
  if (!userRow) {
    // 极罕见：user 已被删 → 跳 /login（无法登录）
    return redirect303(reqOrigin, '/signin', { error: 'invalid_or_expired' }, isSecure);
  }

  const cookie = await buildSignedSessionCookie(userRow, true, secret, isSecure);
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

/** 失败但 token 未 consume → 跳回 /password-reset/confirm 保留 token 让用户重试 */
function redirectConfirm(
  origin: string,
  token: string,
  errorKey: string,
  isSecure: boolean,
): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${origin}/password-reset/confirm?token=${encodeURIComponent(token)}`,
      'Set-Cookie': buildFlashCookie({ error: errorKey }, isSecure),
    },
  });
}
