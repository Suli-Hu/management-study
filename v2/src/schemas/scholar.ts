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
  schools: z.array(SchoolKey).min(1).describe('属于哪些学派 — 第一个决定学者卡片 accent 色'),
  contribution: BilingualBody,
  lifespan: z.string().trim().default('').describe('如 "1947–" 或 "1916–2008"'),
  institution: z.string().trim().default('').describe('代表性机构，如 "Harvard Business School"'),

  /** 诺贝尔奖（可选） */
  nobel: z.object({
    year: z.string(),
    detail: z.string(),
  }).nullable().default(null),

  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).strict();
export type Scholar = z.infer<typeof Scholar>;
