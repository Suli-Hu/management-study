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
  // v0.9.0 Stage C-1: 强制 1 个 tag (Q2=① 单 tag 单源色); assertTagsInLibrary 兜底库内校验
  tags: z.array(z.string()).length(1, '必须 1 个 tag (从 discipline.tags 库选)'),
  concepts: z.array(KpId).default([]),
}).strict();

// PATCH partial：tags 缺省 = 不动；显式传必须 length===1 (length(1) refinement 在 partial 后仍生效)
export const SchoolPatchInput = SchoolCreateInput.omit({ key: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'PATCH 至少需要一个字段',
);

export type SchoolCreateInput = z.infer<typeof SchoolCreateInput>;
export type SchoolPatchInput = z.infer<typeof SchoolPatchInput>;
