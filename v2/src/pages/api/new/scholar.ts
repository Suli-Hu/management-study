/**
 * POST /api/new/scholar  (v0.4.4 part 2)
 */

import type { APIRoute } from 'astro';
import { Scholar } from '~/schemas/scholar';
import { handlePost } from '~/lib/edit-helpers';

export const POST: APIRoute = (ctx) => handlePost({
  ctx,
  schema: Scholar,
  pathFor: (obj) => `v2/data/${obj.discipline}/scholars/${obj.key}.json`,
  objectLabel: (obj) => `scholar/${obj.key}`,
  forceFields: () => {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now } as Partial<typeof Scholar._type>;
  },
});
