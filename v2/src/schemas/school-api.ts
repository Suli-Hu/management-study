import { z } from 'zod';
import { BilingualBody, I18nString } from './i18n';
import { KpId, SchoolKey } from './kp';

export const SchoolCreateInput = z.object({
  /**
   * v0.8.9: key 改可选 — POST 时 server 端自动从 title.en slugify 生成
   * (PATCH 不需要 key，URL path 已带)。
   */
  key: SchoolKey.optional(),
  title: I18nString,
  era: z.string().trim().default(''),
  summary: BilingualBody,
  themeKey: z.string().trim().min(1, 'themeKey 必填'),
  tags: z.array(z.string()).default([]),
  concepts: z.array(KpId).default([]),
}).strict();

export const SchoolPatchInput = SchoolCreateInput.omit({ key: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'PATCH 至少需要一个字段',
);

export type SchoolCreateInput = z.infer<typeof SchoolCreateInput>;
export type SchoolPatchInput = z.infer<typeof SchoolPatchInput>;
