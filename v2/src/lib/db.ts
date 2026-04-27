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

  // v0.2.8 admin role（逗号分隔邮箱 CSV）
  ADMIN_EMAILS?: string;

  // v0.2.9 password 模式（考试期开关）
  AUTH_MODE?: 'password' | 'email';
  GUEST_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  GUEST_PASSWORD?: string;

  // v0.4.33 邀请码登录（共用 user，全学科 guest 视角）
  INVITE_CODE_GUEST?: string;
  INVITE_GUEST_EMAIL?: string;
  // v0.5.74 邀请码访客可读 discipline 白名单（逗号分隔）。空 / 未设 = 全学科可读。
  INVITE_GUEST_DISCIPLINES?: string;
  // v0.5.76 程序友好后门：客户端发 X-Anytime-Token: <这个值> → 当 invite-guest 处理。
  // 只允许 GET / HEAD（read-only），仍受 INVITE_GUEST_DISCIPLINES 限制。
  // 暗号短意味着安全靠"非常规 header 名 + 受限读取范围 + 易随时旋转"。
  API_BACKDOOR_TOKEN?: string;

  // v0.5.45 邮箱 N 天免 code 信任：白名单 email 在 N 天内任意设备直接登录（不发 code）
  // 默认 3 天，0 = 关闭（恢复纯 magic link 流程）。仅作用于已存在的 user 行。
  EMAIL_TRUST_DAYS?: string;

  // v0.4.1 编辑器：GitHub Contents API 写 data/*.json
  GITHUB_PAT?: string;       // fine-grained PAT，仅 Contents R/W
  GITHUB_REPO?: string;      // "Suli-Hu/management-study"，默认从 wrangler.toml [vars] 注入
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
  tags_json: string;
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
  tags_json: string;
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
