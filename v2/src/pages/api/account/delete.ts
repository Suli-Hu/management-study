/**
 * POST /api/account/delete  (form: current_password + confirm)
 *
 * v0.7.5 注销账户 —— 不可逆。
 *
 * 流程：
 *   1. 必须登录
 *   2. 校验当前密码（防 cookie 被盗）
 *   3. confirm 字段必须 === 'DELETE' 字符串（前端 UI 强迫用户输入）
 *   4. DELETE FROM user → CASCADE 删 session / user_permission /
 *      user_progress / user_note / study_session / pending_email_change /
 *      tenant_member / password_reset 等
 *   5. 清 cookie → 跳 /signin + flash"账户已注销"（v0.7.9）
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  findUserAuthByEmail,
  deleteUserAndCascade,
  buildClearCookie,
} from '~/lib/auth';
import { verifyPassword } from '~/lib/password';
import { buildFlashCookie } from '~/lib/flash';

const CONFIRM_PHRASE = 'DELETE';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let currentPassword = '';
  let confirm = '';
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as { current_password?: string; confirm?: string };
      currentPassword = json.current_password ?? '';
      confirm = json.confirm ?? '';
    } catch (err) {
      console.error('[/api/account/delete] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      currentPassword = String(body.get('current_password') ?? '');
      confirm = String(body.get('confirm') ?? '');
    } catch (err) {
      console.error('[/api/account/delete] formData parse failed:', err);
    }
  }

  if (confirm !== CONFIRM_PHRASE) {
    return redirect303(reqOrigin, { error: 'confirm_phrase_mismatch' }, isSecure);
  }
  if (!currentPassword) {
    return redirect303(reqOrigin, { error: 'missing_current_password' }, isSecure);
  }

  const user = await findUserAuthByEmail(db, locals.user.email);
  if (!user || !user.password_hash || !user.password_salt) {
    return redirect303(reqOrigin, { error: 'no_password_set' }, isSecure);
  }
  const ok = await verifyPassword(currentPassword, user.password_hash, user.password_salt);
  if (!ok) {
    return redirect303(reqOrigin, { error: 'wrong_current_password' }, isSecure);
  }

  await deleteUserAndCascade(db, user.id);

  const headers = new Headers();
  headers.append('Location', `${reqOrigin}/signin`);
  headers.append('Set-Cookie', buildClearCookie(isSecure));
  headers.append('Set-Cookie', buildFlashCookie({ ok: 'account_deleted' }, isSecure));
  return new Response(null, { status: 303, headers });
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
