/**
 * D1 client helpers — Astro 页面 / API routes 从这里拿 DB.
 *
 * 用法：
 *   ---
 *   import { getDb } from '~/lib/db';
 *   const db = getDb(Astro.locals.runtime.env);
 *   const kp = await db.prepare('SELECT * FROM kp WHERE id = ?').bind('k562').first();
 *   ---
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  SITE_NAME?: string;

  // v0.2.5 auth 相关
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  APP_URL?: string;
  SESSION_SECRET?: string;
}

/** 从 Astro.locals.runtime.env 取 DB —— Cloudflare Pages adapter 注入 */
export function getDb(env: Env): D1Database {
  if (!env?.DB) {
    throw new Error('D1 binding "DB" not found in env. Check wrangler.toml.');
  }
  return env.DB;
}

// ========== 类型化的查询 helper ==========

export interface KpRow {
  id: string;
  discipline: string;
  year: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  body_zh: string;
  body_ja: string | null;
  tags_json: string;
  format: string;
  created_at: string;
  updated_at: string;
}

export interface SchoolRow {
  key: string;
  discipline: string;
  title_zh: string;
  title_en: string | null;
  title_ja: string | null;
  era: string;
  summary_zh: string;
  summary_ja: string | null;
  theme_key: string;
  accent: string;
  created_at: string;
  updated_at: string;
}

export interface ScholarRow {
  key: string;
  discipline: string;
  name_zh: string;
  name_en: string | null;
  name_ja: string | null;
  contribution_zh: string;
  contribution_ja: string | null;
  lifespan: string;
  institution: string;
  nobel_year: string | null;
  nobel_detail: string | null;
  created_at: string;
  updated_at: string;
}

export async function getKp(db: D1Database, id: string): Promise<KpRow | null> {
  return db.prepare('SELECT * FROM kp WHERE id = ?').bind(id).first<KpRow>();
}

export async function listSchoolsByDiscipline(db: D1Database, discipline: string): Promise<SchoolRow[]> {
  const result = await db
    .prepare('SELECT * FROM school WHERE discipline = ? ORDER BY theme_key, key')
    .bind(discipline)
    .all<SchoolRow>();
  return result.results ?? [];
}

export async function listKpsBySchool(db: D1Database, schoolKey: string): Promise<KpRow[]> {
  const result = await db
    .prepare(`
      SELECT k.*
      FROM kp k
      INNER JOIN kp_school ks ON ks.kp_id = k.id
      WHERE ks.school_key = ?
      ORDER BY ks.position, k.id
    `)
    .bind(schoolKey)
    .all<KpRow>();
  return result.results ?? [];
}
