/**
 * POST /api/account/change-email-request  (form: new_email, current_password)
 *
 * v0.7.5 改邮箱第一步：输新邮箱 + 当前密码 → 校验密码 + 检查 new_email
 * 没被其他 user 占用 → 写 pending_email_change → 发 6 位 code 到 new_email。
 *
 * 安全：必须输入当前密码（防 cookie 被盗后偷改邮箱锁账户）。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  findUserAuthByEmail,
  findUserByEmail,
  createPendingEmailChange,
} from '~/lib/auth';
import { verifyPassword } from '~/lib/password';
import { buildFlashCookie } from '~/lib/flash';
import { sendEmail, renderEmailChangeCodeEmail } from '~/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let newEmail = '';
  let currentPassword = '';

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as { new_email?: string; current_password?: string };
      newEmail = (json.new_email ?? '').trim().toLowerCase();
      currentPassword = json.current_password ?? '';
    } catch (err) {
      console.error('[/api/account/change-email-request] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      newEmail = String(body.get('new_email') ?? '').trim().toLowerCase();
      currentPassword = String(body.get('current_password') ?? '');
    } catch (err) {
      console.error('[/api/account/change-email-request] formData parse failed:', err);
    }
  }

  if (!newEmail || !EMAIL_RE.test(newEmail)) {
    return redirect303(reqOrigin, { error: 'invalid_email' }, isSecure);
  }
  if (!currentPassword) {
    return redirect303(reqOrigin, { error: 'missing_current_password' }, isSecure);
  }
  if (newEmail === locals.user.email.toLowerCase()) {
    return redirect303(reqOrigin, { error: 'email_unchanged' }, isSecure);
  }

  // 校验旧密码
  const user = await findUserAuthByEmail(db, locals.user.email);
  if (!user || !user.password_hash || !user.password_salt) {
    return redirect303(reqOrigin, { error: 'no_password_set' }, isSecure);
  }
  const ok = await verifyPassword(currentPassword, user.password_hash, user.password_salt);
  if (!ok) {
    return redirect303(reqOrigin, { error: 'wrong_current_password' }, isSecure);
  }

  // 检查 new_email 没被其他 user 占用
  const taken = await findUserByEmail(db, newEmail);
  if (taken && taken.id !== user.id) {
    return redirect303(reqOrigin, { error: 'email_taken' }, isSecure);
  }

  // 写 pending + 发邮件
  const { code } = await createPendingEmailChange(db, user.id, newEmail);
  const { html, text } = renderEmailChangeCodeEmail({ newEmail, code });
  try {
    await sendEmail(env, {
      to: newEmail,
      subject: '确认邮箱变更 · 全学科学习笔记',
      html,
      text,
    });
  } catch (err) {
    console.error('[/api/account/change-email-request] sendEmail failed:', err);
  }

  return redirect303(reqOrigin, { ok: 'email_change_sent', new_email: newEmail }, isSecure);
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
