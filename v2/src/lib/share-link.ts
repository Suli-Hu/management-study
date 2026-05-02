/**
 * share_link CRUD（v0.7.30）
 *
 * 学习记录 7 天分享链接的存储层。所有 helper 都按 user_id 限定（防 IDOR）。
 *
 * 设计：
 *   - per (user_id, discipline, scope) UNIQUE
 *   - 创建/重新生成 = INSERT OR REPLACE（旧 token 立即失效）
 *   - 公开页查询永远带 expires_at > now 过滤 → 过期记录视同 404
 */

import type { D1Database } from '@cloudflare/workers-types';
import { generateToken } from './auth';

export const SHARE_TTL_DAYS = 7;
export const SHARE_TTL_MS = SHARE_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface ShareLinkRow {
  token: string;
  user_id: string;
  discipline: string;
  scope: string;
  created_at: string;
  expires_at: string;
}

/** 32 bytes → ~43 char base64url（足够 256-bit 熵） */
function newShareToken(): string {
  return generateToken(32);
}

/** 当前是否还有效（expires_at > now）。null = 没记录 */
export async function getActiveShareLink(
  db: D1Database,
  userId: string,
  discipline: string,
  scope = 'study-log',
): Promise<ShareLinkRow | null> {
  const now = new Date().toISOString();
  return db
    .prepare(
      `SELECT * FROM share_link
       WHERE user_id = ? AND discipline = ? AND scope = ? AND expires_at > ?
       LIMIT 1`,
    )
    .bind(userId, discipline, scope, now)
    .first<ShareLinkRow>();
}

/**
 * 创建或重新生成分享链接。
 * UNIQUE(user_id, discipline, scope) → INSERT OR REPLACE 强制覆盖旧 token。
 * 返回新 row。
 */
export async function upsertShareLink(
  db: D1Database,
  userId: string,
  discipline: string,
  scope = 'study-log',
): Promise<ShareLinkRow> {
  const now = new Date();
  const expires = new Date(now.getTime() + SHARE_TTL_MS);
  const row: ShareLinkRow = {
    token: newShareToken(),
    user_id: userId,
    discipline,
    scope,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };

  await db
    .prepare(
      `INSERT OR REPLACE INTO share_link (token, user_id, discipline, scope, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.token, row.user_id, row.discipline, row.scope, row.created_at, row.expires_at)
    .run();

  return row;
}

/** 公开页 SSR：按 token 查 + 过期过滤。null = 无效/过期 */
export async function findActiveByToken(
  db: D1Database,
  token: string,
): Promise<ShareLinkRow | null> {
  const now = new Date().toISOString();
  return db
    .prepare(
      `SELECT * FROM share_link
       WHERE token = ? AND expires_at > ?
       LIMIT 1`,
    )
    .bind(token, now)
    .first<ShareLinkRow>();
}
