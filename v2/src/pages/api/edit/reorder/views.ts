/**
 * POST /api/edit/reorder/views  (v0.5.66)
 *
 * Body: { discipline: string, viewIds: string[] }
 *
 * 行为：
 *   - viewIds 必须是当前 discipline 下视图 id 的同集合（reorder only，不能凭空增删）
 *   - 按数组顺序设 position = index
 *   - 头一个（index 0）会被设为 isDefault = true，其它的 isDefault = false
 *     → 拖动 chip 到最左 = 设为默认（设计稿："最左为默认视图"）
 *   - 走 commitMultipleFiles 单次原子 commit 改 N 个 view JSON
 */

import type { APIRoute } from 'astro';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { getFile, commitMultipleFiles } from '~/lib/github';
import { View } from '~/schemas/view';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });

  let body: { discipline?: string; viewIds?: string[] };
  try { body = (await request.json()) as typeof body; } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { discipline, viewIds } = body;
  if (!discipline || !Array.isArray(viewIds) || viewIds.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + viewIds[] required' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 集合校验：D1 里现有视图必须 = viewIds（同集合，不允许凭空增减）
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

  // 拉每个 view 文件 → 改 position + isDefault → 收集 multi-file commit payload
  const files: Array<{ path: string; content: string }> = [];
  const now = new Date().toISOString();
  for (let i = 0; i < viewIds.length; i++) {
    const id = viewIds[i];
    const path = `v2/data/${discipline}/views/${id}.json`;
    const fetched = await getFile({ pat: env.GITHUB_PAT!, repo: env.GITHUB_REPO! }, path);
    if (!fetched.ok) {
      return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `${id}: ${fetched.detail}` });
    }
    let parsed: unknown;
    try { parsed = JSON.parse(fetched.data.content); }
    catch (e) { return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `${id}: ${(e as Error).message}` }); }
    const checked = View.safeParse(parsed);
    if (!checked.success) {
      return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: { id, issues: checked.error.issues } });
    }
    const v = checked.data;
    v.position = i;
    v.isDefault = i === 0;
    v.updatedAt = now;
    files.push({ path, content: JSON.stringify(v, null, 2) + '\n' });
  }

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: reorder views in ${discipline} by ${adminEmail}`;
  const res = await commitMultipleFiles(
    { pat: env.GITHUB_PAT!, repo: env.GITHUB_REPO! },
    files,
    message,
    'main',
  );
  if (!res.ok) {
    return jsonRes<EditError>(res.reason === 'conflict' ? 409 : 502, {
      ok: false,
      reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error',
      detail: res.detail,
    });
  }
  return jsonRes(200, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
};
