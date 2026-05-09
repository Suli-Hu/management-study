import { z } from 'zod';
import { BilingualBody, I18nString } from './i18n';
import { KpId, ScholarKey, SchoolKey } from './kp';

export const ScholarCreateInput = z.object({
  /**
   * v0.8.9: key 改可选 — POST 时 server 端自动从 title.en slugify 生成
   * (PATCH 不需要 key，URL path 已带)。
   */
  key: ScholarKey.optional(),
  name: I18nString,
  schools: z.array(SchoolKey).default([]),
  contribution: BilingualBody,
  institution: z.string().trim().default(''),
  born: z.string().trim().default(''),
  died: z.string().trim().default(''),
  nationality: z.string().trim().default(''),
  flag: z.string().trim().default(''),
  origin: z.string().trim().default(''),
  field: z.string().trim().default(''),
  // v0.12.1: 冷启动允许 tags 为空（discipline.tags 库可能尚未初始化）。
  // 若提供 tag，仍限制最多 1 个（单源色）。
  tags: z.array(z.string()).max(1, '最多 1 个 tag (从 discipline.tags 库选)').default([]),
  nobel: z.object({
    year: z.string(),
    detail: z.string(),
  }).nullable().default(null),
  kpsOrder: z.array(KpId).default([]),
}).strict();

export const ScholarPatchInput = ScholarCreateInput.omit({ key: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'PATCH 至少需要一个字段',
);

export type ScholarCreateInput = z.infer<typeof ScholarCreateInput>;
export type ScholarPatchInput = z.infer<typeof ScholarPatchInput>;
