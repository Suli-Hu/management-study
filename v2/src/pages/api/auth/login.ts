/**
 * POST /api/auth/login  { email: string }
 *   生成 magic link token，存 DB，发邮件，跳 /login/sent（email 走 flash cookie，不入 URL）。
 *   即使 email 无效或 Resend 挂，也不泄露状态（防 email enumeration）。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  createMagicLink,
  findUserByEmail,
  isEmailTrusted,
  buildSignedSessionCookie,
  getSessionSecret,
} from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';
import { sendEmail, renderMagicLinkEmail } from '~/lib/email';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  // v0.2.9: password 模式下邮箱 flow 禁用
  if (env.AUTH_MODE === 'password') {
    return new Response('Email login disabled in password mode', { status: 404 });
  }
  const db = getDb(env);

  let email = '';
  let remember = true;
  try {
    const body = await request.formData();
    email = String(body.get('email') ?? '').trim().toLowerCase();
    remember = body.get('remember') !== null;
  } catch (err) {
    console.error('[/api/auth/login] formData parse failed:', err);
  }
  if (!email) {
    try {
      const json = (await request.json()) as { email?: string; remember?: boolean };
      email = (json.email ?? '').trim().toLowerCase();
      if (typeof json.remember === 'boolean') remember = json.remember;
    } catch (err) {
      console.error('[/api/auth/login] json parse failed:', err);
    }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response('Invalid email', { status: 400 });
  }

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  // v0.5.45 邮箱信任窗口：已存在的 user 在 EMAIL_TRUST_DAYS 内 → 直接 grant session
  // 不延期 trusted_until（避免无限滚动），只在用户主动验证 code 时续期
  const existingUser = await findUserByEmail(db, email);
  if (isEmailTrusted(existingUser)) {
    const secret = getSessionSecret(env.SESSION_SECRET);
    const cookie = await buildSignedSessionCookie(existingUser!, remember, secret, isSecure);
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${reqOrigin}/`,
        'Set-Cookie': cookie,
      },
    });
  }

  const { token, code } = await createMagicLink(db, email, remember);
  // 邮件里的 verify 链接永远用 APP_URL（固定公网地址），否则 dev → 用户收到 localhost 链接
  const emailAppUrl = env.APP_URL ?? reqOrigin;
  const verifyUrl = `${emailAppUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

  const { html, text } = renderMagicLinkEmail({ email, url: verifyUrl, code });

  try {
    await sendEmail(env, {
      to: email,
      subject: '登录全学科学习笔记',
      html,
      text,
    });
  } catch (err) {
    console.error('[/api/auth/login] sendEmail failed:', err);
    // 仍然 redirect to sent — 不泄露 email 状态
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${reqOrigin}/login/sent`,
      'Set-Cookie': buildFlashCookie({ email }, isSecure),
    },
  });
};
