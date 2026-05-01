import type { APIRoute } from 'astro';
import { json, noStore } from '~/lib/api-response';
import { resolveTenantContext } from '~/lib/tenant-context';
import { KpFormat } from '~/schemas/kp-api';

interface SchoolOptionRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  tags_json: string;
  kp_count: number;
}

interface ScholarOptionRow {
  key: string;
  name_zh: string;
  name_en: string | null;
  tags_json: string;
  kp_count: number;
}

interface DisciplineTagsRow {
  tags_json: string;
  themes_json: string;
}

interface ViewOptionRow {
  id: string;
  name: string;
  icon: string;
  is_default: number;
  position: number;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const GET: APIRoute = async (context) => {
  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  const db = context.locals.runtime.env.DB;
  const [schoolsRes, scholarsRes, tagsRow, viewsRes] = await Promise.all([
    db.prepare(`
      SELECT s.key, s.title_zh, s.title_en, s.tags_json,
        (SELECT COUNT(*) FROM kp_school ks WHERE ks.school_key = s.key) as kp_count
      FROM school s
      WHERE s.discipline = ?
      ORDER BY s.title_zh ASC, s.key ASC
    `).bind(tenant.tenant.discipline).all<SchoolOptionRow>(),
    db.prepare(`
      SELECT sc.key, sc.name_zh, sc.name_en, sc.tags_json,
        (SELECT COUNT(*) FROM kp_scholar ksc WHERE ksc.scholar_key = sc.key) as kp_count
      FROM scholar sc
      WHERE sc.discipline = ?
      ORDER BY sc.name_zh ASC, sc.key ASC
    `).bind(tenant.tenant.discipline).all<ScholarOptionRow>(),
    db.prepare('SELECT tags_json, themes_json FROM discipline WHERE key = ?')
      .bind(tenant.tenant.discipline)
      .first<DisciplineTagsRow>(),
    db.prepare(`
      SELECT id, name, icon, is_default, position
      FROM view
      WHERE discipline = ?
      ORDER BY position ASC, id ASC
    `).bind(tenant.tenant.discipline).all<ViewOptionRow>(),
  ]);

  return noStore(json(200, {
    ok: true,
    tenant: tenant.tenant,
    formats: KpFormat.options,
    tags: parseJson(tagsRow?.tags_json, []),
    themes: parseJson(tagsRow?.themes_json, []),
    schools: (schoolsRes.results ?? []).map((s) => ({
      key: s.key,
      title: { zh: s.title_zh, ...(s.title_en ? { en: s.title_en } : {}) },
      tags: parseJson<string[]>(s.tags_json, []),
      kp_count: s.kp_count,
    })),
    scholars: (scholarsRes.results ?? []).map((s) => ({
      key: s.key,
      name: { zh: s.name_zh, ...(s.name_en ? { en: s.name_en } : {}) },
      tags: parseJson<string[]>(s.tags_json, []),
      kp_count: s.kp_count,
    })),
    views: (viewsRes.results ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      icon: v.icon,
      isDefault: Boolean(v.is_default),
      position: v.position,
    })),
  }));
};
