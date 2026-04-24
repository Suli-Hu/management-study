import { z } from 'zod';

/**
 * 三语字符串 — 中文必填，日文/英文可选（可在 W3 加付费用户翻译时补全）
 *
 * 用 trim() + min(1) 拒绝空白字符串。
 */
export const I18nString = z.object({
  zh: z.string().trim().min(1, 'zh 必填'),
  ja: z.string().trim().min(1).optional(),
  en: z.string().trim().min(1).optional(),
});
export type I18nString = z.infer<typeof I18nString>;

/** 中文必填的双语 body（zh + ja，无 en —— body 不译英）*/
export const BilingualBody = z.object({
  zh: z.string().trim().min(1),
  ja: z.string().trim().min(1).optional(),
});
export type BilingualBody = z.infer<typeof BilingualBody>;
