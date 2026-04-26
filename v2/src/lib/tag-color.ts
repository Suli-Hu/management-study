/**
 * tag-color.ts — 单一颜色解析器
 *
 * v0.5.0 标签化重构后，全站颜色规则只有一条：
 *   entity.tags[0] → discipline.tags[].key 查找 → .color
 *
 * 无回退链。tags=[] 或 lookup 失败 → FALLBACK_COLOR。
 */

import type { Tag } from '~/schemas/discipline';

/** 中性灰 fallback（warm taupe，v1 legacy 兜底色） */
export const FALLBACK_COLOR = '#8a7a6a';

/** 解析实体颜色：取 tags[0] 在标签库里的 color，否则 fallback */
export function tagColor(
  entity: { tags?: string[] } | null | undefined,
  library: Tag[] | null | undefined,
): string {
  const primaryKey = entity?.tags?.[0];
  if (!primaryKey || !library?.length) return FALLBACK_COLOR;
  return library.find((t) => t.key === primaryKey)?.color ?? FALLBACK_COLOR;
}

/** 解析标签 key 列表 → 颜色列表（用于 multi-tag chip 渲染） */
export function tagColors(
  tags: string[] | null | undefined,
  library: Tag[] | null | undefined,
): string[] {
  if (!tags?.length || !library?.length) return [];
  return tags
    .map((k) => library.find((t) => t.key === k)?.color)
    .filter((c): c is string => Boolean(c));
}
