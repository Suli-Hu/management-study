/**
 * POST /api/new/theme  (v0.4.29 Phase 1)
 *   body: { discipline, key, title: I18n, desc?: I18n, tags?: string[] }
 *   行为：读 discipline.json → 校验 key 不重复 → push 到 themes[] 末尾 → PUT 回 GitHub
 */

import type { APIRoute } from 'astro';
import { getFile, putFile } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Discipline, ThemeGroup } from '~/schemas/discipline';
import { upsertDisciplineInD1 } from '~/lib/d1-discipline-write';
import { withRetry } from '~/lib/d1-kp-write';
import { generateUniqueKey } from '~/lib/slugify';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });

  let body: { json?: unknown; discipline?: string };
  try { body = (await request.json()) as typeof body; } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }
  const discipline = body.discipline;
  if (!discipline || !body.json) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline + json required' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  // v0.8.9 Q2=A: key 可选 — 不传则 server 端从 title.en/title.zh slugify。
  // 注：theme 的 key 唯一性 scope 是 discipline.themes[]，需要先读 discipline 再判重。
  const path = `v2/data/${discipline}/discipline.json`;
  const fetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!fetched.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: fetched.detail });
  let parsedDisc: unknown;
  try { parsedDisc = JSON.parse(fetched.data.content); } catch (e) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` });
  }
  const checkedDisc = Discipline.safeParse(parsedDisc);
  if (!checkedDisc.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: checkedDisc.error.issues });
  const disc = checkedDisc.data;

  const rawJson = body.json as Record<string, unknown>;
  let providedKey = typeof rawJson.key === 'string' ? rawJson.key.trim() : '';
  if (!providedKey) {
    const titleEn = (rawJson.title as { en?: string } | undefined)?.en
      ?? (rawJson.title as { zh?: string } | undefined)?.zh;
    providedKey = await generateUniqueKey(
      titleEn,
      'th',
      async (k) => disc.themes.some((t) => t.key === k),
    );
  }

  // 校验新主题 schema（schools[] 留空，新建后用户再拖学派进来）
  const merged = { ...rawJson, key: providedKey, schools: [] };
  const validated = ThemeGroup.safeParse(merged);
  if (!validated.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: validated.error.issues });

  // 用户显式传 key 时检查重复（generateUniqueKey 路径已保证 unique）
  if (rawJson.key && disc.themes.some((t) => t.key === validated.data.key)) {
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

  // v0.6.7: D1 双写 — themes_json 立刻更新，前端刷新就能看到新 theme
  if (env.DB) {
    try {
      await withRetry(() => upsertDisciplineInD1(env.DB, disc));
    } catch (d1Err) {
      console.error(`[new/theme ${discipline}/${validated.data.key}] D1 dual-write failed (git committed):`, d1Err);
    }
  }

  return jsonRes(201, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90, key: validated.data.key });
};
