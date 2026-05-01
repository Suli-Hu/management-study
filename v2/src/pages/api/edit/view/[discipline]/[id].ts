/**
 * GET / PUT / DELETE  /api/edit/view/:discipline/:id
 *
 * v0.5.66 视图系统 — 学派列表页"看法"的 CRUD。
 *
 * URL 必须带 discipline 段：view id 在 (discipline, id) 复合主键下唯一，
 * 不像 school/scholar 用全局 key。
 *
 * 删默认视图（isDefault=true）受 schema 不阻拦，但前端 ViewMenu 应 disable。
 * 这里硬约束：删 isDefault 的视图返 409，避免学派列表页失去渲染源。
 *
 * @deprecated Use /api/views/:id?discipline=<key>. The API-first route writes
 * directly to D1 and enforces tenant membership server-side.
 */

import type { APIRoute } from 'astro';
import { View } from '~/schemas/view';
import { handleGet, handlePut, handleDelete, jsonRes, type EditError } from '~/lib/edit-helpers';
import { deleteViewInD1, upsertViewInD1 } from '~/lib/d1-view-write';

const pathFor = (id: string, discipline: string) =>
  `v2/data/${discipline}/views/${id}.json`;

const deprecate = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set('deprecation', 'true');
  headers.set('link', '</api/views>; rel="successor-version"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const GET: APIRoute = async (ctx) => deprecate(await handleGet({
  ctx,
  pathFor,
  resolveDiscipline: async () => ctx.params.discipline ?? null,
  urlIdentifier: () => ctx.params.id,
}));

export const PUT: APIRoute = async (ctx) => deprecate(await handlePut({
  ctx,
  schema: View,
  pathFor: (obj) => pathFor(obj.id, obj.discipline),
  objectLabel: (obj) => `view/${obj.discipline}/${obj.id}`,
  identifierMatch: (urlId, obj) => obj.id === urlId && obj.discipline === ctx.params.discipline,
  urlIdentifier: () => ctx.params.id,
  forceFields: () => ({ updatedAt: new Date().toISOString() }),
  upsertD1: (db, view) => upsertViewInD1(db, view),
}));

export const DELETE: APIRoute = async (ctx) => {
  if (!ctx.locals.user) return deprecate(jsonRes<EditError>(403, { ok: false, reason: 'not_admin' }));
  const { discipline, id } = ctx.params;
  if (!discipline || !id) return deprecate(jsonRes<EditError>(400, { ok: false, reason: 'bad_request' }));
  if (!ctx.locals.canEdit(discipline)) return deprecate(jsonRes<EditError>(403, { ok: false, reason: 'not_admin' }));

  // 防呆：不允许删除当前 discipline 的 isDefault 视图
  const row = await ctx.locals.runtime.env.DB
    .prepare('SELECT is_default FROM view WHERE id = ? AND discipline = ?')
    .bind(id, discipline)
    .first() as { is_default: number } | null;
  if (row?.is_default) {
    return deprecate(jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: '默认视图不能删除（学派列表页需要它当兜底渲染）。先把另一个视图设为默认再来删。',
    }));
  }

  return deprecate(await handleDelete({
    ctx,
    pathFor,
    objectLabel: (i) => `view/${discipline}/${i}`,
    resolveDiscipline: async () => discipline,
    urlIdentifier: () => id,
    deleteD1: (db, _discipline, viewId) => deleteViewInD1(db, viewId),
  }));
};
