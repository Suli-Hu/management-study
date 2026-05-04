/**
 * POST /api/admin/strip-strong-from-d1 (v0.8.7)
 *
 * 一次性把 prod D1 里所有 KP / school / scholar / discipline / view / kp_fts
 * 的所有 text / json 列剥除 `<strong>` / `</strong>` tag。
 *
 * 策略：
 *   - 对每张表：fetch 全部行 → 每行所有 text 列跑 stripStrong / json 列 deepStripStrong →
 *     UPDATE 回去（仅当至少一列有变化才 UPDATE，幂等）
 *   - 同时同步 kp_fts（KP 主表 body/title 改了 fts 行也要重建）
 *
 * 安全：仅 super-admin 可调（与 backfill-kp-body-structured 同 gate）
 *
 * 用法（PM ship 后单次跑）：
 *   curl -X POST -H "Authorization: Bearer $MS_TOKEN" \
 *     https://study.sususu.org/api/admin/strip-strong-from-d1
 *
 * 返回：
 *   {
 *     ok: true,
 *     scanned: { kp: N, school: N, scholar: N, discipline: N, view: N },
 *     modified: { kp: M, school: M, scholar: M, discipline: M, view: M },
 *     totalTagsRemoved: K
 *   }
 *
 * idempotent: 重跑时已经干净的行不再 UPDATE。
 */

import type { APIRoute } from 'astro';
import { stripStrong, deepStripStrong } from '~/lib/sanitize-strong';

interface Counters {
  kp: number;
  school: number;
  scholar: number;
  discipline: number;
  view: number;
}

interface Result {
  ok: true;
  scanned: Counters;
  modified: Counters;
  totalTagsRemoved: number;
}

const STRONG_RE = /<\s*\/?\s*strong\s*>/gi;

/** 计数 string 里 <strong>/</strong> tag 个数 */
function countTags(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(STRONG_RE);
  return m ? m.length : 0;
}

/** 对 JSON 列（含 string 内容）做 strip — parse → deepStripStrong → stringify */
function stripJsonCol(raw: string | null): { next: string | null; tagsRemoved: number; changed: boolean } {
  if (raw === null || raw === '') return { next: raw, tagsRemoved: 0, changed: false };
  const tagsRemoved = countTags(raw);
  if (tagsRemoved === 0) return { next: raw, tagsRemoved: 0, changed: false };
  // raw 里有 tag — parse、清、stringify。如 parse 失败（不应发生），fallback 到 raw replace.
  try {
    const parsed = JSON.parse(raw);
    const cleaned = deepStripStrong(parsed);
    const next = JSON.stringify(cleaned);
    return { next, tagsRemoved, changed: next !== raw };
  } catch {
    const next = raw.replace(STRONG_RE, '');
    return { next, tagsRemoved, changed: next !== raw };
  }
}

function stripTextCol(raw: string | null): { next: string | null; tagsRemoved: number; changed: boolean } {
  if (raw === null) return { next: null, tagsRemoved: 0, changed: false };
  const tagsRemoved = countTags(raw);
  if (tagsRemoved === 0) return { next: raw, tagsRemoved: 0, changed: false };
  return { next: stripStrong(raw), tagsRemoved, changed: true };
}

interface KpRow {
  id: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  body_zh: string;
  body_ja: string | null;
  tags_json: string | null;
  eval_content_zh_json: string | null;
  eval_content_ja_json: string | null;
  body_zh_json: string | null;
  body_ja_json: string | null;
  evaluations_zh_json: string | null;
  evaluations_ja_json: string | null;
}

async function processKpTable(db: D1Database): Promise<{ scanned: number; modified: number; tags: number }> {
  const { results } = await db
    .prepare(
      `SELECT id, title_zh, title_en, title_ja, body_zh, body_ja, tags_json,
              eval_content_zh_json, eval_content_ja_json,
              body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json
       FROM kp`,
    )
    .all<KpRow>();

  let modified = 0;
  let tags = 0;
  for (const row of results ?? []) {
    const cols = {
      title_zh: stripTextCol(row.title_zh),
      title_en: stripTextCol(row.title_en),
      title_ja: stripTextCol(row.title_ja),
      body_zh: stripTextCol(row.body_zh),
      body_ja: stripTextCol(row.body_ja),
      tags_json: stripJsonCol(row.tags_json),
      eval_content_zh_json: stripJsonCol(row.eval_content_zh_json),
      eval_content_ja_json: stripJsonCol(row.eval_content_ja_json),
      body_zh_json: stripJsonCol(row.body_zh_json),
      body_ja_json: stripJsonCol(row.body_ja_json),
      evaluations_zh_json: stripJsonCol(row.evaluations_zh_json),
      evaluations_ja_json: stripJsonCol(row.evaluations_ja_json),
    };
    const rowTags = Object.values(cols).reduce((s, c) => s + c.tagsRemoved, 0);
    if (rowTags === 0) continue;

    await db
      .prepare(
        `UPDATE kp SET
           title_zh = ?, title_en = ?, title_ja = ?,
           body_zh = ?, body_ja = ?, tags_json = ?,
           eval_content_zh_json = ?, eval_content_ja_json = ?,
           body_zh_json = ?, body_ja_json = ?,
           evaluations_zh_json = ?, evaluations_ja_json = ?
         WHERE id = ?`,
      )
      .bind(
        cols.title_zh.next,
        cols.title_en.next,
        cols.title_ja.next,
        cols.body_zh.next,
        cols.body_ja.next,
        cols.tags_json.next,
        cols.eval_content_zh_json.next,
        cols.eval_content_ja_json.next,
        cols.body_zh_json.next,
        cols.body_ja_json.next,
        cols.evaluations_zh_json.next,
        cols.evaluations_ja_json.next,
        row.id,
      )
      .run();

    // FTS 行同步重建（kp_fts 的 title/body 列也可能含 <strong>）
    await db
      .batch([
        db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(row.id),
        db
          .prepare(
            `INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            row.id,
            cols.title_zh.next ?? '',
            cols.title_en.next ?? '',
            cols.title_ja.next ?? '',
            cols.body_zh.next ?? '',
            cols.body_ja.next ?? '',
          ),
      ]);

    modified += 1;
    tags += rowTags;
  }
  return { scanned: results?.length ?? 0, modified, tags };
}

interface SchoolRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  era: string;
  summary_zh: string;
  summary_ja: string | null;
  tags_json: string | null;
}

async function processSchoolTable(db: D1Database): Promise<{ scanned: number; modified: number; tags: number }> {
  const { results } = await db
    .prepare(
      `SELECT key, title_zh, title_en, title_ja, era, summary_zh, summary_ja, tags_json
       FROM school`,
    )
    .all<SchoolRow>();

  let modified = 0;
  let tags = 0;
  for (const row of results ?? []) {
    const cols = {
      title_zh: stripTextCol(row.title_zh),
      title_en: stripTextCol(row.title_en),
      title_ja: stripTextCol(row.title_ja),
      era: stripTextCol(row.era),
      summary_zh: stripTextCol(row.summary_zh),
      summary_ja: stripTextCol(row.summary_ja),
      tags_json: stripJsonCol(row.tags_json),
    };
    const rowTags = Object.values(cols).reduce((s, c) => s + c.tagsRemoved, 0);
    if (rowTags === 0) continue;
    await db
      .prepare(
        `UPDATE school SET
           title_zh = ?, title_en = ?, title_ja = ?,
           era = ?, summary_zh = ?, summary_ja = ?, tags_json = ?
         WHERE key = ?`,
      )
      .bind(
        cols.title_zh.next,
        cols.title_en.next,
        cols.title_ja.next,
        cols.era.next,
        cols.summary_zh.next,
        cols.summary_ja.next,
        cols.tags_json.next,
        row.key,
      )
      .run();
    modified += 1;
    tags += rowTags;
  }
  return { scanned: results?.length ?? 0, modified, tags };
}

interface ScholarRow {
  key: string;
  discipline: string;
  name_zh: string;
  name_en: string | null;
  name_ja: string | null;
  contribution_zh: string;
  contribution_ja: string | null;
  lifespan: string;
  institution: string;
  born: string | null;
  died: string | null;
  nationality: string | null;
  flag: string | null;
  origin: string | null;
  field: string | null;
  tags_json: string | null;
  nobel_year: string | null;
  nobel_detail: string | null;
}

async function processScholarTable(db: D1Database): Promise<{ scanned: number; modified: number; tags: number }> {
  const { results } = await db
    .prepare(
      `SELECT key, discipline, name_zh, name_en, name_ja,
              contribution_zh, contribution_ja, lifespan, institution,
              born, died, nationality, flag, origin, field, tags_json,
              nobel_year, nobel_detail
       FROM scholar`,
    )
    .all<ScholarRow>();

  let modified = 0;
  let tags = 0;
  for (const row of results ?? []) {
    const cols = {
      name_zh: stripTextCol(row.name_zh),
      name_en: stripTextCol(row.name_en),
      name_ja: stripTextCol(row.name_ja),
      contribution_zh: stripTextCol(row.contribution_zh),
      contribution_ja: stripTextCol(row.contribution_ja),
      lifespan: stripTextCol(row.lifespan),
      institution: stripTextCol(row.institution),
      born: stripTextCol(row.born),
      died: stripTextCol(row.died),
      nationality: stripTextCol(row.nationality),
      flag: stripTextCol(row.flag),
      origin: stripTextCol(row.origin),
      field: stripTextCol(row.field),
      tags_json: stripJsonCol(row.tags_json),
      nobel_year: stripTextCol(row.nobel_year),
      nobel_detail: stripTextCol(row.nobel_detail),
    };
    const rowTags = Object.values(cols).reduce((s, c) => s + c.tagsRemoved, 0);
    if (rowTags === 0) continue;
    await db
      .prepare(
        `UPDATE scholar SET
           name_zh = ?, name_en = ?, name_ja = ?,
           contribution_zh = ?, contribution_ja = ?, lifespan = ?, institution = ?,
           born = ?, died = ?, nationality = ?, flag = ?, origin = ?, field = ?,
           tags_json = ?, nobel_year = ?, nobel_detail = ?
         WHERE discipline = ? AND key = ?`,
      )
      .bind(
        cols.name_zh.next,
        cols.name_en.next,
        cols.name_ja.next,
        cols.contribution_zh.next,
        cols.contribution_ja.next,
        cols.lifespan.next,
        cols.institution.next,
        cols.born.next,
        cols.died.next,
        cols.nationality.next,
        cols.flag.next,
        cols.origin.next,
        cols.field.next,
        cols.tags_json.next,
        cols.nobel_year.next,
        cols.nobel_detail.next,
        row.discipline,
        row.key,
      )
      .run();
    modified += 1;
    tags += rowTags;
  }
  return { scanned: results?.length ?? 0, modified, tags };
}

interface DisciplineRow {
  key: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  tagline_zh: string | null;
  tagline_ja: string | null;
  tags_json: string | null;
  themes_json: string | null;
}

async function processDisciplineTable(db: D1Database): Promise<{ scanned: number; modified: number; tags: number }> {
  const { results } = await db
    .prepare(
      `SELECT key, title_zh, title_en, title_ja, tagline_zh, tagline_ja,
              tags_json, themes_json
       FROM discipline`,
    )
    .all<DisciplineRow>();

  let modified = 0;
  let tags = 0;
  for (const row of results ?? []) {
    const cols = {
      title_zh: stripTextCol(row.title_zh),
      title_en: stripTextCol(row.title_en),
      title_ja: stripTextCol(row.title_ja),
      tagline_zh: stripTextCol(row.tagline_zh),
      tagline_ja: stripTextCol(row.tagline_ja),
      tags_json: stripJsonCol(row.tags_json),
      themes_json: stripJsonCol(row.themes_json),
    };
    const rowTags = Object.values(cols).reduce((s, c) => s + c.tagsRemoved, 0);
    if (rowTags === 0) continue;
    await db
      .prepare(
        `UPDATE discipline SET
           title_zh = ?, title_en = ?, title_ja = ?,
           tagline_zh = ?, tagline_ja = ?, tags_json = ?, themes_json = ?
         WHERE key = ?`,
      )
      .bind(
        cols.title_zh.next,
        cols.title_en.next,
        cols.title_ja.next,
        cols.tagline_zh.next,
        cols.tagline_ja.next,
        cols.tags_json.next,
        cols.themes_json.next,
        row.key,
      )
      .run();
    modified += 1;
    tags += rowTags;
  }
  return { scanned: results?.length ?? 0, modified, tags };
}

interface ViewRow {
  id: string;
  name: string;
  jp: string;
  icon: string;
  description: string;
  flow: string;
  groups_json: string | null;
}

async function processViewTable(db: D1Database): Promise<{ scanned: number; modified: number; tags: number }> {
  const { results } = await db
    .prepare(
      `SELECT id, name, jp, icon, description, flow, groups_json FROM view`,
    )
    .all<ViewRow>();

  let modified = 0;
  let tags = 0;
  for (const row of results ?? []) {
    const cols = {
      name: stripTextCol(row.name),
      jp: stripTextCol(row.jp),
      icon: stripTextCol(row.icon),
      description: stripTextCol(row.description),
      flow: stripTextCol(row.flow),
      groups_json: stripJsonCol(row.groups_json),
    };
    const rowTags = Object.values(cols).reduce((s, c) => s + c.tagsRemoved, 0);
    if (rowTags === 0) continue;
    await db
      .prepare(
        `UPDATE view SET
           name = ?, jp = ?, icon = ?, description = ?, flow = ?, groups_json = ?
         WHERE id = ?`,
      )
      .bind(
        cols.name.next,
        cols.jp.next,
        cols.icon.next,
        cols.description.next,
        cols.flow.next,
        cols.groups_json.next,
        row.id,
      )
      .run();
    modified += 1;
    tags += rowTags;
  }
  return { scanned: results?.length ?? 0, modified, tags };
}

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return json(403, { ok: false, reason: 'not_admin' });
  }
  if (!locals.isSuperAdmin) {
    return json(403, { ok: false, reason: 'super_admin_required' });
  }

  const db = locals.runtime.env.DB;

  const [kpResult, schoolResult, scholarResult, disciplineResult, viewResult] = await Promise.all([
    processKpTable(db),
    processSchoolTable(db),
    processScholarTable(db),
    processDisciplineTable(db),
    processViewTable(db),
  ]);

  const result: Result = {
    ok: true,
    scanned: {
      kp: kpResult.scanned,
      school: schoolResult.scanned,
      scholar: scholarResult.scanned,
      discipline: disciplineResult.scanned,
      view: viewResult.scanned,
    },
    modified: {
      kp: kpResult.modified,
      school: schoolResult.modified,
      scholar: scholarResult.modified,
      discipline: disciplineResult.modified,
      view: viewResult.modified,
    },
    totalTagsRemoved:
      kpResult.tags + schoolResult.tags + scholarResult.tags + disciplineResult.tags + viewResult.tags,
  };
  return json(200, result);
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
