/**
 * POST /api/edit/reorder/discipline-schools  (v0.4.26)
 *   body: { discipline: string, themeKey: string, schoolKeys: string[] }
 *   行为：读 discipline JSON → 找到 themes[X] (key == themeKey) →
 *         校验 schoolKeys 必须是该 theme 原 schools[] 的同集合 →
 *         themes[X].schools = schoolKeys → PUT 回 GitHub
 *
 *   只支持同 theme 内重排（与 V1 home:idx 行为一致），跨 theme 拖动不支持。
 */

import type { APIRoute } from 'astro';
import { getFile, putFile } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Discipline } from '~/schemas/discipline';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  }

  let body: { discipline?: string; themeKey?: string; schoolKeys?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { discipline, themeKey, schoolKeys } = body;
  if (!discipline || !themeKey || !Array.isArray(schoolKeys) || schoolKeys.length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + themeKey + schoolKeys[] required' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const path = `v2/data/${discipline}/discipline.json`;
  const fetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!fetched.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: fetched.detail });

  let parsed: unknown;
  try {
    parsed = JSON.parse(fetched.data.content);
  } catch (e) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` });
  }
  const checked = Discipline.safeParse(parsed);
  if (!checked.success) {
    return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: checked.error.issues });
  }
  const disc = checked.data;

  const themeIdx = disc.themes.findIndex((t) => t.key === themeKey);
  if (themeIdx < 0) {
    return jsonRes(400, { ok: false, reason: 'theme_not_found' as const, detail: `themeKey "${themeKey}" not in discipline.themes[]` });
  }
  const orig = new Set(disc.themes[themeIdx].schools);
  const next = new Set(schoolKeys);
  if (orig.size !== next.size || [...orig].some((k) => !next.has(k))) {
    return jsonRes(400, {
      ok: false,
      reason: 'school_set_mismatch' as const,
      detail: `schoolKeys 必须是 themes[${themeKey}].schools[] 的同集合（仅允许重排，不能跨 theme 移动）`,
    });
  }

  disc.themes[themeIdx].schools = schoolKeys;
  disc.updatedAt = new Date().toISOString();

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: reorder discipline/${discipline} themes[${themeKey}].schools by ${adminEmail}`;
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
