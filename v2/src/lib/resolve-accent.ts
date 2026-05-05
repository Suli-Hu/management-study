/**
 * resolve-accent.ts — page chrome accent 解析器 (v0.8.20)
 *
 * v0.8.12 起的 hashToTagToken 路径错把 school.key hash 到 8 个 v1.0 OKLCH
 * --tag-* token，完全 ignore 用户在 discipline.tags 里维护的真实 hex。
 * personality 学派 tags=['t_ejbdv3'] → discipline.tags['t_ejbdv3'].color='#10B981'
 * 应该是绿，hash 给的是 tag-orange。
 *
 * v1.0 IMPLEMENTATION.md L3 "tag 色：永不动" — discipline.tags[].color 是
 * user-defined hex，不强制 mapping 到 8 OKLCH token，直接用 hex 渲染合规
 * (oklch `from <hex> l c h / alpha` syntax 支持任意 hex)。
 *
 * 用法：page chrome accent (学派 / 学者 detail 页右栏顶 strip / SchoolCard chip)
 *   inline style={`--accent: ${hex}`}, CSS 用 oklch(from var(--accent) ...)。
 */

export interface DisciplineTagsLookup {
  tags: Array<{ key: string; color: string }>;
}

export interface SchoolWithTags {
  tags?: string[];
}

/**
 * 拿 school 的 page chrome accent hex.
 * 1. school.tags[0] → discipline.tags[key].color (user-defined hex like #10B981)
 * 2. fallback: 'var(--text-3)' 中性 — 没填 tag 的 school
 */
export function resolveAccentForSchool(
  school: SchoolWithTags,
  discipline: DisciplineTagsLookup,
): string {
  const tagKey = school.tags?.[0];
  if (!tagKey) return 'var(--text-3)';
  const tag = discipline.tags?.find((t) => t.key === tagKey);
  if (!tag?.color) return 'var(--text-3)';
  return tag.color;
}
