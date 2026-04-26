/**
 * POST /api/auth/invite-code  (form: code)
 *   v0.4.33 邀请码登录（无邮箱）：
 *     code === env.INVITE_CODE_GUEST → 用 INVITE_GUEST_EMAIL findOrCreateUser → 写 session
 *     middleware 识别 INVITE_GUEST_EMAIL user → 全学科 canRead = true（不查 user_permission）
 *   共用 user_id：所有邀请码登录共用同一行 user（便利分享，无 user_progress / user_note 区分）
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  findOrCreateUser,
  buildSignedSessionCookie,
  getSessionSecret,
  timingSafeEqual,
} from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let code = '';
  let remember = true;
  try {
    const body = await request.formData();
    code = String(body.get('code') ?? '').trim();
    remember = body.get('remember') !== null;
  } catch (err) {
    console.error('[/api/auth/invite-code] formData parse failed:', err);
  }
  if (!code) {
    try {
      const json = (await request.json()) as { code?: string; remember?: boolean };
      code = (json.code ?? '').trim();
      if (typeof json.remember === 'boolean') remember = json.remember;
    } catch (err) {
      console.error('[/api/auth/invite-code] json parse failed:', err);
    }
  }

  const expectedCode = env.INVITE_CODE_GUEST ?? '';
  const inviteEmail = env.INVITE_GUEST_EMAIL ?? '';
  if (!expectedCode || !inviteEmail) {
    return new Response('Invite code login disabled', { status: 404 });
  }

  const badCodeResponse = () =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${reqOrigin}/login`,
        'Set-Cookie': buildFlashCookie({ error: 'bad_invite_code' }, isSecure),
      },
    });

  if (!code || !timingSafeEqual(code, expectedCode)) return badCodeResponse();

  // 共用 user_id（所有邀请码登录指向同一 user）
  const user = await findOrCreateUser(db, inviteEmail);
  const secret = getSessionSecret(env.SESSION_SECRET);
  const cookie = await buildSignedSessionCookie(user, remember, secret, isSecure);

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${reqOrigin}/`,
      'Set-Cookie': cookie,
    },
  });
};
