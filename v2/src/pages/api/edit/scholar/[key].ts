/**
 * GET / PUT / DELETE /api/edit/scholar/:key  (v0.4.4 part 1)
 *
 * v0.4.19: GET enrich kp_count；DELETE 加 has_dependents 硬约束（前端 disabled 是 UX，这里防绕过）
 *
 * @deprecated Use /api/scholars/:key?discipline=<key>. The API-first route
 * writes directly to D1 and enforces tenant membership server-side.
 */

import type { APIRoute } from 'astro';
import { Scholar } from '~/schemas/scholar';
import { handleGet, handlePut, handleDelete, jsonRes, type EditError } from '~/lib/edit-helpers';

const pathFor = (key: string, discipline: string) => `v2/data/${discipline}/scholars/${key}.json`;

const resolveDiscipline = async (key: string, db: any): Promise<string | null> => {
  const row = await db.prepare('SELECT discipline FROM scholar WHERE key = ?').bind(key).first() as { discipline: string } | null;
  return row?.discipline ?? null;
};

async function countKpsByScholar(db: any, scholarKey: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) as n FROM kp_scholar WHERE scholar_key = ?').bind(scholarKey).first() as { n: number } | null;
  return row?.n ?? 0;
}

const deprecate = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set('deprecation', 'true');
  headers.set('link', '</api/scholars>; rel="successor-version"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const GET: APIRoute = async (ctx) => deprecate(await handleGet({
  ctx,
  pathFor,
  resolveDiscipline,
  urlIdentifier: () => ctx.params.key,
  enrich: async (key, discipline, db) => {
    const tagsRow = await db.prepare('SELECT tags_json FROM discipline WHERE key = ?').bind(discipline).first() as { tags_json: string } | null;
    const tag_library = tagsRow?.tags_json ? JSON.parse(tagsRow.tags_json) : [];
    return { tag_library, kp_count: await countKpsByScholar(db, key) };
  },
}));

export const PUT: APIRoute = async (ctx) => deprecate(await handlePut({
  ctx,
  schema: Scholar,
  pathFor: (obj) => pathFor(obj.key, obj.discipline),
  objectLabel: (obj) => `scholar/${obj.key}`,
  identifierMatch: (urlKey, obj) => obj.key === urlKey,
  urlIdentifier: () => ctx.params.key,
  // v0.5.65: 任何 admin 保存 → schoolsExplicit=true，sync 时跳过 KP 派生覆盖
  forceFields: () => ({ updatedAt: new Date().toISOString(), schoolsExplicit: true }),
}));

export const DELETE: APIRoute = async (ctx) => {
  // v0.4.25 RBAC：admin gate 推迟到 resolveDiscipline 之后
  if (!ctx.locals.user) return deprecate(jsonRes<EditError>(403, { ok: false, reason: 'not_admin' }));
  const key = ctx.params.key;
  if (!key) return deprecate(jsonRes<EditError>(400, { ok: false, reason: 'bad_request' }));
  const discipline = await resolveDiscipline(key, ctx.locals.runtime.env.DB);
  if (!discipline) return deprecate(jsonRes<EditError>(404, { ok: false, reason: 'not_found' }));
  if (!ctx.locals.canEdit(discipline)) return deprecate(jsonRes<EditError>(403, { ok: false, reason: 'not_admin' }));
  const kpCount = await countKpsByScholar(ctx.locals.runtime.env.DB, key);
  if (kpCount > 0) {
    return deprecate(jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: `学者名下还有 ${kpCount} 个 KP 关联。先把这些 KP 移到别的学者或删掉再试。`,
    }));
  }
  return deprecate(await handleDelete({
    ctx,
    pathFor,
    objectLabel: (k) => `scholar/${k}`,
    resolveDiscipline,
    urlIdentifier: () => ctx.params.key,
  }));
};
