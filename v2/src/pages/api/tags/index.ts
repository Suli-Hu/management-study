/**
 * /api/tags?discipline=<key>
 *
 * Public-ish tag library endpoints for API-first / agents.
 * Mirrors the admin editor endpoints under /api/edit/discipline/.../tags.
 *
 * GET  → list tags
 * POST → create one tag (server generates key)
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonRes, type EditError } from '~/lib/edit-helpers';
import { Tag } from '~/schemas/discipline';

async function loadTags(db: D1Database, discipline: string): Promise<z.infer<typeof Tag>[] | null> {
  const row = await db
    .prepare('SELECT tags_json FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ tags_json: string | null }>();
  if (!row) return null;
  let raw: unknown;
  try { raw = JSON.parse(row.tags_json ?? '[]'); } catch { raw = []; }
  if (!Array.isArray(raw)) return [];
  const valid: z.infer<typeof Tag>[] = [];
  for (const t of raw) {
    const p = Tag.safeParse(t);
    if (p.success) valid.push(p.data);
  }
  return valid;
}

async function writeTags(db: D1Database, discipline: string, tags: z.infer<typeof Tag>[]): Promise<void> {
  await db
    .prepare('UPDATE discipline SET tags_json = ?, updated_at = ? WHERE key = ?')
    .bind(JSON.stringify(tags), new Date().toISOString(), discipline)
    .run();
}

function genTagKey(): string {
  return `t_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

const CreateBody = z.object({
  label: z.object({
    zh: z.string().trim().min(1),
    ja: z.string().trim().min(1).optional(),
    en: z.string().trim().min(1).optional(),
  }),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const GET: APIRoute = async ({ url, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = url.searchParams.get('discipline');
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline 必填' });
  if (!locals.canRead(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const tags = await loadTags(env.DB, discipline);
  if (tags === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} 不存在` });
  return jsonRes(200, { ok: true, discipline, tags });
};

export const POST: APIRoute = async ({ request, url, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return jsonRes<EditError>(503, { ok: false, reason: 'config_missing', detail: 'D1 not bound' });
  const discipline = url.searchParams.get('discipline');
  if (!discipline) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'discipline 必填' });
  if (!locals.user) return jsonRes<EditError>(401, { ok: false, reason: 'not_admin' });
  if (!locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'invalid json' }); }
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return jsonRes(422, { ok: false, reason: 'schema_invalid' as const, detail: parsed.error.issues });

  const tags = await loadTags(env.DB, discipline);
  if (tags === null) return jsonRes<EditError>(404, { ok: false, reason: 'not_found', detail: `discipline ${discipline} 不存在` });

  const key = genTagKey();
  const tag = Tag.parse({ key, label: parsed.data.label, color: parsed.data.color });
  tags.push(tag);
  await writeTags(env.DB, discipline, tags);
  return jsonRes(200, { ok: true, discipline, tag });
};

