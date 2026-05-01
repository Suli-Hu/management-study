import { z } from 'zod';
import { SchoolKey } from './kp';
import { ViewGroup, ViewId } from './view';

export const ViewCreateInput = z.object({
  id: ViewId,
  name: z.string().trim().min(1, '视图名称不能为空'),
  jp: z.string().trim().default(''),
  icon: z.string().min(1, '视图必须选一个 emoji'),
  description: z.string().trim().default(''),
  flow: z.string().trim().default(''),
  scope: z.literal('public').default('public'),
  kind: z.literal('manual').default('manual'),
  isDefault: z.boolean().default(false),
  position: z.number().int().nonnegative().default(0),
  groups: z.array(ViewGroup).default([]),
}).strict();

export const ViewPatchInput = ViewCreateInput.omit({ id: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'PATCH 至少需要一个字段',
);

export const ViewReorderInput = z.object({
  viewIds: z.array(ViewId).min(1),
  defaultViewId: ViewId.optional(),
}).strict();

export type ViewCreateInput = z.infer<typeof ViewCreateInput>;
export type ViewPatchInput = z.infer<typeof ViewPatchInput>;
export type ViewReorderInput = z.infer<typeof ViewReorderInput>;

export function schoolIdsFromGroups(groups: Array<{ schoolIds?: string[] }>): string[] {
  return [...new Set(groups.flatMap((group) => group.schoolIds ?? []))] as z.infer<typeof SchoolKey>[];
}
