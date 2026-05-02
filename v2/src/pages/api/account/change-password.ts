/**
 * POST /api/account/change-password  (form: current_password, password, password_confirm)
 *
 * v0.7.5 改密码 —— 必须输旧密码确认（防 cookie 被盗后改密锁住账户）。
 *
 * 流程：
 *   1. 必须登录
 *   2. 校验旧密码（用 verifyPassword）
 *   3. 校验新密码强度 + 两次输入一致
 *   4. UPDATE password_hash + DELETE 所有 session 行（同 reset 流，防被盗）
 *   5. 不自动登录（cookie 仍是改密前的，已通过 cookie sig 验证；需要重新登录）
 *
 * 注意：cookie 仍可继续使用直到 exp，但 session 表行已删——下次签发的
 * cookie 不会受影响。这里"删 session 行"主要清理 v0.3.5 之前老式 session
 * 表的残留。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  findUserAuthByEmail,
  updateUserPassword,
  deleteAllSessionsForUser,
} from '~/lib/auth';
import {
  hashPassword,
  verifyPassword,
  checkPasswordStrength,
} from '~/lib/password';
import { buildFlashCookie } from '~/lib/flash';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let currentPassword = '';
  let password = '';
  let passwordConfirm = '';

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as {
        current_password?: string;
        password?: string;
        password_confirm?: string;
      };
      currentPassword = json.current_password ?? '';
      password = json.password ?? '';
      passwordConfirm = json.password_confirm ?? '';
    } catch (err) {
      console.error('[/api/account/change-password] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      currentPassword = String(body.get('current_password') ?? '');
      password = String(body.get('password') ?? '');
      passwordConfirm = String(body.get('password_confirm') ?? '');
    } catch (err) {
      console.error('[/api/account/change-password] formData parse failed:', err);
    }
  }

  if (!currentPassword) {
    return redirect303(reqOrigin, { error: 'missing_current_password' }, isSecure);
  }
  if (password !== passwordConfirm) {
    return redirect303(reqOrigin, { error: 'password_mismatch' }, isSecure);
  }
  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return redirect303(reqOrigin, { error: `weak_password:${strength.reason}` }, isSecure);
  }

  // 校验旧密码
  const user = await findUserAuthByEmail(db, locals.user.email);
  if (!user || !user.password_hash || !user.password_salt) {
    // 老用户没设过密码 —— 这里不该到，引导走 reset
    return redirect303(reqOrigin, { error: 'no_password_set' }, isSecure);
  }
  const ok = await verifyPassword(currentPassword, user.password_hash, user.password_salt);
  if (!ok) {
    return redirect303(reqOrigin, { error: 'wrong_current_password' }, isSecure);
  }

  // 通过 → 落库
  const { hash, salt } = await hashPassword(password);
  await updateUserPassword(db, user.id, hash, salt);
  await deleteAllSessionsForUser(db, user.id);

  return redirect303(reqOrigin, { ok: 'password_updated' }, isSecure);
};

function redirect303(
  origin: string,
  flash: Record<string, string>,
  isSecure: boolean,
): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${origin}/settings/account`,
      'Set-Cookie': buildFlashCookie(flash, isSecure),
    },
  });
}
