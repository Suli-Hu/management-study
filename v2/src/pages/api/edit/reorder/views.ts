/**
 * POST /api/edit/reorder/views
 *
 * Body: { discipline: string, viewIds: string[] }
 *
 * 行为：
 *   - viewIds 必须是当前 discipline 下视图 id 的同集合
 *   - 按数组顺序设 position = index
 *   - 头一个（index 0）会被设为 is_default = 1，其它的 = 0
 *
 * 历史：
 *   v0.5.66 引入；v0.6.7 加 D1 双写
 *   v0.11.6 移除 git 依赖（D1-only）。同 school-concepts.ts 同款理由。
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;

  let body: { discipline?: string; viewIds?: string[] };
  try { body = (await request.json()) as typeof body; } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { discipline, viewIds } = body;
  if (!discipline || !Array.isArray(viewIds) || viewIds.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + viewIds[] required' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 集合校验：D1 里现有视图必须 = viewIds 同集合
  const existingRows = await env.DB
    .prepare('SELECT id FROM view WHERE discipline = ?')
    .bind(discipline)
    .all() as { results: Array<{ id: string }> };
  const existing = new Set((existingRows.results ?? []).map((r) => r.id));
  if (existing.size !== viewIds.length || viewIds.some((id) => !existing.has(id))) {
    return jsonRes(400, {
      ok: false,
      reason: 'set_mismatch' as const,
      detail: `viewIds 必须 = 当前 discipline 现有视图 id 的同集合。existing=[${[...existing].join(',')}]`,
    });
  }

  // UPDATE view 每行 position + is_default + updated_at
  const now = new Date().toISOString();
  const stmts = viewIds.map((id, i) =>
    env.DB
      .prepare('UPDATE view SET position = ?, is_default = ?, updated_at = ? WHERE id = ? AND discipline = ?')
      .bind(i, i === 0 ? 1 : 0, now, id, discipline),
  );
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    return jsonRes<EditError>(500, { ok: false, reason: 'd1_write_failed' as never, detail: (e as Error).message });
  }

  return jsonRes(200, { ok: true, d1_updated: true });
};
