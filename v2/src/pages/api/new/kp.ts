/**
 * POST /api/new/kp  (v0.4.4 part 2)
 */

import type { APIRoute } from 'astro';
import { Kp } from '~/schemas/kp';
import { handlePost } from '~/lib/edit-helpers';
import { upsertKpInD1 } from '~/lib/d1-kp-write';

// v0.5.1：tags 不再从 body 自动推（语义已变 → 颜色标签）；评价存 evalContent 结构化字段
// v0.6.6：D1 双写 — git commit 成功后立即把 KP upsert 到 D1
export const POST: APIRoute = (ctx) => handlePost({
  ctx,
  schema: Kp,
  pathFor: (obj) => `v2/data/${obj.discipline}/kp/${obj.id}.json`,
  objectLabel: (obj) => `kp/${obj.id}`,
  forceFields: () => {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now } as Partial<typeof Kp._type>;
  },
  upsertD1: (db, kp) => upsertKpInD1(db, kp),
});
