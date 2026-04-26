import { z } from 'zod';
import { I18nString, BilingualBody } from './i18n';
import { EVAL_GLYPHS } from '../lib/eval-tag-defs';

/** 评价内容 — glyph → 文本（HTML 允许）。zh / ja 各一份 */
const EvalContentDict = z.object(
  Object.fromEntries(EVAL_GLYPHS.map((g) => [g, z.string()])) as Record<string, z.ZodString>,
).partial();
const EvalContentBilingual = z.object({
  zh: EvalContentDict.optional(),
  ja: EvalContentDict.optional(),
}).strict();

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
export const DisciplineKey = z.enum(['keiei', 'marketing', 'finance', 'hr', 'strategy_g', 'org_g', 'other'])
  .describe('学科 key — 新增学科时在这里加 enum 值');

/** ISO 8601 UTC timestamp（如 "2026-04-23T01:00:00.000Z"） */
export const IsoTimestamp = z.string().datetime({ offset: false, message: 'updatedAt 必须是 ISO 8601 UTC（结尾 Z）' });

/**
 * KP（知识点）— 一个文件 = 一个 KP。
 *
 * 文件路径：data/<discipline>/kp/<id>.json
 *
 * 设计原则：
 * 1. 中日同文件（不再 cnKey lookup 跨文件，杜绝 v1 那类 bug）
 * 2. 每个交叉引用（schools / scholars）必须在对应文件存在 — 由回归测试 cross-ref 校验
 * 3. updatedAt 必填 — 用于 stale 检测和 D1 sync 增量逻辑
 */
export const Kp = z.object({
  id: KpId,
  discipline: DisciplineKey,
  schools: z.array(SchoolKey).min(1, 'KP 至少属于一个学派'),
  scholars: z.array(ScholarKey).default([]),
  year: z.string().trim().default(''),
  title: I18nString,
  body: BilingualBody,

  /** 标签 — 引用 discipline.tags[].key；第一个决定 KP 颜色。空 = 中性灰
   *  v0.5.0 起语义彻底换：从 body 标记可见性（义/限/例…）→ 颜色标签 */
  tags: z.array(z.string()).default([]),

  /** UI 渲染相关的 hint（可选） */
  format: z.enum(['narrative', 'flat-list', 'accordion', 'compare', 'quad']).default('narrative')
    .describe('正文渲染格式提示 — 见 v1 CONTRIBUTING §1'),

  /** v0.5.1 评价内容结构化 — 义/限/例/应/用/喻 → 文本（中日各一份）
   *  老数据通过 scripts/extract-eval-from-body.ts 一次性迁移注入；
   *  新写入由编辑器直接结构化保存，不再混入 body */
  evalContent: EvalContentBilingual.optional(),

  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).strict();
export type Kp = z.infer<typeof Kp>;
