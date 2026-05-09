/**
 * GET /api/v1/index/<discipline>  (v0.5.97)
 *
 * 学科 manifest — 一次拿到该学科的全景：themes / schools / scholars / kps。
 *
 * 给 learning agent 用：会话开局调一次防重复扫描 / 跨 session 接力时拿现状 /
 * 写新 KP 前确认 schools[] / scholars[] key 拼写。
 *
 * 认证：Bearer token 或 cookie，且 canRead(discipline) = true。
 *   - super-admin（ADMIN_EMAILS） → 直接通过
 *   - 普通 user → tenant_member 决定 canRead / canEdit
 *   - token scope 收窄已在 middleware.canRead 内置
 *
 * 返：{ ok, discipline, themes[], schools[], scholars[], kps[], counts }
 *      schools/scholars 都按 key 升序；kps 按 id 升序。
 *      每个 school/scholar 带 kp_count，方便 agent 评估装修密度。
 */

import type { APIRoute } from 'astro';

function reqId(): string {
  // Short, log-friendly id for correlating Workers logs with client reports.
  return crypto.randomUUID().slice(0, 8);
}

interface ThemeEntry {
  key: string;
  title?: { zh?: string; ja?: string; en?: string };
  desc?: { zh?: string; ja?: string };
  schools?: string[];
}

interface SchoolRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  era: string;
  theme_key: string;
  kp_count: number;
}

interface ScholarRow {
  key: string;
  name_zh: string;
  name_en: string | null;
  name_ja: string | null;
  kp_count: number;
}

interface KpRow {
  id: string;
  title_zh: string;
  title_ja: string | null;
  year: string;
  format: string;
  schools_csv: string | null;
  scholars_csv: string | null;
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const requestId = reqId();
  const discipline = params.discipline;
  if (!discipline) return json(400, { ok: false, reason: 'bad_request', detail: 'missing discipline' });
  if (!locals.user) return json(403, { ok: false, reason: 'not_authenticated' });
  if (!locals.canRead(discipline)) return json(403, { ok: false, reason: 'no_read_permission', detail: discipline });

  const env = locals.runtime.env;
  if (!env?.DB) return json(503, { ok: false, reason: 'config_missing', detail: 'D1 binding missing' });

  try {
    // 1) discipline 行（拿 themes_json + 标题）
    const discRow = await env.DB
      .prepare('SELECT key, title_zh, title_ja, title_en, themes_json FROM discipline WHERE key = ?')
      .bind(discipline)
      .first<{ key: string; title_zh: string; title_ja: string | null; title_en: string | null; themes_json: string }>();
    if (!discRow) return json(404, { ok: false, reason: 'discipline_not_found', detail: discipline });

    let themes: ThemeEntry[] = [];
    try {
      const parsed = JSON.parse(discRow.themes_json) as unknown;
      if (Array.isArray(parsed)) themes = parsed as ThemeEntry[];
    } catch { /* 容错：themes_json 损坏也返空，不阻断 */ }

    // 2) schools — 按 key 升序，附 kp_count
    const schoolRes = await env.DB
      .prepare(`
        SELECT s.key, s.title_zh, s.title_en, s.title_ja, s.era, s.theme_key,
          (SELECT COUNT(*) FROM kp_school WHERE school_key = s.key) AS kp_count
        FROM school s
        WHERE s.discipline = ?
        ORDER BY s.key
      `)
      .bind(discipline)
      .all<SchoolRow>();
    const schools = schoolRes.results ?? [];

    // 3) scholars — 按 key 升序，附 kp_count
    const scholarRes = await env.DB
      .prepare(`
        SELECT s.key, s.name_zh, s.name_en, s.name_ja,
          (SELECT COUNT(*) FROM kp_scholar WHERE scholar_discipline = s.discipline AND scholar_key = s.key) AS kp_count
        FROM scholar s
        WHERE s.discipline = ?
        ORDER BY s.key
      `)
      .bind(discipline)
      .all<ScholarRow>();
    const scholars = scholarRes.results ?? [];

    // 4) kps — 按 id 升序，附 schools / scholars CSV 便于 agent 一眼看清归属
    const kpRes = await env.DB
      .prepare(`
        SELECT k.id, k.title_zh, k.title_ja, k.year, k.body_format AS format,
          (SELECT GROUP_CONCAT(school_key,  ',') FROM kp_school  WHERE kp_id = k.id ORDER BY position) AS schools_csv,
          (SELECT GROUP_CONCAT(scholar_key, ',') FROM kp_scholar WHERE kp_id = k.id AND scholar_discipline = k.discipline ORDER BY position) AS scholars_csv
        FROM kp k
        WHERE k.discipline = ?
        ORDER BY k.id
      `)
      .bind(discipline)
      .all<KpRow>();
    const kps = (kpRes.results ?? []).map((k) => ({
      id: k.id,
      title_zh: k.title_zh,
      title_ja: k.title_ja,
      year: k.year,
      format: k.format,
      schools: (k.schools_csv ?? '').split(',').filter(Boolean),
      scholars: (k.scholars_csv ?? '').split(',').filter(Boolean),
    }));

    return json(200, {
      ok: true,
      discipline: {
        key: discRow.key,
        title_zh: discRow.title_zh,
        title_ja: discRow.title_ja,
        title_en: discRow.title_en,
      },
      counts: {
        themes: themes.length,
        schools: schools.length,
        scholars: scholars.length,
        kps: kps.length,
      },
      themes,
      schools,
      scholars,
      kps,
    });
  } catch (err) {
    console.error('[api/v1/index] internal_error', { requestId, discipline, err });
    return json(500, { ok: false, reason: 'internal_error', requestId });
  }
};
