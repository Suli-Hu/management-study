/**
 * Study session input/patch schemas (v0.5.2 / v0.7.12)
 *
 * 约束对齐 migration 0016 study_session 表的 CHECK 列：
 *   - duration_min ∈ [1, 600]
 *   - rating ∈ [1, 5] | null
 *   - date 'YYYY-MM-DD'，start_time 'HH:mm'
 *
 * note 上限 2000 字（防 D1 行膨胀；UI 一般 ≤ 200 字写不到）。
 *
 * v0.11.x：POST 支持 school_key（学派记账）与 kp_id 二选一。
 */
import { z } from 'zod';

const Date_YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 必须 YYYY-MM-DD');
const Time_HM = z.string().regex(/^\d{2}:\d{2}$/, 'start_time 必须 HH:mm');

const StudySessionInputBase = z
  .object({
    discipline: z.string().min(1).max(60),
    /** 绑知识点（兼容旧客户端）；与 school_key 二选一 */
    kp_id: z.string().min(1).max(60).optional(),
    /** 绑学派（新默认）；与 kp_id 二选一 */
    school_key: z.string().min(1).max(120).optional(),
    date: Date_YMD,
    start_time: Time_HM,
    duration_min: z.number().int().min(1).max(600),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const StudySessionInput = StudySessionInputBase.refine(
  (v) => (Boolean(v.kp_id) && !v.school_key) || (!v.kp_id && Boolean(v.school_key)),
  { message: '必须且仅能指定 kp_id 或 school_key 之一', path: ['kp_id'] },
);

export type StudySessionInput = z.infer<typeof StudySessionInput>;

/**
 * PATCH 不允许改 discipline（防 session 跨学科迁移搞乱段位算法）。
 * 至少 1 个字段。不得同时传 kp_id 与 school_key。
 */
export const StudySessionPatchInput = StudySessionInputBase.omit({ discipline: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'PATCH 至少需要一个字段')
  .refine(
    (v) => !(v.kp_id !== undefined && v.school_key !== undefined),
    { message: '不能同时在 PATCH 中指定 kp_id 与 school_key', path: ['school_key'] },
  );

export type StudySessionPatchInput = z.infer<typeof StudySessionPatchInput>;
