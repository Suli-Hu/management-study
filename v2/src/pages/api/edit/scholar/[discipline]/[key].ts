/**
 * GET / PUT / DELETE  /api/edit/scholar/[discipline]/[key]   (v0.6.8)
 *
 * URL 加 discipline 段 — scholar 复合 PK (discipline, key) 后必须 disambiguate
 * （之前 /api/edit/scholar/[key] 在重名情况下无法定位）。
 *
 * 前端编辑页 /[discipline]/scholars/[key]/edit.astro 已知 discipline，调用方便。
 *
 * has_dependents gate：scholar 还在该学科 KP 引用中时拒绝删除（前端 disabled 是 UX，这里防绕过）
 *
 * @deprecated Use /api/scholars/:key?discipline=<key>. The API-first route writes
 * directly to D1 and enforces tenant membership server-side.
 */

import type { APIRoute } from 'astro';
import { Scholar } from '~/schemas/scholar';
import { handleGet, handlePut, handleDelete, jsonRes, type EditError } from '~/lib/edit-helpers';
import { upsertScholarInD1, deleteScholarInD1 } from '~/lib/d1-scholar-write';

const pathFor = (key: string, discipline: string) =>
  `v2/data/${discipline}/scholars/${key}.json`;

async function countKpsByScholar(db: any, discipline: string, scholarKey: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as n FROM kp_scholar WHERE scholar_discipline = ? AND scholar_key = ?')
    .bind(discipline, scholarKey)
    .first() as { n: number } | null;
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
  resolveDiscipline: async () => ctx.params.discipline ?? null,
  urlIdentifier: () => ctx.params.key,
  enrich: async (key, discipline, db) => {
    const tagsRow = await db
      .prepare('SELECT tags_json FROM discipline WHERE key = ?')
      .bind(discipline)
      .first() as { tags_json: string } | null;
    const tag_library = tagsRow?.tags_json ? JSON.parse(tagsRow.tags_json) : [];
    return { tag_library, kp_count: await countKpsByScholar(db, discipline, key) };
  },
}));

export const PUT: APIRoute = async (ctx) => deprecate(await handlePut({
  ctx,
  schema: Scholar,
  pathFor: (obj) => pathFor(obj.key, obj.discipline),
  objectLabel: (obj) => `scholar/${obj.discipline}/${obj.key}`,
  // 复合身份匹配：url.discipline + url.key 都要跟 obj 一致
  identifierMatch: (urlKey, obj) => obj.key === urlKey && obj.discipline === ctx.params.discipline,
  urlIdentifier: () => ctx.params.key,
  // v0.5.65: 任何 admin 保存 → schoolsExplicit=true，sync 时跳过 KP 派生覆盖
  forceFields: () => ({ updatedAt: new Date().toISOString(), schoolsExplicit: true }),
  upsertD1: (db, scholar) => upsertScholarInD1(db, scholar),
}));

export const DELETE: APIRoute = async (ctx) => {
  if (!ctx.locals.user) return deprecate(jsonRes<EditError>(403, { ok: false, reason: 'not_admin' }));
  const { discipline, key } = ctx.params;
  if (!discipline || !key) return deprecate(jsonRes<EditError>(400, { ok: false, reason: 'bad_request' }));
  if (!ctx.locals.canEdit(discipline)) return deprecate(jsonRes<EditError>(403, { ok: false, reason: 'not_admin' }));

  const kpCount = await countKpsByScholar(ctx.locals.runtime.env.DB, discipline, key);
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
    objectLabel: (k) => `scholar/${discipline}/${k}`,
    resolveDiscipline: async () => discipline,
    urlIdentifier: () => key,
    deleteD1: (db, _disc, schKey) => deleteScholarInD1(db, _disc, schKey),
  }));
};
