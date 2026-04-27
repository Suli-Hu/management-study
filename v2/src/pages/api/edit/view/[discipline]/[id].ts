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
 */

import type { APIRoute } from 'astro';
import { View } from '~/schemas/view';
import { handleGet, handlePut, handleDelete, jsonRes, type EditError } from '~/lib/edit-helpers';

const pathFor = (id: string, discipline: string) =>
  `v2/data/${discipline}/views/${id}.json`;

export const GET: APIRoute = (ctx) => handleGet({
  ctx,
  pathFor,
  resolveDiscipline: async () => ctx.params.discipline ?? null,
  urlIdentifier: () => ctx.params.id,
});

export const PUT: APIRoute = (ctx) => handlePut({
  ctx,
  schema: View,
  pathFor: (obj) => pathFor(obj.id, obj.discipline),
  objectLabel: (obj) => `view/${obj.discipline}/${obj.id}`,
  identifierMatch: (urlId, obj) => obj.id === urlId && obj.discipline === ctx.params.discipline,
  urlIdentifier: () => ctx.params.id,
  forceFields: () => ({ updatedAt: new Date().toISOString() }),
});

export const DELETE: APIRoute = async (ctx) => {
  if (!ctx.locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const { discipline, id } = ctx.params;
  if (!discipline || !id) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!ctx.locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 防呆：不允许删除当前 discipline 的 isDefault 视图
  const row = await ctx.locals.runtime.env.DB
    .prepare('SELECT is_default FROM view WHERE id = ? AND discipline = ?')
    .bind(id, discipline)
    .first() as { is_default: number } | null;
  if (row?.is_default) {
    return jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: '默认视图不能删除（学派列表页需要它当兜底渲染）。先把另一个视图设为默认再来删。',
    });
  }

  return handleDelete({
    ctx,
    pathFor,
    objectLabel: (i) => `view/${discipline}/${i}`,
    resolveDiscipline: async () => discipline,
    urlIdentifier: () => id,
  });
};
