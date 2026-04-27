import { z } from 'zod';
import { SchoolKey, IsoTimestamp, DisciplineKey } from './kp';

/**
 * View — 学派列表页的"看法"（Notion view / Linear filter 概念）
 *
 * 文件路径：v2/data/<discipline>/views/<id>.json
 *
 * v0.5.66 引入。视图是 PRESENTATIONAL ONLY：
 *   - 决定学派列表页怎么分组、排序、是否进入
 *   - 不修改学派本身（不动 tags/era/concepts/scholar 关联）
 *   - 学者详情、KP 编辑里的"所属学派"全集仍直接读 school 表，与视图无关
 *
 * 当前只支持 manual kind（auto by era/region/method 暂不做）；scope 只支持 public。
 */

export const ViewId = z.string().regex(/^[a-z][a-z0-9_-]*$/, '视图 id 必须小写字母开头 + 字母/数字/下划线/连字符');

export const ViewGroup = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/i, '分组 id 仅允许字母/数字/下划线/连字符'),
  title: z.string().trim().min(1, '分组标题不能为空'),
  flow: z.string().trim().default(''),
  schoolIds: z.array(SchoolKey).default([]),
}).strict();
export type ViewGroup = z.infer<typeof ViewGroup>;

export const View = z.object({
  id: ViewId,
  discipline: DisciplineKey,
  name: z.string().trim().min(1, '视图名称不能为空'),
  jp: z.string().trim().default(''),
  icon: z.string().min(1, '视图必须选一个 emoji'),
  description: z.string().trim().default(''),
  /** 演进主线（可选小字）— 显示在说明区底部 */
  flow: z.string().trim().default(''),
  /** v0.5.66 暂只 public（设计稿 private 走 localStorage 的方案没要） */
  scope: z.literal('public').default('public'),
  /** v0.5.66 暂只 manual（auto by era/region/method 没要） */
  kind: z.literal('manual').default('manual'),
  isDefault: z.boolean().default(false),
  /** 视图 chip 行的排序，越小越靠左；isDefault=true 应永远 position=0 */
  position: z.number().int().nonnegative().default(0),
  groups: z.array(ViewGroup).default([]),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).strict();
export type View = z.infer<typeof View>;
