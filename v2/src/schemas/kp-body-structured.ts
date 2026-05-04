/**
 * KP body 结构化 schema (v0.8.0 重构 — Stage 0 准备)
 *
 * 详细设计见：v2/docs/KP-BODY-STRUCTURED-PRD.md §3.1
 *
 * 核心 invariant：
 *   - body 是 discriminated union by `format`，5 种 format 各自的字段集严格固定
 *   - schema 层就拒绝"format/body 不一致" — 不再依赖 server-side guard
 *   - format 字段在 body 内部（不在 KP 顶层），中日双语理论上可独立指定 format
 *     （产品上强制一致，但 schema 允许灵活）
 *
 * 范围（Stage 0）：
 *   - 仅定义 schema + types
 *   - 不接入 KP zod / 不动 D1 / 不动 API / 不动渲染
 *   - 这些都是后续 Stage 1-5 的事
 */

import { z } from 'zod';

// ============================================================
// 5 种 format 的 body schema
// ============================================================

export const NarrativeBody = z
  .object({
    format: z.literal('narrative'),
    prose: z.string().describe('任意 prose 文本，可含 HTML（如 <strong>、<br>）'),
  })
  .strict();

export const FlatListBody = z
  .object({
    format: z.literal('flat-list'),
    lead: z.string().default('').describe('导语 — 总起一句，可空'),
    items: z
      .array(
        z
          .object({
            name: z.string().min(1, 'item.name 不能为空'),
            desc: z.string().min(1, 'item.desc 不能为空'),
          })
          .strict(),
      )
      .min(1, 'flat-list 至少 1 个 item'),
  })
  .strict();

export const AccordionBody = z
  .object({
    format: z.literal('accordion'),
    lead: z.string().default('').describe('导语'),
    groups: z
      .array(
        z
          .object({
            title: z.string().min(1, 'group.title 不能为空'),
            items: z
              .array(
                z
                  .object({
                    name: z.string().min(1, 'item.name 不能为空'),
                    desc: z.string().default(''),
                  })
                  .strict(),
              )
              .default([]),
          })
          .strict(),
      )
      .min(1, 'accordion 至少 1 个 group'),
  })
  .strict();

export const CompareBody = z
  .object({
    format: z.literal('compare'),
    lead: z.string().default('').describe('导语'),
    cols: z
      .array(
        z
          .object({
            title: z.string().min(1, 'col.title 不能为空'),
            keyword: z.string().default('').describe('关键词标签，2-4 字'),
            desc: z.string().default('').describe('一句话定义对象'),
            type: z.string().default('').describe('类型 / 学派归属'),
            theories: z.string().default('').describe('关联理论列表'),
            detail: z.string().default('').describe('详细描述段落'),
          })
          .strict(),
      )
      .min(2, 'compare 至少 2 列'),
  })
  .strict();

/**
 * 四象限轴 — 拆三字段（v0.8.4 breaking change）。
 *
 * 两种写法：
 *   - 两段（label 空）：low="优势" / high="劣势" → 渲染 "优势-劣势"（SWOT 风）
 *   - 三段（label 非空）：low="低" / label="增长率" / high="高" → 渲染 "低-增长率-高"（BCG 风）
 *
 * 旧 v0.8.3 写法 yAxis: "市场增长率"（单字符串维度名）已废弃；
 * 数据需经 admin migrate-quad-axes endpoint smart split。
 */
export const QuadAxis = z
  .object({
    low: z.string().min(1, '低值不能为空'),
    label: z.string().default(''),
    high: z.string().min(1, '高值不能为空'),
  })
  .strict();

export const QuadBody = z
  .object({
    format: z.literal('quad'),
    lead: z.string().default('').describe('导语'),
    yAxis: QuadAxis.describe('纵轴：低 / (中间维度) / 高'),
    xAxis: QuadAxis.describe('横轴：低 / (中间维度) / 高'),
    cells: z
      .array(
        z
          .object({
            name: z.string().min(1, 'cell.name 不能为空'),
            emoji: z.string().default('').describe('1 个 emoji'),
            sub: z.string().default('').describe('维度组合副标题'),
            detail: z.string().default('').describe('特征 + 战略建议'),
          })
          .strict(),
      )
      .length(4, 'quad 必须正好 4 个 cell（2x2 矩阵）'),
  })
  .strict();

// ============================================================
// 顶层 KpBody discriminated union
// ============================================================

export const KpBody = z.discriminatedUnion('format', [
  NarrativeBody,
  FlatListBody,
  AccordionBody,
  CompareBody,
  QuadBody,
]);

export type KpBody = z.infer<typeof KpBody>;
export type NarrativeBody = z.infer<typeof NarrativeBody>;
export type FlatListBody = z.infer<typeof FlatListBody>;
export type AccordionBody = z.infer<typeof AccordionBody>;
export type CompareBody = z.infer<typeof CompareBody>;
export type QuadBody = z.infer<typeof QuadBody>;
export type QuadAxis = z.infer<typeof QuadAxis>;

// ============================================================
// Evaluations — 6 字段独立顶层
// ============================================================

/** 单语种 evaluations：6 个字段全部可选（不写就不渲染） */
export const KpEvaluationsLang = z
  .object({
    meaning: z.string().default('').describe('义 — 该 KP 的学术 / 实务贡献'),
    limit: z.string().default('').describe('限 — 该 KP 理论的不足 / 边界 / 被批判'),
    example: z.string().default('').describe('例 — 真实企业案例 / 事例'),
    response: z.string().default('').describe('应 — 基于 KP 的应对策略 / 处方'),
    application: z.string().default('').describe('用 — 实务应用场景'),
    analogy: z.string().default('').describe('喻 — 比喻 / 类比记忆'),
  })
  .strict();

/** 双语 evaluations：zh / ja 各一份独立 */
export const KpEvaluations = z
  .object({
    zh: KpEvaluationsLang.optional(),
    ja: KpEvaluationsLang.optional(),
  })
  .strict();

export type KpEvaluations = z.infer<typeof KpEvaluations>;
export type KpEvaluationsLang = z.infer<typeof KpEvaluationsLang>;

// v0.8.10 Stage 5: 旧 KpV08 占位（Stage 0 引入做迁移期 placeholder）已并入
// ./kp.ts 的 Kp schema —— 不再单独 export，避免与真源 Kp 双轨。
