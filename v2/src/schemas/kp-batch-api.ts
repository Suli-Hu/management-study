/**
 * Schema for PATCH /api/kps/batch (v0.7.35).
 *
 * 与 KpPatchInput 的关键区别：title/body/evalContent 是 partial-shallow-mergeable
 *   - title 允许只传 { zh } 而不带 ja/en；服务端 shallow merge 与原值
 *   - body 同
 *   - evalContent 允许只传 { zh } 或 { ja }；zh/ja 各自的 Record 是整体替换
 *
 * 这套语义独立于现有 KpPatchInput（单条 PATCH 仍然是整体替换）。
 * 详见 v2/docs/BATCH-KP-EDIT-PRD.md §3.2。
 */

import { z } from 'zod';
import { KpFormat } from './kp-api';
import { KpId, SchoolKey, ScholarKey } from './kp';

const TitlePartial = z
  .object({
    zh: z.string().optional(),
    ja: z.string().optional(),
    en: z.string().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'title 至少传 1 个语种');

const BodyPartial = z
  .object({
    zh: z.string().optional(),
    ja: z.string().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'body 至少传 1 个语种');

const EvalContentPartial = z
  .object({
    zh: z.record(z.string()).optional(),
    ja: z.record(z.string()).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'evalContent 至少传 1 个语种');

export const KpBatchPatchInput = z
  .object({
    title: TitlePartial.optional(),
    body: BodyPartial.optional(),
    format: KpFormat.optional(),
    year: z.string().trim().optional(),
    schools: z.array(SchoolKey).min(1, 'schools 至少 1 个').optional(),
    scholars: z.array(ScholarKey).optional(),
    tags: z.array(z.string()).optional(),
    evalContent: EvalContentPartial.optional(),
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
