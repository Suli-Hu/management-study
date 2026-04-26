/**
 * GET / PUT / DELETE /api/edit/school/:key  (v0.4.4 part 1)
 *
 * v0.4.18: GET enrich themes + kp_count（编辑器需要主题下拉 + 删除按钮 gate）。
 *          DELETE 加 KP-count 后端硬约束（前端 disabled 是 UX，这里防绕过）。
 */

import type { APIRoute } from 'astro';
import { School } from '~/schemas/school';
import { handleGet, handlePut, handleDelete, jsonRes, type EditError } from '~/lib/edit-helpers';

const pathFor = (key: string, discipline: string) => `v2/data/${discipline}/schools/${key}.json`;

const resolveDiscipline = async (key: string, db: any): Promise<string | null> => {
  const row = await db.prepare('SELECT discipline FROM school WHERE key = ?').bind(key).first() as { discipline: string } | null;
  return row?.discipline ?? null;
};

async function countKpsInSchool(db: any, schoolKey: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) as n FROM kp_school WHERE school_key = ?').bind(schoolKey).first() as { n: number } | null;
  return row?.n ?? 0;
}

export const GET: APIRoute = (ctx) => handleGet({
  ctx,
  pathFor,
  resolveDiscipline,
  urlIdentifier: () => ctx.params.key,
  enrich: async (key, discipline, db) => {
    const discRow = await db.prepare('SELECT themes_json, tags_json FROM discipline WHERE key = ?').bind(discipline).first() as { themes_json: string; tags_json: string } | null;
    const themes = discRow?.themes_json ? JSON.parse(discRow.themes_json) : [];
    const tag_library = discRow?.tags_json ? JSON.parse(discRow.tags_json) : [];
    return { themes, tag_library, kp_count: await countKpsInSchool(db, key) };
  },
});

export const PUT: APIRoute = (ctx) => handlePut({
  ctx,
  schema: School,
  pathFor: (obj) => pathFor(obj.key, obj.discipline),
  objectLabel: (obj) => `school/${obj.key}`,
  identifierMatch: (urlKey, obj) => obj.key === urlKey,
  urlIdentifier: () => ctx.params.key,
  forceFields: () => ({ updatedAt: new Date().toISOString() }),
});

export const DELETE: APIRoute = async (ctx) => {
  // v0.4.25 RBAC：admin gate 推迟到 resolveDiscipline 之后
  if (!ctx.locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const key = ctx.params.key;
  if (!key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  const discipline = await resolveDiscipline(key, ctx.locals.runtime.env.DB);
  if (!discipline) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });
  if (!ctx.locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  // 后端硬约束：学派下还有 KP 关联时拒绝删除（前端 disabled 是 UX，这里防绕过）
  const kpCount = await countKpsInSchool(ctx.locals.runtime.env.DB, key);
  if (kpCount > 0) {
    return jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: `学派下还有 ${kpCount} 个 KP 关联。先把这些 KP 移到别的学派或删掉再试。`,
    });
  }
  return handleDelete({
    ctx,
    pathFor,
    objectLabel: (k) => `school/${k}`,
    resolveDiscipline,
    urlIdentifier: () => ctx.params.key,
  });
};
