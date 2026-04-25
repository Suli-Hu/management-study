/**
 * POST /api/new/kp  (v0.4.4 part 2)
 */

import type { APIRoute } from 'astro';
import { Kp } from '~/schemas/kp';
import { handlePost } from '~/lib/edit-helpers';

export const POST: APIRoute = (ctx) => handlePost({
  ctx,
  schema: Kp,
  pathFor: (obj) => `v2/data/${obj.discipline}/kp/${obj.id}.json`,
  objectLabel: (obj) => `kp/${obj.id}`,
  forceFields: () => {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now } as Partial<typeof Kp._type>;
  },
});
