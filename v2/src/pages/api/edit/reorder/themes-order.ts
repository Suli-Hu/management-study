/**
 * POST /api/edit/reorder/themes-order  (v0.4.31 Phase 3)
 *   body: { discipline: string, themeKeys: string[] }
 *   行为：仅重排 discipline.themes[] 数组本身（章节顺序），各 theme 内 schools[] 不变
 *
 *   校验：themeKeys 必须是原 themes[].key 的同集合（reorder only，不能凭空增删）
 */

import type { APIRoute } from 'astro';
import { getFile, putFile } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Discipline } from '~/schemas/discipline';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });

  let body: { discipline?: string; themeKeys?: string[] };
  try { body = (await request.json()) as typeof body; } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { discipline, themeKeys } = body;
  if (!discipline || !Array.isArray(themeKeys) || themeKeys.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + themeKeys[] required' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const path = `v2/data/${discipline}/discipline.json`;
  const fetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!fetched.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: fetched.detail });
  let parsed: unknown;
  try { parsed = JSON.parse(fetched.data.content); } catch (e) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` });
  }
  const checked = Discipline.safeParse(parsed);
  if (!checked.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: checked.error.issues });
  const disc = checked.data;

  // 集合校验
  const orig = new Set(disc.themes.map((t) => t.key));
  const next = new Set(themeKeys);
  if (orig.size !== next.size || [...orig].some((k) => !next.has(k))) {
    return jsonRes(400, {
      ok: false,
      reason: 'theme_set_mismatch' as const,
      detail: 'themeKeys 必须是原 discipline.themes[] key 的同集合（仅允许重排，不能凭空增删）',
    });
  }

  // 按新顺序重新排列 themes 数组
  const themesByKey = new Map(disc.themes.map((t) => [t.key, t]));
  disc.themes = themeKeys.map((k) => themesByKey.get(k)!).filter(Boolean);
  disc.updatedAt = new Date().toISOString();

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: reorder discipline/${discipline} themes[] order by ${adminEmail}`;
  const content = JSON.stringify(disc, null, 2) + '\n';
  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, sha: fetched.data.sha, branch: 'main' },
  );
  if (!res.ok) {
    return jsonRes<EditError>(res.reason === 'conflict' ? 409 : 502, { ok: false, reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error', detail: res.detail });
  }
  return jsonRes(200, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
};
