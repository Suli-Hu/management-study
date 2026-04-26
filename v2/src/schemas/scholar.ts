import { z } from 'zod';
import { I18nString, BilingualBody } from './i18n';
import { ScholarKey, SchoolKey, IsoTimestamp, DisciplineKey } from './kp';

/**
 * 学者 — 一个文件 = 一个学者。
 *
 * 文件路径：data/<discipline>/scholars/<key>.json
 *
 * 跨学科学者：可在多个 discipline 下复制（少见，简化处理 —— 不做共享 scholar 表）
 */
export const Scholar = z.object({
  key: ScholarKey,
  discipline: DisciplineKey,
  name: I18nString,
  schools: z.array(SchoolKey).default([]).describe('属于哪些学派 — 可空（独立学者）'),
  contribution: BilingualBody,
  lifespan: z.string().trim().default('').describe('合并展示兜底；优先用 born/died'),
  institution: z.string().trim().default('').describe('代表性机构，如 "Harvard Business School"'),

  // v0.3.12: 100% 对齐 v1 SCHOLARS 字段
  born: z.string().trim().default('').describe('生年，如 "1890年9月9日"'),
  died: z.string().trim().default('').describe('卒年。在世为空'),
  nationality: z.string().trim().default('').describe('国籍，如 "德国/美国"'),
  flag: z.string().trim().default('').describe('国旗 emoji，如 "🇩🇪 🇺🇸"'),
  origin: z.string().trim().default('').describe('出身/籍贯'),
  field: z.string().trim().default('').describe('研究领域 badge，如 "社会心理学 · 组织变革"'),

  /** 标签 — 引用 discipline.tags[].key；第一个决定学者卡片色。空 = 中性灰 */
  tags: z.array(z.string()).default([]),

  /** 诺贝尔奖（可选） */
  nobel: z.object({
    year: z.string(),
    detail: z.string(),
  }).nullable().default(null),

  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).strict();
export type Scholar = z.infer<typeof Scholar>;
