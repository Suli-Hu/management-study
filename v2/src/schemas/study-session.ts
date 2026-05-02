/**
 * Study session input/patch schemas (v0.5.2 / v0.7.12)
 *
 * 约束对齐 migration 0016 study_session 表的 CHECK 列：
 *   - duration_min ∈ [1, 600]
 *   - rating ∈ [1, 5] | null
 *   - date 'YYYY-MM-DD'，start_time 'HH:mm'
 *
 * note 上限 2000 字（防 D1 行膨胀；UI 一般 ≤ 200 字写不到）。
 */
import { z } from 'zod';

const Date_YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 必须 YYYY-MM-DD');
const Time_HM = z.string().regex(/^\d{2}:\d{2}$/, 'start_time 必须 HH:mm');

export const StudySessionInput = z.object({
  discipline: z.string().min(1).max(60),
  kp_id: z.string().min(1).max(60),
  date: Date_YMD,
  start_time: Time_HM,
  duration_min: z.number().int().min(1).max(600),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
}).strict();

export type StudySessionInput = z.infer<typeof StudySessionInput>;

/**
 * PATCH 不允许改 discipline（防 session 跨学科迁移搞乱段位算法）。
 * 至少 1 个字段。
 */
export const StudySessionPatchInput = StudySessionInput.omit({ discipline: true })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'PATCH 至少需要一个字段',
  );

export type StudySessionPatchInput = z.infer<typeof StudySessionPatchInput>;
