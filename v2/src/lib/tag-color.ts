/**
 * tag-color.ts — 单一颜色解析器
 *
 * v0.5.0 标签化重构后，全站颜色规则只有一条：
 *   entity.tags[0] → discipline.tags[].key 查找 → .color
 *
 * 无回退链。tags=[] 或 lookup 失败 → FALLBACK_COLOR。
 *
 * v0.8.18 跨 component 一致性：accentVarFor(entity) 返回 v1.0 --tag-* CSS var
 *   — 用户自定义 hex (tagColor) 与 v1.0 token 漂移会导致同 KP 在 split-pane 左右
 *   呈现两种近似但不同的色阶 (oklch vs hex)。chip 2/3/4 凡承担"学派归属"信息维度
 *   的 accent (右栏顶 strip / 左 KP dot / body items numbering / lang-toggle / FAB
 *   / EmptyRight) 全切到 accentVarFor，单一 token 来源。
 */

import type { Tag } from '~/schemas/discipline';
import { hashToTagToken } from './editor/dom-helpers';

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

/**
 * v0.8.18：返回 v1.0 设计系统 --tag-* CSS var (or fallback)。
 *
 * entity.tags[0] → hashToTagToken → "var(--tag-mgmt)" 之类。
 * tags 空 / 缺 → fallback (默认 var(--text-3) 中性灰)。
 *
 * 作为跨 component 一致性入口：右栏顶 strip / lang-toggle --accent / 左 list
 * dot / body items numbering / EmptyRight / LangFab 都该用同一个返回值，确保
 * 同 KP 在 split-pane 左右、同学派 chip / scholar / theme 跨组件呈一致色阶。
 */
export function accentVarFor(
  entity: { tags?: string[] } | null | undefined,
  fallback = 'var(--text-3)',
): string {
  const primary = entity?.tags?.[0];
  return primary ? `var(--${hashToTagToken(primary)})` : fallback;
}
