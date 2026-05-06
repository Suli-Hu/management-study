/**
 * v0.8.0 Stage 3 KP API contract — hard cut.
 *
 * 关键变化（详 v2/public/docs/migration-v0.8.md §1-§5）：
 *   - 顶层 `format` 字段移除（迁到 body.{zh,ja}.format）
 *   - body.zh / body.ja 从 string DSL 改为 KpBody discriminated union
 *   - evalContent → evaluations，6 子 key 改英文（meaning/limit/...）
 *   - body 内不允许 ◆评价—— 段（必须独立写到 evaluations 字段）
 *
 * 旧 contract 输入 (string body / 顶层 format / evalContent) 由 kp-legacy-detector
 * 在 zod parse 之前识别并返 422 + 明确 reason；不在本 schema 里做 union 兼容
 * （PM 决策见 migration-v0.8.md §7）。
 *
 * PATCH 语义（single + batch 共用，详 migration-v0.8.md §5.2）：
 *   - title 按语种 shallow merge（zh/ja/en 各自独立替换）
 *   - body 按语种 shallow merge（zh/ja 各自整体替换；单语种内部不再 merge）
 *   - evaluations 按语种 shallow merge（zh/ja 各自整体替换 KpEvaluationsLang Record）
 *   - 数组 schools/scholars/tags 整体替换；空数组 = 真清空
 */

import { z } from 'zod';
import { KpBody, KpEvaluationsLang } from './kp-body-structured';
import { I18nString } from './i18n';
import { KpId, SchoolKey, ScholarKey } from './kp';

/**
 * @deprecated v0.8.0 起 format 在 body.{zh,ja}.format 内，不再有顶层 enum。
 *   保留 export 让旧引用过渡期不爆，但请改用 KpBody 自带的 format literal。
 */
export const KpFormat = z.enum(['narrative', 'flat-list', 'accordion', 'compare', 'quad']);

const KpBodyBilingual = z
  .object({
    zh: KpBody,
    ja: KpBody.optional(),
  })
  .strict()
  .refine(
    (b) => b.ja === undefined || b.zh.format === b.ja.format,
    {
      message: 'body.zh.format 与 body.ja.format 必须一致（v0.8.2 F5 强制）',
      path: ['ja', 'format'],
    },
  );

const KpEvaluationsBilingual = z
  .object({
    zh: KpEvaluationsLang.optional(),
    ja: KpEvaluationsLang.optional(),
  })
  .strict();

// === PATCH partial-by-language schemas ===

const TitlePartial = z
  .object({
    zh: z.string().trim().min(1).optional(),
    ja: z.string().trim().min(1).optional(),
    en: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'title 至少传 1 个语种');

const KpBodyBilingualPartial = z
  .object({
    zh: KpBody.optional(),
    ja: KpBody.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'body 至少传 1 个语种')
  .refine(
    (v) => v.zh === undefined || v.ja === undefined || v.zh.format === v.ja.format,
    {
      message: 'body.zh.format 与 body.ja.format 必须一致（v0.8.2 F5 强制）',
      path: ['ja', 'format'],
    },
  );

const KpEvaluationsBilingualPartial = z
  .object({
    zh: KpEvaluationsLang.optional(),
    ja: KpEvaluationsLang.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'evaluations 至少传 1 个语种');

// === POST：完整 create input ===

export const KpCreateInput = z
  .object({
    id: KpId.optional(),
    title: I18nString,
    body: KpBodyBilingual,
    evaluations: KpEvaluationsBilingual.optional(),
    year: z.string().trim().default(''),
    schools: z.array(SchoolKey).min(1, 'KP 至少属于一个学派'),
    scholars: z.array(ScholarKey).default([]),
    // v0.9.0 Stage C-1: 强制 1 个 tag (Q2=① 单 tag 单源色); assertTagsInLibrary 兜底库内校验
    tags: z.array(z.string()).length(1, '必须 1 个 tag (从 discipline.tags 库选)'),
  })
  .strict();

// === PATCH：partial-by-language ===

export const KpPatchInput = z
  .object({
    title: TitlePartial.optional(),
    body: KpBodyBilingualPartial.optional(),
    evaluations: KpEvaluationsBilingualPartial.optional(),
    year: z.string().trim().optional(),
    schools: z.array(SchoolKey).min(1, 'schools 至少 1 个').optional(),
    scholars: z.array(ScholarKey).optional(),
    // v0.9.0 Stage C-1: 显式传 tags 时必须 1 个；缺省 = 保留原值；不允许 tags=[] 清空
    tags: z.array(z.string()).length(1, '必须 1 个 tag (从 discipline.tags 库选)').optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'PATCH 至少需要一个字段');

export type KpCreateInput = z.infer<typeof KpCreateInput>;
export type KpPatchInput = z.infer<typeof KpPatchInput>;

// 复用给 batch schema (kp-batch-api.ts)
export {
  TitlePartial as KpTitlePartial,
  KpBodyBilingualPartial,
  KpEvaluationsBilingualPartial,
};
