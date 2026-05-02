/**
 * POST /api/account/profile  (form: display_name)
 *
 * v0.7.5 改 display_name —— 唯一的轻量改动，不需要密码确认。
 * 空字符串 → null（清空 display_name 回退用 email 前缀）。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import { updateUserDisplayName } from '~/lib/auth';
import { buildFlashCookie } from '~/lib/flash';

const MAX_DISPLAY_NAME_LEN = 40;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = getDb(env);

  const reqUrl = new URL(request.url);
  const reqOrigin = reqUrl.origin;
  const isSecure = reqUrl.protocol === 'https:';

  let displayName: string | null = null;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await request.json()) as { display_name?: string };
      const dn = (json.display_name ?? '').trim();
      displayName = dn ? dn.slice(0, MAX_DISPLAY_NAME_LEN) : null;
    } catch (err) {
      console.error('[/api/account/profile] json parse failed:', err);
    }
  } else {
    try {
      const body = await request.formData();
      const dn = String(body.get('display_name') ?? '').trim();
      displayName = dn ? dn.slice(0, MAX_DISPLAY_NAME_LEN) : null;
    } catch (err) {
      console.error('[/api/account/profile] formData parse failed:', err);
    }
  }

  await updateUserDisplayName(db, locals.user.id, displayName);

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${reqOrigin}/settings/account`,
      'Set-Cookie': buildFlashCookie({ ok: 'profile_updated' }, isSecure),
    },
  });
};
