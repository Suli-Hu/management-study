/**
 * POST /api/new/school  (v0.4.4 part 2)
 *
 * @deprecated Use POST /api/schools?discipline=<key>. The API-first route writes
 * directly to D1 and enforces tenant membership server-side.
 */

import type { APIRoute } from 'astro';
import { School } from '~/schemas/school';
import { handlePost } from '~/lib/edit-helpers';

const deprecate = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set('deprecation', 'true');
  headers.set('link', '</api/schools>; rel="successor-version"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const POST: APIRoute = async (ctx) => deprecate(await handlePost({
  ctx,
  schema: School,
  pathFor: (obj) => `v2/data/${obj.discipline}/schools/${obj.key}.json`,
  objectLabel: (obj) => `school/${obj.key}`,
  forceFields: () => {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now } as Partial<typeof School._type>;
  },
}));
