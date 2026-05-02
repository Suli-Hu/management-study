/**
 * POST /api/auth/signup  (form: email, password, display_name?)
 *
 * 注册流第一步：校验密码强度 + 邮箱未被占用 → hash 密码 → 写 pending_signup
 * → 发 6 位验证码邮件 → 跳 /signup/sent 让用户输 code。
 *
 * 安全/UX 权衡：
 *   - email 已注册 → 故意不告诉用户"邮箱已存在"（防 enumeration），但也不
 *     发邮件——用 generic "如果邮箱有效会收到验证邮件" 文案。这跟登录侧
 *     statement 一致。
 *   - password 弱 → 立即返回错误（用户能改），不需要 enumeration 保护。
 *   - 表 PK = email：同 email 重复 signup 后到的覆盖前面（防止抢注 + 允许
 *     用户纠正密码）。
 *
 * v0.7.5 后启用 AUTH_MODE === 'password' 时此端点禁用（password 模式 =
 * 考试期 fallback，不开放注册）。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  createPendingSignup,
  findUserByEmail,
} from '~/lib/auth';
import { hashPassword, checkPasswordStrength } from '~/lib/password';
import { buildFlashCookie } from '~/lib/flash';
import { sendEmail, renderSignupCodeEmail } from '~/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DISPLAY_NAME_LEN = 40;

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
  let password = '';
  let displayName: string | null = null;

  // 按 content-type 路由解析器，避免 formData/json 双读 body 在某些 runtime 上失败
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as {
        email?: string;
        password?: string;
        display_name?: string;
      };
      email = (json.email ?? '').trim().toLowerCase();
      password = json.password ?? '';
      const dn = (json.display_name ?? '').trim();
      displayName = dn ? dn.slice(0, MAX_DISPLAY_NAME_LEN) : null;
    } catch (err) {
      console.error('[/api/auth/signup] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      email = String(body.get('email') ?? '').trim().toLowerCase();
      password = String(body.get('password') ?? '');
      const dn = String(body.get('display_name') ?? '').trim();
      displayName = dn ? dn.slice(0, MAX_DISPLAY_NAME_LEN) : null;
    } catch (err) {
      console.error('[/api/auth/signup] formData parse failed:', err);
    }
  }

  // 邮箱格式
  if (!email || !EMAIL_RE.test(email)) {
    return redirect303(reqOrigin, '/signup', { error: 'invalid_email' }, isSecure);
  }

  // 密码强度（同步校验，前端也跑同函数避免不一致）
  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return redirect303(
      reqOrigin,
      '/signup',
      { error: `weak_password:${strength.reason}`, email },
      isSecure,
    );
  }

  // 已注册 → 静默跳 /signup/sent（防 enumeration），不发邮件
  const existing = await findUserByEmail(db, email);
  if (existing) {
    return redirect303(reqOrigin, '/signup/sent', { email }, isSecure);
  }

  // hash + 写 pending_signup
  const { hash, salt } = await hashPassword(password);
  const { code } = await createPendingSignup(db, {
    email,
    passwordHash: hash,
    salt,
    displayName,
  });

  // 邮件
  const { html, text } = renderSignupCodeEmail({ email, code });
  try {
    await sendEmail(env, {
      to: email,
      subject: '完成注册 · 全学科学习笔记',
      html,
      text,
    });
  } catch (err) {
    console.error('[/api/auth/signup] sendEmail failed:', err);
    // 仍跳 sent —— 不泄露 email 状态
  }

  return redirect303(reqOrigin, '/signup/sent', { email }, isSecure);
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
