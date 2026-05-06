/**
 * tag-library.ts — 校验 entity (KP/scholar/school) 的 tags 字段都在 discipline.tags 库里
 *
 * v0.8.37 Phase 3: 配合 v0.8.36 加的 tag CRUD endpoint，禁止再绕过库直接传任意
 * tag string (老师之前 POST /api/kps tags:["Apple"] 类型脏写的根因)。
 *
 * 用法：
 *   const check = await assertTagsInLibrary(db, discipline, input.tags);
 *   if (!check.ok) return { ok: false, status: 422, reason: check.reason, detail: check };
 *
 * 调用方决定是否 422 + 怎么 propagate detail。
 */

export type TagLibraryCheckOk = { ok: true };
export type TagLibraryCheckFail = {
  ok: false;
  reason: 'tag_not_in_library';
  detail: string;
  unknown_keys: string[];
  library_keys: string[];
};
export type TagLibraryCheck = TagLibraryCheckOk | TagLibraryCheckFail;

/**
 * 校验 tags 数组里每个 key 都在 discipline.tags 库里。
 * - tags 空数组 → ok (无可验)
 * - discipline 不存在 → ok (上层会 404 别的检查)
 * - 库 tags_json 解析失败 → 容错为空库；如有任何 incoming key 都报 unknown
 *
 * 返回 unknown_keys 给调用方组装 error response。
 */
export async function assertTagsInLibrary(
  db: D1Database,
  discipline: string,
  tags: readonly string[] | undefined,
): Promise<TagLibraryCheck> {
  if (!tags || tags.length === 0) return { ok: true };

  const row = await db
    .prepare('SELECT tags_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ tags_json: string | null }>();
  let library: string[] = [];
  if (row?.tags_json) {
    try {
      const parsed = JSON.parse(row.tags_json);
      if (Array.isArray(parsed)) {
        library = parsed
          .filter((t): t is { key?: unknown } => typeof t === 'object' && t !== null)
          .map((t) => (typeof t.key === 'string' ? t.key : ''))
          .filter(Boolean);
      }
    } catch {
      // 容错为空库
    }
  }

  const librarySet = new Set(library);
  const unknown = [...new Set(tags)].filter((k) => !librarySet.has(k));
  if (unknown.length === 0) return { ok: true };

  return {
    ok: false,
    reason: 'tag_not_in_library',
    detail:
      `tag key 必须先在标签库注册才能引用。未注册的 key: [${unknown.join(', ')}]。` +
      `库现有 key: [${library.slice(0, 10).join(', ')}${library.length > 10 ? `, ... +${library.length - 10}` : ''}]。` +
      `通过 POST /api/edit/discipline/${discipline}/tags 注册新 tag。`,
    unknown_keys: unknown,
    library_keys: library,
  };
}
