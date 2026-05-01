/**
 * GET /api/search/{discipline}?q=xxx — Spotlight modal 搜索 API（v0.5.59）
 *
 * 行为对齐 v2/src/pages/[discipline]/search/index.astro：
 *   - q ≥ 3 字符：FTS5 trigram MATCH + BM25 rank + snippet
 *   - q < 3 字符：LIKE fallback，title 命中优先
 *   - 学者 / 学派 一律 LIKE（小集合，速度无影响）
 *
 * 返：{ kps: [...], scholars: [...], schools: [...] }
 *      kp.excerpt 已包含 <mark> 高亮（FTS5 snippet 给的；LIKE 走时为空字符串）
 *
 * 客户端用 debounce ≥150ms 调度，避免每键 1 次请求。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';
import { lastName } from '~/lib/format-name';

interface KpHit {
  id: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  year: string;
  excerpt_zh: string;
  excerpt_ja: string | null;
  scholars_csv: string | null;
  schools_csv: string | null;
}

interface ScholarHit {
  key: string;
  name_zh: string;
  name_en: string | null;
  kp_count: number;
}

interface SchoolHit {
  key: string;
  title_zh: string;
  title_en: string | null;
  kp_count: number;
}

function sanitizeFts(q: string): string {
  return q.replace(/[\"'()\-*^]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const discipline = params.discipline;
  if (!discipline) {
    return new Response(JSON.stringify({ error: 'missing discipline' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  const rawQ = (url.searchParams.get('q') ?? '').trim();
  if (!rawQ) {
    return new Response(JSON.stringify({ kps: [], scholars: [], schools: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const db = getDb(locals.runtime.env);
  const ftsQ = sanitizeFts(rawQ);
  const useFts = ftsQ.replace(/\s+/g, '').length >= 3;

  let kpHits: KpHit[] = [];

  if (useFts) {
    const kpRes = await db
      .prepare(`
        SELECT
          k.id, k.title_zh, k.title_en, k.title_ja, k.year,
          snippet(kp_fts, 4, '<mark>', '</mark>', '...', 18) as excerpt_zh,
          snippet(kp_fts, 5, '<mark>', '</mark>', '...', 18) as excerpt_ja,
          (SELECT GROUP_CONCAT(scholar_key, ',') FROM kp_scholar WHERE kp_id = k.id AND scholar_discipline = k.discipline ORDER BY position) as scholars_csv,
          (SELECT GROUP_CONCAT(school_key,   ',') FROM kp_school  WHERE kp_id = k.id ORDER BY position) as schools_csv
        FROM kp_fts
        INNER JOIN kp k ON k.id = kp_fts.id
        WHERE kp_fts MATCH ?
          AND k.discipline = ?
        ORDER BY rank
        LIMIT 20
      `)
      .bind(ftsQ, discipline)
      .all<KpHit>();
    kpHits = kpRes.results ?? [];
  } else {
    const like = `%${rawQ}%`;
    const kpRes = await db
      .prepare(`
        SELECT
          k.id, k.title_zh, k.title_en, k.title_ja, k.year,
          '' as excerpt_zh, '' as excerpt_ja,
          (SELECT GROUP_CONCAT(scholar_key, ',') FROM kp_scholar WHERE kp_id = k.id AND scholar_discipline = k.discipline ORDER BY position) as scholars_csv,
          (SELECT GROUP_CONCAT(school_key,   ',') FROM kp_school  WHERE kp_id = k.id ORDER BY position) as schools_csv
        FROM kp k
        WHERE k.discipline = ?
          AND (
            k.title_zh LIKE ? OR k.title_en LIKE ? OR k.title_ja LIKE ?
            OR k.body_zh LIKE ? OR k.body_ja LIKE ?
          )
        ORDER BY
          CASE WHEN k.title_zh LIKE ? OR k.title_en LIKE ? OR k.title_ja LIKE ? THEN 0 ELSE 1 END,
          k.id
        LIMIT 20
      `)
      .bind(discipline, like, like, like, like, like, like, like, like)
      .all<KpHit>();
    kpHits = kpRes.results ?? [];
  }

  const like = `%${rawQ}%`;
  const lowerLike = `%${rawQ.toLowerCase()}%`;

  const schRes = await db
    .prepare(`
      SELECT key, name_zh, name_en,
        (SELECT COUNT(*) FROM kp_scholar WHERE scholar_discipline = scholar.discipline AND scholar_key = scholar.key) as kp_count
      FROM scholar
      WHERE discipline = ?
        AND (name_zh LIKE ? OR name_en LIKE ? OR name_ja LIKE ? OR key LIKE ?)
      ORDER BY kp_count DESC, key
      LIMIT 8
    `)
    .bind(discipline, like, like, like, lowerLike)
    .all<ScholarHit>();
  const scholarHits: ScholarHit[] = schRes.results ?? [];

  const schoolRes = await db
    .prepare(`
      SELECT key, title_zh, title_en,
        (SELECT COUNT(*) FROM kp_school WHERE school_key = school.key) as kp_count
      FROM school
      WHERE discipline = ?
        AND (title_zh LIKE ? OR title_en LIKE ? OR key LIKE ?)
      ORDER BY kp_count DESC, key
      LIMIT 8
    `)
    .bind(discipline, like, like, lowerLike)
    .all<SchoolHit>();
  const schoolHits: SchoolHit[] = schoolRes.results ?? [];

  // 学者名 lookup（KP 项展示用 lastName chip）— discipline 一次拉，避免 IN 上限
  const allScholarKeys = new Set(kpHits.flatMap((k) => (k.scholars_csv ?? '').split(',').filter(Boolean)));
  const scholarByKey = new Map<string, { key: string; name_zh: string; name_en: string | null }>();
  if (allScholarKeys.size > 0) {
    const r = await db
      .prepare('SELECT key, name_zh, name_en FROM scholar WHERE discipline = ?')
      .bind(discipline)
      .all<{ key: string; name_zh: string; name_en: string | null }>();
    for (const s of r.results ?? []) scholarByKey.set(s.key, s);
  }

  const kps = kpHits.map((k) => {
    const scholarKeys = (k.scholars_csv ?? '').split(',').filter(Boolean);
    const scholarLabel = scholarKeys
      .map((sk) => lastName(scholarByKey.get(sk)?.name_en ?? scholarByKey.get(sk)?.name_zh ?? sk))
      .join(' · ');
    const excerpt = (k.excerpt_zh && k.excerpt_zh.length > 0)
      ? k.excerpt_zh
      : (k.excerpt_ja ?? '');
    return {
      id: k.id,
      title_zh: k.title_zh,
      title_ja: k.title_ja,
      year: k.year,
      scholar_label: scholarLabel,
      excerpt,
    };
  });

  return new Response(
    JSON.stringify({ kps, scholars: scholarHits, schools: schoolHits }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
};
