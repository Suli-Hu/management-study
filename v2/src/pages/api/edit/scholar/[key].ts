/**
 * GET / PUT / DELETE /api/edit/scholar/:key  (v0.4.4 part 1)
 */

import type { APIRoute } from 'astro';
import { Scholar } from '~/schemas/scholar';
import { handleGet, handlePut, handleDelete } from '~/lib/edit-helpers';

const pathFor = (key: string, discipline: string) => `v2/data/${discipline}/scholars/${key}.json`;

const resolveDiscipline = async (key: string, db: any): Promise<string | null> => {
  const row = await db.prepare('SELECT discipline FROM scholar WHERE key = ?').bind(key).first<{ discipline: string }>();
  return row?.discipline ?? null;
};

export const GET: APIRoute = (ctx) => handleGet({
  ctx,
  pathFor,
  resolveDiscipline,
  urlIdentifier: () => ctx.params.key,
});

export const PUT: APIRoute = (ctx) => handlePut({
  ctx,
  schema: Scholar,
  pathFor: (obj) => pathFor(obj.key, obj.discipline),
  objectLabel: (obj) => `scholar/${obj.key}`,
  identifierMatch: (urlKey, obj) => obj.key === urlKey,
  urlIdentifier: () => ctx.params.key,
  forceFields: () => ({ updatedAt: new Date().toISOString() }),
});

export const DELETE: APIRoute = (ctx) => handleDelete({
  ctx,
  pathFor,
  objectLabel: (key) => `scholar/${key}`,
  resolveDiscipline,
  urlIdentifier: () => ctx.params.key,
});
