/**
 * POST /api/new/school  (v0.4.4 part 2)
 */

import type { APIRoute } from 'astro';
import { School } from '~/schemas/school';
import { handlePost } from '~/lib/edit-helpers';

export const POST: APIRoute = (ctx) => handlePost({
  ctx,
  schema: School,
  pathFor: (obj) => `v2/data/${obj.discipline}/schools/${obj.key}.json`,
  objectLabel: (obj) => `school/${obj.key}`,
  forceFields: () => {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now } as Partial<typeof School._type>;
  },
});
