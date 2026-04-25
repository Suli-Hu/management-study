/**
 * POST /api/new/kp  (v0.4.4 part 2)
 */

import type { APIRoute } from 'astro';
import { Kp } from '~/schemas/kp';
import { handlePost } from '~/lib/edit-helpers';
import { deriveTagsFromBody } from '~/lib/body-parser';

export const POST: APIRoute = (ctx) => handlePost({
  ctx,
  schema: Kp,
  pathFor: (obj) => `v2/data/${obj.discipline}/kp/${obj.id}.json`,
  objectLabel: (obj) => `kp/${obj.id}`,
  forceFields: (obj) => {
    const now = new Date().toISOString();
    return {
      createdAt: now,
      updatedAt: now,
      // v0.4.9 tags 服务端从 body 自动推
      tags: deriveTagsFromBody(obj.body.zh ?? '', obj.format),
    } as Partial<typeof Kp._type>;
  },
});
