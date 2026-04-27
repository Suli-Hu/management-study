/**
 * POST /api/new/view  (v0.5.66)
 *
 * 新建视图。前端创建抽屉构造 View JSON 后 POST 这里。
 *
 * isDefault 由 schema 默认 false。要把现有视图换成默认，走另一条 reorder/promote API（暂未实现）。
 */

import type { APIRoute } from 'astro';
import { View } from '~/schemas/view';
import { handlePost } from '~/lib/edit-helpers';

export const POST: APIRoute = (ctx) => handlePost({
  ctx,
  schema: View,
  pathFor: (obj) => `v2/data/${obj.discipline}/views/${obj.id}.json`,
  objectLabel: (obj) => `view/${obj.discipline}/${obj.id}`,
  forceFields: () => {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now } as Partial<typeof View._type>;
  },
});
