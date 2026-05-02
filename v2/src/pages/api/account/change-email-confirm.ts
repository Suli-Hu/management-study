/**
 * POST /api/account/change-email-confirm  (form: code)
 *
 * v0.7.5 改邮箱第二步：输 6 位 code → consume → UPDATE user.email →
 * DELETE pending_email_change → DELETE 所有 session（防 cookie 仍带旧
 * email 进入）→ 跳 settings 提示成功，引导用户重新登录。
 *
 * 注意：cookie 里 payload 的 email 是旧 email；UPDATE user 后 cookie sig
 * 仍 valid（中间件不查 DB），只有用户登出再登录或新签发 cookie 才会拿到
 * 新 email。所以这里强制失效 session（删行 + 清 cookie）让用户重新登录。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import {
  consumePendingEmailChangeByCode,
  deletePendingEmailChange,
  updateUserEmail,
  findUserByEmail,
  deleteAllSessionsForUser,
  buildClearCookie,
} from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let code = '';
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as { code?: string };
      code = (json.code ?? '').trim();
    } catch (err) {
      console.error('[/api/account/change-email-confirm] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      code = String(body.get('code') ?? '').trim();
    } catch (err) {
      console.error('[/api/account/change-email-confirm] formData parse failed:', err);
    }
  }

  if (!code) {
    return redirect303(reqOrigin, { error: 'missing_code' }, isSecure);
  }

  const result = await consumePendingEmailChangeByCode(db, locals.user.id, code);
  if (!result.ok) {
    const errKey =
      result.reason === 'locked' ? 'wrong_code_locked' :
      result.reason === 'expired' ? 'expired' :
      result.reason === 'not_found' ? 'not_found' :
      'wrong_code';
    return redirect303(reqOrigin, { error: errKey }, isSecure);
  }

  // race: confirm 时再次检查 new_email 是否已被占用（B 用户先 confirm 走了）
  const taken = await findUserByEmail(db, result.row.new_email);
  if (taken && taken.id !== locals.user.id) {
    await deletePendingEmailChange(db, locals.user.id);
    return redirect303(reqOrigin, { error: 'email_taken' }, isSecure);
  }

  // UPDATE user.email + 清 pending + 失效所有 session
  await updateUserEmail(db, locals.user.id, result.row.new_email);
  await deletePendingEmailChange(db, locals.user.id);
  await deleteAllSessionsForUser(db, locals.user.id);

  // 强制重新登录（cookie sig 还能验过去，但 email 已变 → 让用户重新登录拿新 cookie）
  const headers = new Headers();
  headers.append('Location', `${reqOrigin}/login`);
  headers.append('Set-Cookie', buildClearCookie(isSecure));
  headers.append('Set-Cookie', buildFlashCookie({ ok: 'email_changed', email: result.row.new_email }, isSecure));
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
