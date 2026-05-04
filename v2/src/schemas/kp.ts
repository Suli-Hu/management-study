import { z } from 'zod';
import { I18nString } from './i18n';
import { KpBody, KpEvaluations } from './kp-body-structured';

/**
 * KP id 格式：小写字母前缀 + 数字。
 * - "k562" (legacy v1 style，迁移期保留)
 * - 未来可加 "m1"（marketing）"f1"（finance）等学科前缀
 *
 * 强制小写 + 至少 1 数字防止 typo。
 */
export const KpId = z.string().regex(/^[a-z]{1,3}\d+$/, 'KP id 必须是小写字母+数字，如 k562 或 m1');

export const SchoolKey  = z.string().regex(/^[a-z][a-z0-9_]*$/, '学派 key 必须是小写蛇形');
export const ScholarKey = z.string().regex(/^[a-z][a-z0-9_]*$/, '学者 key 必须是小写蛇形');
/**
 * 学科 key — slug 格式（小写蛇形）。
 *
 * v0.5.98 起从 enum 改为 regex：让 super-admin 通过 /admin/disciplines UI
 * 即时创建新学科，不再需要改代码 + redeploy。
 *
 * 运行时 cross-ref：写入数据时（API / sync 路径）会校验 discipline 必须
 * 存在于 D1 discipline 表 (scripts/lib/load-data.ts checkAllIssues)。
 */
export const DisciplineKey = z.string()
  .regex(/^[a-z][a-z0-9_]{1,30}$/, '学科 key 必须小写字母开头 + 字母/数字/下划线，长度 2-31')
  .describe('学科 key — 小写蛇形 slug，例 keiei / marketing');

/** ISO 8601 UTC timestamp（如 "2026-04-23T01:00:00.000Z"） */
export const IsoTimestamp = z.string().datetime({ offset: false, message: 'updatedAt 必须是 ISO 8601 UTC（结尾 Z）' });

/**
 * KP（知识点）— 一个文件 = 一个 KP。
 *
 * 文件路径：v2/data/<discipline>/kp/<id>.json
 *
 * v0.8.10 Stage 5 起 schema 完全切 v0.8 shape（PRD §3.1）：
 *   - body.zh / body.ja 是 KpBody discriminated union（5 format 各自结构化），
 *     不再是 string DSL；format 字段在 body 内部
 *   - evaluations 替代 evalContent：6 字段英文 key（meaning/limit/example/...）
 *   - 顶层 format 字段已删（信息冗余于 body.zh.format）
 *
 * 设计原则：
 * 1. 中日同文件（不再 cnKey lookup 跨文件）
 * 2. 每个交叉引用（schools / scholars）必须在对应文件存在 — 由 sync-to-d1 cross-ref 校验
 * 3. updatedAt 必填 — 用于 stale 检测和 D1 sync 增量逻辑
 */
export const Kp = z.object({
  id: KpId,
  discipline: DisciplineKey,
  schools: z.array(SchoolKey).min(1, 'KP 至少属于一个学派'),
  scholars: z.array(ScholarKey).default([]),
  year: z.string().trim().default(''),
  title: I18nString,

  /** v0.8.10：body 完全结构化 — discriminated union by format，5 种 format 各自字段集 */
  body: z.object({
    zh: KpBody,
    ja: KpBody.optional(),
  }).strict(),

  /** 标签 — 引用 discipline.tags[].key；第一个决定 KP 颜色。空 = 中性灰 */
  tags: z.array(z.string()).default([]),

  /** v0.8.10：evaluations 取代旧 evalContent — 6 字段英文 key（meaning/limit/example/response/application/analogy） */
  evaluations: KpEvaluations.optional(),

  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).strict();
export type Kp = z.infer<typeof Kp>;
