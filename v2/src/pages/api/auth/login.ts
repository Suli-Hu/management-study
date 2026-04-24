/**
 * POST /api/auth/login  { email: string }
 *   生成 magic link token，存 DB，发邮件，返回 { ok: true }。
 *   即使 email 无效或 Resend 挂，也返回 200（防 email enumeration）。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import { createMagicLink } from '~/lib/auth';
import { sendEmail, renderMagicLinkEmail } from '~/lib/email';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  let email = '';
  try {
    const body = await request.formData();
    email = String(body.get('email') ?? '').trim().toLowerCase();
  } catch {
    // fallback: json body
  }
  if (!email) {
    try {
      const json = (await request.json()) as { email?: string };
      email = (json.email ?? '').trim().toLowerCase();
    } catch {
      /* noop */
    }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response('Invalid email', { status: 400 });
  }

  const { token, code } = await createMagicLink(db, email);
  const reqOrigin = new URL(request.url).origin;
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

  return Response.redirect(`${reqOrigin}/login/sent?email=${encodeURIComponent(email)}`, 303);
};
