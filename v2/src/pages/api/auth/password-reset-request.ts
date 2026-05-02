/**
 * POST /api/auth/password-reset-request  (form: email)
 *
 * 忘记密码第一步：用户输 email → 不论 user 是否存在，统一回执"如果邮箱
 * 注册过，将收到重置链接"——防 email enumeration。
 *
 * 存在 → 写 password_reset 行 + 发邮件含 30 分钟链接
 * 不存在 → 静默丢弃（不写 token 表，不发邮件）
 *
 * v0.7.5 后启用 AUTH_MODE === 'password' 时此端点禁用（password 模式无密
 * 码可重置）。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  createPasswordReset,
  findUserByEmail,
} from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';
import { sendEmail, renderPasswordResetEmail } from '~/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.AUTH_MODE === 'password') {
    return new Response('Reset disabled in password mode', { status: 404 });
  }
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let email = '';

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as { email?: string };
      email = (json.email ?? '').trim().toLowerCase();
    } catch (err) {
      console.error('[/api/auth/password-reset-request] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      email = String(body.get('email') ?? '').trim().toLowerCase();
    } catch (err) {
      console.error('[/api/auth/password-reset-request] formData parse failed:', err);
    }
  }

  // 邮箱格式无效 → 跳回 /password-reset 让用户重输（不算 enumeration，
  // 因为格式校验前端也跑同样规则）
  if (!email || !EMAIL_RE.test(email)) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${reqOrigin}/password-reset`,
        'Set-Cookie': buildFlashCookie({ error: 'invalid_email' }, isSecure),
      },
    });
  }

  // 找 user
  const user = await findUserByEmail(db, email);
  if (user) {
    const { token } = await createPasswordReset(db, user.id);
    const emailAppUrl = env.APP_URL ?? reqOrigin;
    const url = `${emailAppUrl}/password-reset/confirm?token=${encodeURIComponent(token)}`;

    const { html, text } = renderPasswordResetEmail({ email, url });
    try {
      await sendEmail(env, {
        to: email,
        subject: '重置密码 · 全学科学习笔记',
        html,
        text,
      });
    } catch (err) {
      console.error('[/api/auth/password-reset-request] sendEmail failed:', err);
      // 仍跳 sent —— 不泄露 email 状态
    }
  }

  // 不论 user 是否存在 → 同一回执（enumeration 防御）
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${reqOrigin}/password-reset/sent`,
      'Set-Cookie': buildFlashCookie({ email }, isSecure),
    },
  });
};
