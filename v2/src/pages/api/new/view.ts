/**
 * POST /api/new/view  (v0.5.66)
 *
 * 新建视图。前端创建抽屉构造 View JSON 后 POST 这里。
 *
 * isDefault 由 schema 默认 false。要把现有视图换成默认，走另一条 reorder/promote API（暂未实现）。
 *
 * @deprecated Use POST /api/views?discipline=<key>. The API-first route writes
 * directly to D1 and enforces tenant membership server-side.
 */

import type { APIRoute } from 'astro';
import { View } from '~/schemas/view';
import { handlePost } from '~/lib/edit-helpers';
import { upsertViewInD1 } from '~/lib/d1-view-write';

const deprecate = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set('deprecation', 'true');
  headers.set('link', '</api/views>; rel="successor-version"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const POST: APIRoute = async (ctx) => deprecate(await handlePost({
  ctx,
  schema: View,
  pathFor: (obj) => `v2/data/${obj.discipline}/views/${obj.id}.json`,
  objectLabel: (obj) => `view/${obj.discipline}/${obj.id}`,
  forceFields: () => {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now } as Partial<typeof View._type>;
  },
  upsertD1: (db, view) => upsertViewInD1(db, view),
}));
