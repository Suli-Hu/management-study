/**
 * 统一 git → D1 sync endpoint (v0.5.93)
 *
 * POST   /api/v1/sync/<type>/<discipline>/<idOrKey>   git 文件已 push → 拉来 upsert D1
 * DELETE /api/v1/sync/<type>/<discipline>/<idOrKey>   git 文件已删 → D1 也删
 *
 * type ∈ kp / school / scholar / view
 * 实际逻辑都在 ~/lib/sync-resource.ts，webhook 也复用它。
 */

import type { APIRoute } from 'astro';
import { syncResource, deleteResource, type ResourceType } from '~/lib/sync-resource';

function isResourceType(s: unknown): s is ResourceType {
  return s === 'kp' || s === 'school' || s === 'scholar' || s === 'view' || s === 'discipline';
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ params, locals }) => {
  const { type, discipline, idOrKey } = params;
  if (!type || !discipline || !idOrKey) return json(400, { ok: false, reason: 'bad_request' });
  if (!isResourceType(type)) return json(400, { ok: false, reason: 'unsupported_type' });
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.canEdit(discipline)) return json(403, { ok: false, reason: 'not_admin' });

  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return json(503, { ok: false, reason: 'config_missing' });
  }

  const result = await syncResource(
    { GITHUB_PAT: env.GITHUB_PAT, GITHUB_REPO: env.GITHUB_REPO, DB: env.DB },
    type, discipline, idOrKey,
  );
  if (!result.ok) {
    const status = result.reason === 'not_found_in_git' ? 404
                 : result.reason === 'schema_invalid' ? 422
                 : result.reason === 'path_json_mismatch' ? 400
                 : 502;
    return json(status, result);
  }

  const appUrl = (env as { APP_URL?: string }).APP_URL ?? 'https://management-study-v2.pages.dev';
  const publicUrl =
    type === 'kp'         ? `${appUrl}/${discipline}/kp/${idOrKey}` :
    type === 'school'     ? `${appUrl}/${discipline}/${idOrKey}` :
    type === 'scholar'    ? `${appUrl}/${discipline}/scholars/${idOrKey}` :
    type === 'discipline' ? `${appUrl}/${discipline}` :
                             `${appUrl}/${discipline}`;

  return json(200, {
    ...result,
    d1_synced_at: new Date().toISOString(),
    public_url: publicUrl,
  });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { type, discipline, idOrKey } = params;
  if (!type || !discipline || !idOrKey) return json(400, { ok: false, reason: 'bad_request' });
  if (!isResourceType(type)) return json(400, { ok: false, reason: 'unsupported_type' });
  if (!locals.user) return json(403, { ok: false, reason: 'not_admin' });
  if (!locals.canEdit(discipline)) return json(403, { ok: false, reason: 'not_admin' });

  const result = await deleteResource(locals.runtime.env, type, discipline, idOrKey);
  return json(result.ok ? 200 : 500, {
    ...result,
    d1_synced_at: new Date().toISOString(),
  });
};
