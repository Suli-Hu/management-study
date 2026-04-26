/**
 * POST /api/new/theme  (v0.4.29 Phase 1)
 *   body: { discipline, key, title: I18n, desc?: I18n, tags?: string[] }
 *   行为：读 discipline.json → 校验 key 不重复 → push 到 themes[] 末尾 → PUT 回 GitHub
 */

import type { APIRoute } from 'astro';
import { getFile, putFile } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Discipline, ThemeGroup } from '~/schemas/discipline';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });

  let body: { json?: unknown; discipline?: string };
  try { body = (await request.json()) as typeof body; } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }
  const discipline = body.discipline;
  if (!discipline || !body.json) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + json required' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 校验新主题 schema（schools[] 留空，新建后用户再拖学派进来）
  const merged = { ...(body.json as object), schools: [] };
  const validated = ThemeGroup.safeParse(merged);
  if (!validated.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: validated.error.issues });

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

  if (disc.themes.some((t) => t.key === validated.data.key)) {
    return jsonRes(409, { ok: false, reason: 'key_exists' as const, detail: `theme key "${validated.data.key}" 已存在` });
  }

  disc.themes.push(validated.data);
  disc.updatedAt = new Date().toISOString();

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: create theme/${discipline}/${validated.data.key} by ${adminEmail}`;
  const content = JSON.stringify(disc, null, 2) + '\n';
  const res = await putFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path, { content, message, sha: fetched.data.sha, branch: 'main' });
  if (!res.ok) {
    return jsonRes<EditError>(res.reason === 'conflict' ? 409 : 502, { ok: false, reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error', detail: res.detail });
  }
  return jsonRes(201, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
};
