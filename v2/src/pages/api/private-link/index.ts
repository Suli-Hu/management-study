/**
 * /api/private-link  (v0.7.30)
 *
 *   GET   ?discipline=xxx[&scope=study-log]
 *         返回当前 active 链接（无则 null）
 *   POST  body: { discipline, scope?='study-log' }
 *         创建或重新生成（旧 token 立即覆盖失效），返回新 row
 *
 * 必须登录 + 必须 canRead(discipline)（你能看才能分享）。
 * 写入端 RBAC：等价于 canRead，因为 share_link 是 per-user 私有数据，
 * 不影响其他人的内容；任何能进 study-log 页的用户都能创建自己学科的分享。
 */

import type { APIRoute } from 'astro';
import { json, noStore, apiError } from '~/lib/api-response';
import { getActiveShareLink, upsertShareLink } from '~/lib/share-link';

const VALID_SCOPES = new Set(['study-log']);

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return apiError(401, 'not_authenticated');
  const env = locals.runtime.env;

  const url = new URL(request.url);
  const discipline = url.searchParams.get('discipline');
  const scope = url.searchParams.get('scope') ?? 'study-log';

  if (!discipline) return apiError(400, 'invalid_input', 'discipline required');
  if (!VALID_SCOPES.has(scope)) return apiError(400, 'invalid_input', 'unknown scope');
  if (!locals.canRead(discipline)) return apiError(403, 'forbidden');

  const row = await getActiveShareLink(env.DB, locals.user.id, discipline, scope);
  return noStore(json(200, { ok: true, link: row }));
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return apiError(401, 'not_authenticated');
  const env = locals.runtime.env;

  let body: { discipline?: unknown; scope?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'bad_request', 'invalid json body');
  }

  const discipline = typeof body.discipline === 'string' ? body.discipline : '';
  const scope = typeof body.scope === 'string' ? body.scope : 'study-log';

  if (!discipline) return apiError(400, 'invalid_input', 'discipline required');
  if (!VALID_SCOPES.has(scope)) return apiError(400, 'invalid_input', 'unknown scope');
  if (!locals.canRead(discipline)) return apiError(403, 'forbidden');

  const row = await upsertShareLink(env.DB, locals.user.id, discipline, scope);
  return noStore(json(200, { ok: true, link: row }));
};
