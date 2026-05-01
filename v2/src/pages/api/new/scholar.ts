/**
 * POST /api/new/scholar  (v0.4.4 part 2)
 *
 * @deprecated Use POST /api/scholars?discipline=<key>. The API-first route
 * writes directly to D1 and enforces tenant membership server-side.
 */

import type { APIRoute } from 'astro';
import { Scholar } from '~/schemas/scholar';
import { handlePost } from '~/lib/edit-helpers';
import { upsertScholarInD1 } from '~/lib/d1-scholar-write';

const deprecate = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set('deprecation', 'true');
  headers.set('link', '</api/scholars>; rel="successor-version"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const POST: APIRoute = async (ctx) => deprecate(await handlePost({
  ctx,
  schema: Scholar,
  pathFor: (obj) => `v2/data/${obj.discipline}/scholars/${obj.key}.json`,
  objectLabel: (obj) => `scholar/${obj.key}`,
  forceFields: () => {
    // v0.5.65: 新建学者就 schoolsExplicit=true（admin 显式选 schools[]）→ sync 不再走 KP 派生
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now, schoolsExplicit: true } as Partial<typeof Scholar._type>;
  },
  upsertD1: (db, scholar) => upsertScholarInD1(db, scholar),
}));
