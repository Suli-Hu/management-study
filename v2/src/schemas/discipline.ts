import { z } from 'zod';
import { I18nString } from './i18n';
import { DisciplineKey, IsoTimestamp } from './kp';

/**
 * 学科顶层元信息 — 一个学科一个文件。
 *
 * 文件路径：data/<discipline>/discipline.json
 *
 * v0.5.0 标签化重构：
 *   - 删除 4 选 1 的 accent enum（ob/classic/strategy/warning）
 *   - 标签库 discipline.tags[] 由用户自定义注册
 *   - theme/school/scholar/kp 的颜色由 entity.tags[0] → discipline.tags[].color 解析
 *   - 空 tags = 中性 fallback 灰
 */

/** 标签 — discipline 顶层标签库的一项 */
export const Tag = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, '标签 key 必须小写蛇形'),
  label: I18nString,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色必须是 #RRGGBB'),
});
export type Tag = z.infer<typeof Tag>;

export const ThemeGroup = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: I18nString,
  desc: I18nString.partial().optional().describe('副标题，可选'),
  /** 引用 discipline.tags[].key — 第一个决定卡片色 */
  tags: z.array(z.string()).default([]),
  /** 该主题下显示哪些学派的 key 列表 — 顺序决定首页学派卡片渲染顺序 */
  schools: z.array(z.string()).default([]),
});
export type ThemeGroup = z.infer<typeof ThemeGroup>;

export const Discipline = z.object({
  key: DisciplineKey,
  title: I18nString,
  tagline: I18nString.partial().optional(),

  /** 标签库 — 本学科可用的标签集合，被 theme/school/scholar/kp 引用 */
  tags: z.array(Tag).default([])
    .superRefine((tags, ctx) => {
      const seen = new Set<string>();
      for (const [i, t] of tags.entries()) {
        if (seen.has(t.key)) {
          ctx.addIssue({ code: 'custom', path: [i, 'key'], message: `标签 key 重复："${t.key}"` });
        }
        seen.add(t.key);
      }
    }),

  /** 主题分组 — v1 THEME_ORDER 等价 */
  themes: z.array(ThemeGroup).default([]),

  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).strict();
export type Discipline = z.infer<typeof Discipline>;
