import { z } from 'zod';
import { I18nString, BilingualBody } from './i18n';
import { SchoolKey, KpId, IsoTimestamp, DisciplineKey } from './kp';

/**
 * 学派 — 一个文件 = 一个学派。
 *
 * 文件路径：data/<discipline>/schools/<key>.json
 *
 * concepts[] 是该学派下 KP 的显示顺序（v1 _deltaOrder 等同）。
 */
export const School = z.object({
  key: SchoolKey,
  discipline: DisciplineKey,
  title: I18nString,
  era: z.string().trim().default('').describe('如 "1947– 变革管理理论传统"'),
  summary: BilingualBody,

  /** v1 group 编号 1-12，定义在 v2 是显示分组的 key */
  themeKey: z.string().trim().min(1).describe('归属哪个主题分组，如 "individual" "change" "strategy_internal"'),

  /** 学派代表色 — 必须用 Tailwind config 里 accent.* 之一 */
  accent: z.enum(['ob', 'classic', 'strategy', 'warning']).default('classic'),

  /** 该学派下 KP 的渲染顺序 */
  concepts: z.array(KpId).default([]),

  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).strict();
export type School = z.infer<typeof School>;
