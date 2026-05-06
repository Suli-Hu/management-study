/**
 * /api/edit/discipline/[discipline]/tags
 *
 *   GET  → { tags, base_sha?, ref_counts, source: 'd1' | 'git' }
 *   POST body: { label: { zh, ja?, en? }, color: '#RRGGBB' }
 *        → { tag: Tag, source: 'd1' } (server 自动生成 key)
 *   PUT  body: { tags: Tag[], base_sha } → 全量替换 (legacy, git+D1 双写)
 *
 *   v0.5.18 GET/PUT initial.
 *   v0.8.36 GET 切 D1 read 优先 (v0.8.27 后 D1 是真值源)；
 *            POST 单个 tag 创建 (D1 only)，返回 server 生成的 key。
 *            PUT 保留向后兼容 (admin tags page 全量保存 UI 用)。
 *
 * 单个 PATCH/DELETE 见 ./[tagKey].ts。
 * 一次性清空所有 KP 引用见 ../clear-kp-tags.ts。
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

/** v0.8.36: D1 直读 discipline.tags_json — 真值源 */
async function loadTagsFromD1(
  db: D1Database,
  discipline: string,
): Promise<Tag[] | null> {
  const row = await db
    .prepare('SELECT tags_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ tags_json: string | null }>();
  if (!row) return null;
  let raw: unknown;
  try { raw = JSON.parse(row.tags_json ?? '[]'); }
  catch { return null; }
  if (!Array.isArray(raw)) return null;
  // 验证每条 (D1 数据可能含老师脏写)
  const valid: Tag[] = [];
  for (const t of raw) {
    const parsed = Tag.safeParse(t);
    if (parsed.success) valid.push(parsed.data);
  }
  return valid;
}

/** v0.8.36: D1 写 discipline.tags_json — 不写 git (v0.8.27) */
async function writeTagsToD1(
  db: D1Database,
  discipline: string,
  tags: Tag[],
): Promise<void> {
  await db
    .prepare('UPDATE discipline SET tags_json = ?, updated_at = ? WHERE key = ?')
    .bind(JSON.stringify(tags), new Date().toISOString(), discipline)
    .run();
}

/** v0.8.36: 自动生成 tag key — `t_${8 hex}`，匹配 schema regex /^[a-z][a-z0-9_]*$/ */
function genTagKey(): string {
  return `t_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/** 数 D1 里 entity.tags_json 引用某 tag key 的次数（school/scholar/kp 累加） */
async function countRefs(db: D1Database, discipline: string, tagKey: string): Promise<number> {
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

// ============================================================
// GET — D1 read 优先 (v0.8.36)
// ============================================================
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  const discipline = params.discipline;
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const db = getDb(env);
  const d1Tags = await loadTagsFromD1(db, discipline);

  // base_sha 仍取自 git (PUT 全量保存仍需 sha 校验，向后兼容)。
  // git fetch 失败不阻断 GET — admin UI 改用 D1 优先后可不依赖 base_sha。
  let baseSha: string | undefined;
  if (env.GITHUB_PAT && env.GITHUB_REPO) {
    const fetched = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, `v2/data/${discipline}/discipline.json`);
    if (fetched.ok) baseSha = fetched.data.sha;
  }

  const tags = d1Tags ?? [];
  const ref_counts = await countAllRefs(db, discipline, tags);

  return jsonRes(200, { ok: true, source: 'd1', tags, base_sha: baseSha, ref_counts });
};

// ============================================================
// POST — 创建单个 tag (D1 only, v0.8.36)
// ============================================================
const PostBody = z.object({
  label: z.object({
    zh: z.string().trim().min(1, 'label.zh 必填'),
    ja: z.string().trim().min(1).optional(),
    en: z.string().trim().min(1).optional(),
  }),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色必须是 #RRGGBB hex'),
});

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  const discipline = params.discipline;
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }
  const body = PostBody.safeParse(raw);
  if (!body.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: body.error.issues });

  const db = getDb(env);
  const existing = (await loadTagsFromD1(db, discipline)) ?? [];

  // 生成不冲突的 key (10 retry，几乎不会撞)
  let key = genTagKey();
  const existingKeys = new Set(existing.map((t) => t.key));
  for (let i = 0; existingKeys.has(key) && i < 10; i++) key = genTagKey();
  if (existingKeys.has(key)) {
    return jsonRes(500, { ok: false, reason: 'key_collision' as const, detail: 'failed to generate unique key after 10 tries' });
  }

  const newTag: Tag = {
    key,
    label: body.data.label,
    color: body.data.color,
  };
  const next = [...existing, newTag];
  try { await writeTagsToD1(db, discipline, next); }
  catch (e) {
    return jsonRes(500, { ok: false, reason: 'd1_write_failed' as const, detail: (e as Error).message });
  }

  return jsonRes(201, { ok: true, tag: newTag, source: 'd1' });
};

// ============================================================
// PUT — 全量替换 (legacy, git+D1 双写, 向后兼容 admin tags page UI)
// ============================================================
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

  const tagsSchema = Discipline.shape.tags;
  const validated = tagsSchema.safeParse(body.data.tags);
  if (!validated.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: validated.error.issues });

  const loaded = await loadDiscipline(env, discipline);
  if (loaded.error) return loaded.error;
  const { disc, sha, path } = loaded;
  if (sha !== body.data.base_sha) {
    return jsonRes<EditError>(409, { ok: false, reason: 'sha_conflict', current_sha: sha });
  }

  // has_dependents check (D1 真值源)
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
