/**
 * /api/edit/discipline/[discipline]/tags
 *
 *   GET  → { tags, base_sha?, ref_counts, source: 'd1' | 'git' }
 *   POST body: { label: { zh, ja?, en? }, color: '#RRGGBB' }
 *        → { tag: Tag, source: 'd1' } (server 自动生成 key)
 *   PUT  body: { tags: Tag[], base_sha? } → 全量替换
 *
 *   v0.5.18 GET/PUT initial.
 *   v0.8.36 GET 切 D1 read 优先 (v0.8.27 后 D1 是真值源)；
 *            POST 单个 tag 创建 (D1 only)，返回 server 生成的 key。
 *            PUT 旧实现是 git+D1 双写；v0.12.0+ 改为 D1-only（不再依赖 GitHub/base_sha）。
 *
 * 单个 PATCH/DELETE 见 ./[tagKey].ts。
 * 一次性清空所有 KP 引用见 ../clear-kp-tags.ts。
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { getDb } from '~/lib/db';
import { Discipline, Tag } from '~/schemas/discipline';

type LoadResult =
  | { error: Response; disc?: never; sha?: never; path?: never }
  | { error?: never; disc: ReturnType<typeof Discipline.parse>; sha: string; path: string };

async function loadDiscipline(env: any, discipline: string): Promise<LoadResult> {
  // Legacy helper kept for historical reference; GitHub is no longer a dependency for tags.
  return {
    error: jsonRes<EditError>(410, {
      ok: false,
      reason: 'gone' as never,
      detail: 'GitHub-backed discipline.json is deprecated for tags; use D1 tags_json as source of truth.',
    }),
  };
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
  // IMPORTANT: don't use `LIKE` on JSON strings — it can false-match (e.g. "t_abc" matches "t_abc1").
  // Use json_each() for exact membership checks.
  const sql = `
    SELECT
      (SELECT COUNT(*)
         FROM school s, json_each(s.tags_json) je
        WHERE s.discipline = ?1 AND je.value = ?2) +
      (SELECT COUNT(*)
         FROM scholar sc, json_each(sc.tags_json) je
        WHERE sc.discipline = ?1 AND je.value = ?2) +
      (SELECT COUNT(*)
         FROM kp k, json_each(k.tags_json) je
        WHERE k.discipline = ?1 AND je.value = ?2) AS n
  `;
  const row = await db.prepare(sql).bind(discipline, tagKey).first<{ n: number }>();
  return row?.n ?? 0;
}

async function countAllRefs(
  db: D1Database,
  discipline: string,
  tags: ReadonlyArray<{ key: string }>,
): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(tags.map((t) => [t.key, 0]));
  const keys = tags.map((t) => t.key);
  if (keys.length === 0) return out;

  const placeholders = keys.map(() => '?').join(', ');
  const sql = `
    SELECT k, SUM(n) AS n
    FROM (
      SELECT je.value AS k, COUNT(*) AS n
        FROM school s, json_each(s.tags_json) je
       WHERE s.discipline = ? AND je.value IN (${placeholders})
       GROUP BY je.value
      UNION ALL
      SELECT je.value AS k, COUNT(*) AS n
        FROM scholar sc, json_each(sc.tags_json) je
       WHERE sc.discipline = ? AND je.value IN (${placeholders})
       GROUP BY je.value
      UNION ALL
      SELECT je.value AS k, COUNT(*) AS n
        FROM kp k, json_each(k.tags_json) je
       WHERE k.discipline = ? AND je.value IN (${placeholders})
       GROUP BY je.value
    )
    GROUP BY k
  `;
  const rows = await db
    .prepare(sql)
    .bind(
      discipline, ...keys,
      discipline, ...keys,
      discipline, ...keys,
    )
    .all<{ k: string; n: number }>();

  for (const r of rows.results ?? []) {
    if (typeof r?.k === 'string') out[r.k] = typeof r.n === 'number' ? r.n : 0;
  }
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

  const tags = d1Tags ?? [];
  const ref_counts = await countAllRefs(db, discipline, tags);

  return jsonRes(200, { ok: true, source: 'd1', tags, ref_counts });
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
// PUT — 全量替换 (D1-only)
// ============================================================
const PutBody = z.object({
  tags: z.array(Tag),
  base_sha: z.string().min(1).optional(),
});

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  const env = locals.runtime.env;
  // v0.12.0+: 不再依赖 GitHub env。只要 D1 绑定即可。
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = params.discipline;
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' }); }
  const body = PutBody.safeParse(raw);
  if (!body.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: body.error.issues });

  // 额外 schema guard：确保 tags 满足 discipline.tags schema（和旧实现一致）
  const tagsSchema = Discipline.shape.tags;
  const validated = tagsSchema.safeParse(body.data.tags);
  if (!validated.success) return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: validated.error.issues });

  const db = getDb(env);
  const existing = await loadTagsFromD1(db, discipline);
  if (existing === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} not found` });

  // has_dependents check (D1 真值源)
  const oldKeys = new Set(existing.map((t) => t.key));
  const newKeys = new Set(validated.data.map((t) => t.key));
  const removedKeys = [...oldKeys].filter((k) => !newKeys.has(k));
  if (removedKeys.length > 0) {
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

  try {
    await writeTagsToD1(db, discipline, validated.data);
  } catch (e) {
    return jsonRes(500, { ok: false, reason: 'd1_write_failed' as const, detail: (e as Error).message });
  }

  const ref_counts = await countAllRefs(db, discipline, validated.data);

  return jsonRes(200, { ok: true, source: 'd1', tags: validated.data, ref_counts });
};
