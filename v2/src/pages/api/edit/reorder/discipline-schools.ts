/**
 * POST /api/edit/reorder/discipline-schools  (v0.4.30 重写：支持跨 theme 移动)
 *
 *   body:
 *     - discipline: string
 *     - themesSchools: { [themeKey]: schoolKey[] }   — 多 theme 一次更新（同组重排只 1 个，跨组 2 个）
 *     - movedSchool?: { key, fromTheme, toTheme }    — 跨组拖动时存在；学派 themeKey 字段同步更新
 *
 *   行为：
 *     1. canEdit(discipline) gate
 *     2. 读 discipline.json + 校验 themesSchools schoolKeys 全集 == 原 schools 全集（同组）或新+移走
 *     3. 单 theme + 同组重排 → 改 discipline.json themes[X].schools = newKeys（PUT contents）
 *     4. 跨 theme 移动 → 用 commitMultipleFiles Tree API 单 commit 改：
 *        a. discipline.json （fromTheme/toTheme 的 schools 都更新）
 *        b. school/<movedSchool.key>.json themeKey = toTheme
 */

import type { APIRoute } from 'astro';
import { getFile, putFile, commitMultipleFiles } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Discipline } from '~/schemas/discipline';
import { School } from '~/schemas/school';
import { upsertDisciplineInD1 } from '~/lib/d1-discipline-write';
import { upsertSchoolInD1 } from '~/lib/d1-school-write';
import { withRetry } from '~/lib/d1-kp-write';

interface ReorderBody {
  discipline?: string;
  themesSchools?: Record<string, string[]>;
  movedSchool?: { key: string; fromTheme: string; toTheme: string };
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });

  let body: ReorderBody;
  try { body = (await request.json()) as ReorderBody; } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  const { discipline, themesSchools, movedSchool } = body;
  if (!discipline || !themesSchools || Object.keys(themesSchools).length === 0) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + themesSchools required' });
  }
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // 1. 读 discipline.json
  const discPath = `v2/data/${discipline}/discipline.json`;
  const fetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, discPath);
  if (!fetched.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: fetched.detail });
  let parsed: unknown;
  try { parsed = JSON.parse(fetched.data.content); } catch (e) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` });
  }
  const checked = Discipline.safeParse(parsed);
  if (!checked.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: checked.error.issues });
  const disc = checked.data;

  // 2. 校验：每个 themeKey 必须存在
  const affectedThemeIdxs: Record<string, number> = {};
  for (const themeKey of Object.keys(themesSchools)) {
    const idx = disc.themes.findIndex((t) => t.key === themeKey);
    if (idx < 0) return jsonRes(400, { ok: false, reason: 'theme_not_found' as const, detail: `themeKey "${themeKey}" not in discipline.themes[]` });
    affectedThemeIdxs[themeKey] = idx;
  }

  // 3. 集合校验：受影响 themes 的新 schoolKeys 全集 == 原 schools[] 全集（同组重排）
  //    跨组移动时，全集应该相等（仅 movedSchool.key 从 from 移到 to，总数不变）
  const origAll = new Set<string>();
  for (const themeKey of Object.keys(themesSchools)) {
    disc.themes[affectedThemeIdxs[themeKey]].schools.forEach((k) => origAll.add(k));
  }
  const nextAll = new Set<string>();
  for (const newKeys of Object.values(themesSchools)) {
    newKeys.forEach((k) => nextAll.add(k));
  }
  if (origAll.size !== nextAll.size || [...origAll].some((k) => !nextAll.has(k))) {
    return jsonRes(400, {
      ok: false,
      reason: 'school_set_mismatch' as const,
      detail: '受影响 themes 的 schoolKeys 全集必须等于原 schools[] 全集（仅允许重排/移动，不能凭空增删）',
    });
  }

  // 4. 应用更新
  for (const [themeKey, newKeys] of Object.entries(themesSchools)) {
    disc.themes[affectedThemeIdxs[themeKey]].schools = newKeys;
  }
  disc.updatedAt = new Date().toISOString();
  const newDiscContent = JSON.stringify(disc, null, 2) + '\n';

  const adminEmail = locals.user.email ?? 'unknown@admin';

  // 5. 跨组移动 → Tree API 原子 commit（discipline.json + school/<key>.json）
  if (movedSchool) {
    if (!movedSchool.key || !movedSchool.fromTheme || !movedSchool.toTheme) {
      return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'movedSchool.{key,fromTheme,toTheme} required' });
    }
    const schoolPath = `v2/data/${discipline}/schools/${movedSchool.key}.json`;
    const schoolFetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, schoolPath);
    if (!schoolFetched.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: schoolFetched.detail });
    let schoolParsed: unknown;
    try { schoolParsed = JSON.parse(schoolFetched.data.content); } catch (e) {
      return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid school json: ${(e as Error).message}` });
    }
    const schoolChecked = School.safeParse(schoolParsed);
    if (!schoolChecked.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: schoolChecked.error.issues });
    const school = schoolChecked.data;
    school.themeKey = movedSchool.toTheme;
    school.updatedAt = new Date().toISOString();
    const newSchoolContent = JSON.stringify(school, null, 2) + '\n';

    const message = `v2: move school/${movedSchool.key} ${movedSchool.fromTheme} → ${movedSchool.toTheme} by ${adminEmail}`;
    const res = await commitMultipleFiles(
      { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
      [
        { path: discPath, content: newDiscContent },
        { path: schoolPath, content: newSchoolContent },
      ],
      message,
    );
    if (!res.ok) {
      return jsonRes<EditError>(res.reason === 'conflict' ? 409 : 502, { ok: false, reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error', detail: res.detail });
    }

    // v0.6.7: D1 双写 — 跨组移动两份 git 文件，对应两次 D1 upsert（独立 try-catch）
    if (env.DB) {
      try { await withRetry(() => upsertDisciplineInD1(env.DB, disc)); }
      catch (d1Err) { console.error(`[reorder/discipline-schools cross ${discipline}] discipline D1 dual-write failed:`, d1Err); }
      try { await withRetry(() => upsertSchoolInD1(env.DB, school)); }
      catch (d1Err) { console.error(`[reorder/discipline-schools cross ${discipline}] school/${movedSchool.key} D1 dual-write failed:`, d1Err); }
    }

    return jsonRes(200, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
  }

  // 6. 同组重排 → 单文件 PUT contents（带 sha）
  const themeKeys = Object.keys(themesSchools).join(',');
  const message = `v2: reorder discipline/${discipline} themes[${themeKeys}].schools by ${adminEmail}`;
  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    discPath,
    { content: newDiscContent, message, sha: fetched.data.sha, branch: 'main' },
  );
  if (!res.ok) {
    return jsonRes<EditError>(res.reason === 'conflict' ? 409 : 502, { ok: false, reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error', detail: res.detail });
  }

  // v0.6.7: D1 双写
  if (env.DB) {
    try { await withRetry(() => upsertDisciplineInD1(env.DB, disc)); }
    catch (d1Err) { console.error(`[reorder/discipline-schools same ${discipline}] D1 dual-write failed (git committed):`, d1Err); }
  }

  return jsonRes(200, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
};
