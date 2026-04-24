import { z } from 'zod';
import { I18nString } from './i18n';
import { DisciplineKey, IsoTimestamp } from './kp';

/**
 * 学科顶层元信息 — 一个学科一个文件。
 *
 * 文件路径：data/<discipline>/discipline.json
 */
export const ThemeGroup = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: I18nString,
  desc: I18nString.partial().optional().describe('副标题，可选'),
  accent: z.enum(['ob', 'classic', 'strategy', 'warning']),
  /** 该主题下显示哪些学派的 key 列表 — 顺序决定首页学派卡片渲染顺序 */
  schools: z.array(z.string()).default([]),
});
export type ThemeGroup = z.infer<typeof ThemeGroup>;

export const Discipline = z.object({
  key: DisciplineKey,
  title: I18nString,
  tagline: I18nString.partial().optional(),
  accent: z.enum(['ob', 'classic', 'strategy', 'warning']),

  /** 主题分组 — v1 THEME_ORDER 等价 */
  themes: z.array(ThemeGroup).default([]),

  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).strict();
export type Discipline = z.infer<typeof Discipline>;
