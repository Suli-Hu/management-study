/**
 * Schema for PATCH /api/kps/batch — v0.8.0 Stage 3 hard cut.
 *
 * 与 v0.7.x 关键差异：
 *   - 不再有顶层 `format`（迁到 body.{zh,ja}.format）
 *   - body 是 partial-by-language KpBody（zh / ja 各自整体替换；不能 deep merge KpBody 内部）
 *   - evalContent → evaluations，子 key 英化；evaluations.{zh|ja} 整体替换 KpEvaluationsLang
 *
 * 与单条 PATCH (KpPatchInput) 共用 partial helpers — 同一组 partial-by-language 语义
 * （title/body/evaluations 都是按语种 merge），diff 只在"top-level field 入口必填项"。
 *
 * 详见 v2/public/docs/migration-v0.8.md §5（PATCH 语义）+ §7（错误码）。
 */

import { z } from 'zod';
import {
  KpTitlePartial,
  KpBodyBilingualPartial,
  KpEvaluationsBilingualPartial,
} from './kp-api';
import { KpId, SchoolKey, ScholarKey } from './kp';

export const KpBatchPatchInput = z
  .object({
    title: KpTitlePartial.optional(),
    body: KpBodyBilingualPartial.optional(),
    evaluations: KpEvaluationsBilingualPartial.optional(),
    year: z.string().trim().optional(),
    schools: z.array(SchoolKey).min(1, 'schools 至少 1 个').optional(),
    scholars: z.array(ScholarKey).optional(),
    // v0.12.1: 显式传 tags 时允许 [] 清空；仍限制最多 1 个（单源色）
    tags: z.array(z.string()).max(1, '最多 1 个 tag (从 discipline.tags 库选)').optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'patch 至少需要一个字段');

export const KpBatchUpdateItem = z.object({
  id: KpId,
  ifMatchVersion: z.number().int().nonnegative().optional(),
  patch: KpBatchPatchInput,
});

export const KpBatchRequest = z.object({
  dryRun: z.boolean().default(false),
  updates: z.array(KpBatchUpdateItem),
});

export type KpBatchPatchInput = z.infer<typeof KpBatchPatchInput>;
export type KpBatchUpdateItem = z.infer<typeof KpBatchUpdateItem>;
export type KpBatchRequest = z.infer<typeof KpBatchRequest>;
