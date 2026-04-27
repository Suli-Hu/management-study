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
    // v0.5.65: 新建学者就 schoolsExplicit=true（admin 显式选 schools[]）→ sync 不再走 KP 派生
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now, schoolsExplicit: true } as Partial<typeof Scholar._type>;
  },
});
