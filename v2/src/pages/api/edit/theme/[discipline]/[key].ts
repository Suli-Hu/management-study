/**
 * PUT / DELETE /api/edit/theme/[discipline]/[key]  (v0.4.29 Phase 1)
 *
 *   PUT  body: { title: I18n, desc?: I18n, tags?: string[] }   — 改主题（key 不可改）
 *   DELETE                                           — 删主题（schools[] > 0 时返 409 has_dependents）
 *
 *   学派组 themes 是 discipline.json 的嵌套字段，CRUD 都是 PATCH discipline.json themes[X]。
 */

import type { APIRoute } from 'astro';
import { getFile, putFile } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Discipline, ThemeGroup } from '~/schemas/discipline';

type LoadResult =
  | { error: Response; disc?: never; sha?: never; path?: never }
  | { error?: never; disc: ReturnType<typeof Discipline.parse>; sha: string; path: string };

async function loadDiscipline(env: any, discipline: string): Promise<LoadResult> {
  const path = `v2/data/${discipline}/discipline.json`;
  const fetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!fetched.ok) return { error: jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: fetched.detail }) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fetched.data.content);
  } catch (e) {
    return { error: jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` }) };
  }
  const checked = Discipline.safeParse(parsed);
  if (!checked.success) {
    return { error: jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: checked.error.issues }) };
  }
  return { disc: checked.data, sha: fetched.data.sha, path };
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  const discipline = params.discipline;
  const key = params.key;
  if (!discipline || !key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let body: unknown;
  try { body = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }

  const loaded = await loadDiscipline(env, discipline);
  if (loaded.error) return loaded.error;
  const { disc, sha, path } = loaded;

  const idx = disc.themes.findIndex((t) => t.key === key);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  // 合并新字段 — key + schools[] 不变（schools 由 reorder API 管）
  const merged = { ...disc.themes[idx], ...(body as object), key, schools: disc.themes[idx].schools };
  const validated = ThemeGroup.safeParse(merged);
  if (!validated.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: validated.error.issues });

  disc.themes[idx] = validated.data;
  disc.updatedAt = new Date().toISOString();

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: edit theme/${discipline}/${key} by ${adminEmail}`;
  const content = JSON.stringify(disc, null, 2) + '\n';
  const res = await putFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path, { content, message, sha, branch: 'main' });
  if (!res.ok) {
    return jsonRes<EditError>(res.reason === 'conflict' ? 409 : 502, { ok: false, reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error', detail: res.detail });
  }
  return jsonRes(200, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  const discipline = params.discipline;
  const key = params.key;
  if (!discipline || !key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const loaded = await loadDiscipline(env, discipline);
  if (loaded.error) return loaded.error;
  const { disc, sha, path } = loaded;

  const idx = disc.themes.findIndex((t) => t.key === key);
  if (idx < 0) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  // has_dependents gate：theme.schools[] 还有学派 → 拒绝
  const theme = disc.themes[idx];
  if (theme.schools.length > 0) {
    return jsonRes(409, {
      ok: false,
      reason: 'has_dependents' as const,
      detail: `学派组「${theme.title?.zh ?? key}」下还有 ${theme.schools.length} 个学派。先把它们移到别的学派组或删掉再试。`,
    });
  }

  disc.themes.splice(idx, 1);
  disc.updatedAt = new Date().toISOString();

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: delete theme/${discipline}/${key} by ${adminEmail}`;
  const content = JSON.stringify(disc, null, 2) + '\n';
  const res = await putFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path, { content, message, sha, branch: 'main' });
  if (!res.ok) {
    return jsonRes<EditError>(res.reason === 'conflict' ? 409 : 502, { ok: false, reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error', detail: res.detail });
  }
  return jsonRes(200, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
};

/** GET 用于编辑器加载（key 已在 url，返当前 theme + 该 discipline 所有 theme keys 用于校验） */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  const discipline = params.discipline;
  const key = params.key;
  if (!discipline || !key) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const loaded = await loadDiscipline(env, discipline);
  if (loaded.error) return loaded.error;
  const { disc, sha } = loaded;
  const theme = disc.themes.find((t) => t.key === key);
  if (!theme) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  return jsonRes(200, { ok: true, json: theme, base_sha: sha, school_count: theme.schools.length });
};
