/**
 * GET / PUT /api/edit/discipline/[discipline]/tags  (v0.5.18 · Phase A)
 *
 *   GET  → { tags: Tag[], base_sha, ref_counts: Record<key, number> }
 *   PUT  body: { tags: Tag[], base_sha } → 全量替换 discipline.tags[]
 *
 *   被引用的 tag 不允许删（has_dependents gate，前端 UI 也会 disable 删除按钮）。
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getFile, putFile } from '~/lib/github';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { getDb } from '~/lib/db';
import { Discipline, Tag } from '~/schemas/discipline';
import { upsertDisciplineInD1 } from '~/lib/d1-discipline-write';
import { withRetry } from '~/lib/d1-kp-write';

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

/** 数 D1 里 entity.tags_json 引用某 tag key 的次数（theme/school/scholar/kp 累加） */
async function countRefs(db: D1Database, discipline: string, tagKey: string): Promise<number> {
  // tags_json 是 JSON 数组字符串，例如 ["foo","bar"]。tag key 已被 schema 限制为
  // /^[a-z][a-z0-9_]*$/，不会出现需要转义的字符，LIKE %"key"% 安全。
  const needle = `%"${tagKey}"%`;
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM school   WHERE discipline = ?1 AND tags_json LIKE ?2) +
      (SELECT COUNT(*) FROM scholar  WHERE discipline = ?1 AND tags_json LIKE ?2) +
      (SELECT COUNT(*) FROM kp       WHERE discipline = ?1 AND tags_json LIKE ?2) AS n
  `;
  const row = await db.prepare(sql).bind(discipline, needle).first<{ n: number }>();
  return row?.n ?? 0;
}

async function countAllRefs(
  db: D1Database,
  discipline: string,
  tags: ReadonlyArray<{ key: string }>,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tags) out[t.key] = await countRefs(db, discipline, t.key);
  return out;
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  const discipline = params.discipline;
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const loaded = await loadDiscipline(env, discipline);
  if (loaded.error) return loaded.error;
  const { disc, sha } = loaded;

  const db = getDb(env);
  const ref_counts = await countAllRefs(db, discipline, disc.tags);

  return jsonRes(200, { ok: true, tags: disc.tags, base_sha: sha, ref_counts });
};

const PutBody = z.object({
  tags: z.array(Tag),
  base_sha: z.string().min(1),
});

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  const discipline = params.discipline;
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }
  const body = PutBody.safeParse(raw);
  if (!body.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: body.error.issues });

  // 验 tags 数组本身（key 唯一性等）
  const tagsSchema = Discipline.shape.tags;
  const validated = tagsSchema.safeParse(body.data.tags);
  if (!validated.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: validated.error.issues });

  const loaded = await loadDiscipline(env, discipline);
  if (loaded.error) return loaded.error;
  const { disc, sha, path } = loaded;
  if (sha !== body.data.base_sha) {
    return jsonRes<EditError>(409, { ok: false, reason: 'sha_conflict', current_sha: sha });
  }

  // 检查删除的 tag 是否被引用
  const oldKeys = new Set(disc.tags.map((t) => t.key));
  const newKeys = new Set(validated.data.map((t) => t.key));
  const removedKeys = [...oldKeys].filter((k) => !newKeys.has(k));
  if (removedKeys.length > 0) {
    const db = getDb(env);
    const blockers: Array<{ key: string; refs: number }> = [];
    for (const k of removedKeys) {
      const n = await countRefs(db, discipline, k);
      if (n > 0) blockers.push({ key: k, refs: n });
    }
    if (blockers.length > 0) {
      return jsonRes(409, {
        ok: false,
        reason: 'has_dependents' as const,
        detail: `还有标签被引用：${blockers.map((b) => `${b.key} (${b.refs})`).join('，')}`,
        blockers,
      });
    }
  }

  disc.tags = validated.data;
  disc.updatedAt = new Date().toISOString();

  const adminEmail = locals.user.email ?? 'unknown@admin';
  const message = `v2: edit discipline/${discipline}/tags by ${adminEmail}`;
  const content = JSON.stringify(disc, null, 2) + '\n';
  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, sha, branch: 'main' },
  );
  if (!res.ok) {
    return jsonRes<EditError>(
      res.reason === 'conflict' ? 409 : 502,
      { ok: false, reason: res.reason === 'conflict' ? 'sha_conflict' : 'github_error', detail: res.detail },
    );
  }

  // v0.6.7: D1 双写
  if (env.DB) {
    try { await withRetry(() => upsertDisciplineInD1(env.DB, disc)); }
    catch (d1Err) { console.error(`[edit/discipline/${discipline}/tags PUT] D1 dual-write failed (git committed):`, d1Err); }
  }

  return jsonRes(200, {
    ok: true,
    commit_sha: res.data.commit_sha,
    new_blob_sha: res.data.new_blob_sha,
    deploy_eta_seconds: 90,
  });
};
