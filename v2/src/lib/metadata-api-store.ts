import { KpFormat } from '~/schemas/kp-api';

interface DisciplineMetaRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  tagline_zh: string | null;
  tagline_ja: string | null;
  tags_json: string;
  themes_json: string;
}

interface SchoolMetaRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  theme_key: string;
  tags_json: string;
  kp_count: number;
}

interface ScholarMetaRow {
  key: string;
  name_zh: string;
  name_en: string | null;
  tags_json: string;
  kp_count: number;
}

interface ViewMetaRow {
  id: string;
  name: string;
  icon: string;
  is_default: number;
  position: number;
  groups_json: string;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function getMetadataForTenant(
  db: D1Database,
  tenant: { tenantId: string; discipline: string },
) {
  const [discipline, schoolsRes, scholarsRes, viewsRes] = await Promise.all([
    db.prepare(`
      SELECT key, title_zh, title_en, title_ja, tagline_zh, tagline_ja, tags_json, themes_json
      FROM discipline
      WHERE key = ?
    `).bind(tenant.discipline).first<DisciplineMetaRow>(),
    db.prepare(`
      SELECT s.key, s.title_zh, s.title_en, s.theme_key, s.tags_json,
        (SELECT COUNT(*) FROM kp_school ks WHERE ks.school_key = s.key) as kp_count
      FROM school s
      WHERE s.discipline = ?
      ORDER BY s.title_zh ASC, s.key ASC
    `).bind(tenant.discipline).all<SchoolMetaRow>(),
    db.prepare(`
      SELECT sc.key, sc.name_zh, sc.name_en, sc.tags_json,
        (SELECT COUNT(*) FROM kp_scholar ksc WHERE ksc.scholar_key = sc.key) as kp_count
      FROM scholar sc
      WHERE sc.discipline = ?
      ORDER BY sc.name_zh ASC, sc.key ASC
    `).bind(tenant.discipline).all<ScholarMetaRow>(),
    db.prepare(`
      SELECT id, name, icon, is_default, position, groups_json
      FROM view
      WHERE discipline = ?
      ORDER BY position ASC, id ASC
    `).bind(tenant.discipline).all<ViewMetaRow>(),
  ]);

  return {
    discipline: discipline ? {
      key: discipline.key,
      tenant_id: tenant.tenantId,
      title: {
        zh: discipline.title_zh,
        ...(discipline.title_en ? { en: discipline.title_en } : {}),
        ...(discipline.title_ja ? { ja: discipline.title_ja } : {}),
      },
      tagline: {
        ...(discipline.tagline_zh ? { zh: discipline.tagline_zh } : {}),
        ...(discipline.tagline_ja ? { ja: discipline.tagline_ja } : {}),
      },
    } : null,
    formats: KpFormat.options,
    tags: parseJson(discipline?.tags_json, []),
    themes: parseJson(discipline?.themes_json, []),
    schools: (schoolsRes.results ?? []).map((school) => ({
      key: school.key,
      title: { zh: school.title_zh, ...(school.title_en ? { en: school.title_en } : {}) },
      themeKey: school.theme_key,
      tags: parseJson<string[]>(school.tags_json, []),
      kp_count: school.kp_count,
    })),
    scholars: (scholarsRes.results ?? []).map((scholar) => ({
      key: scholar.key,
      name: { zh: scholar.name_zh, ...(scholar.name_en ? { en: scholar.name_en } : {}) },
      tags: parseJson<string[]>(scholar.tags_json, []),
      kp_count: scholar.kp_count,
    })),
    views: (viewsRes.results ?? []).map((view) => ({
      id: view.id,
      name: view.name,
      icon: view.icon,
      isDefault: Boolean(view.is_default),
      position: view.position,
      groups: parseJson(view.groups_json, []),
    })),
  };
}
