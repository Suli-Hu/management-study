/**
 * POST /api/auth/login-password  (form: email + password + remember?)
 *
 * v0.7.3 主登录路径：邮箱 + 密码登录已注册账号。
 *
 * 流程：
 *   1. AUTH_MODE === 'password' → 404（password 模式走 /api/auth/password）
 *   2. 找 user by email
 *      - 不存在 → 故意延迟（防 enumeration timing）→ bad_credentials flash
 *      - 存在但 password_hash 为 NULL（老用户/邀请码） → bad_credentials
 *   3. 检查 isLocked
 *      - 锁定中 → bad_credentials_locked flash（不告诉用户密码错与对，无差别）
 *   4. verifyPassword
 *      - 错 → applyFailedAttempt 落库（≥5 次锁 30 分钟） → bad_credentials
 *      - 对 → updateUserLoginSuccess（reset attempts + last_login_at）→ session
 *
 * 安全权衡：
 *   - 错 email vs 对 email 错密码：返回完全相同 flash + 状态码 + Location（防 enum）
 *   - 但 timing 不同（错 email 不跑 PBKDF2）→ 加 dummy hash 抹平
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  findUserAuthByEmail,
  updateUserLockState,
  updateUserLoginSuccess,
  buildSignedSessionCookie,
  getSessionSecret,
} from '~/lib/auth';
import { verifyPassword, isLocked, applyFailedAttempt, hashPassword } from '~/lib/password';
import { buildFlashCookie } from '~/lib/flash';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 用于错 email 时抹平 timing 的 dummy hash（启动时算一次） */
let DUMMY_HASH_PROMISE: Promise<{ hash: string; salt: string }> | null = null;
function getDummyHash() {
  if (!DUMMY_HASH_PROMISE) {
    DUMMY_HASH_PROMISE = hashPassword('dummy-password-for-timing-attack-defense');
  }
  return DUMMY_HASH_PROMISE;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.AUTH_MODE === 'password') {
    return new Response('Use /api/auth/password in password mode', { status: 404 });
  }
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let email = '';
  let password = '';
  let remember = true;

  // 按 content-type 路由（避免 body double-read，同 v0.7.2 修复）
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as { email?: string; password?: string; remember?: boolean };
      email = (json.email ?? '').trim().toLowerCase();
      password = json.password ?? '';
      if (typeof json.remember === 'boolean') remember = json.remember;
    } catch (err) {
      console.error('[/api/auth/login-password] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      email = String(body.get('email') ?? '').trim().toLowerCase();
      password = String(body.get('password') ?? '');
      remember = body.get('remember') !== null;
    } catch (err) {
      console.error('[/api/auth/login-password] formData parse failed:', err);
    }
  }

  if (!email || !EMAIL_RE.test(email) || !password) {
    return failWith(reqOrigin, 'bad_credentials', email, isSecure);
  }

  const user = await findUserAuthByEmail(db, email);

  // 错 email：跑 dummy hash 抹平 timing → 仍返回 bad_credentials
  if (!user || !user.password_hash || !user.password_salt) {
    const dummy = await getDummyHash();
    await verifyPassword(password, dummy.hash, dummy.salt); // throw away result
    return failWith(reqOrigin, 'bad_credentials', email, isSecure);
  }

  // 锁定检查 —— 直接拒绝，不验证密码（避免给攻击者反馈"对/错"的信号）
  if (isLocked(user)) {
    return failWith(reqOrigin, 'bad_credentials_locked', email, isSecure);
  }

  const ok = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!ok) {
    const next = applyFailedAttempt({
      failed_attempts: user.failed_attempts,
      locked_until: user.locked_until,
    });
    await updateUserLockState(db, user.id, next);
    const errKey = next.locked_until ? 'bad_credentials_locked' : 'bad_credentials';
    return failWith(reqOrigin, errKey, email, isSecure);
  }

  // 成功
  await updateUserLoginSuccess(db, user.id);
  const secret = getSessionSecret(env.SESSION_SECRET);
  const cookie = await buildSignedSessionCookie(
    { id: user.id, email: user.email },
    remember,
    secret,
    isSecure,
  );

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${reqOrigin}/`,
      'Set-Cookie': cookie,
    },
  });
};

function failWith(
  origin: string,
  errorKey: string,
  email: string,
  isSecure: boolean,
): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${origin}/login`,
      // email 保留方便回填，error 让前端显示文案
      'Set-Cookie': buildFlashCookie({ error: errorKey, email }, isSecure),
    },
  });
}
