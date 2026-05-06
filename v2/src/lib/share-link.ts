/**
 * share_link CRUD（v0.7.30 / v0.11.6 改造）
 *
 * 学习记录 24 小时个人记录链接的存储层。所有 helper 都按 user_id 限定（防 IDOR）。
 *
 * v0.11.6 改动（用户决策）：
 *   - TTL 7 天 → 24 小时（产品定位「个人记录」，非长期分享）
 *   - token 32 字节随机 → 12 位时间戳 YYYYMMDDHHMM（用户已知风险，1 天 TTL 限制爆破窗口）
 *
 * 设计：
 *   - per (user_id, discipline, scope) UNIQUE
 *   - 创建/重新生成 = INSERT OR REPLACE（旧 token 立即失效）
 *   - 公开页查询永远带 expires_at > now 过滤 → 过期记录视同 404
 */

import type { D1Database } from '@cloudflare/workers-types';

export const SHARE_TTL_HOURS = 24;
export const SHARE_TTL_MS = SHARE_TTL_HOURS * 60 * 60 * 1000;

export interface ShareLinkRow {
  token: string;
  user_id: string;
  discipline: string;
  scope: string;
  created_at: string;
  expires_at: string;
}

/**
 * v0.11.6: token = 当前时间戳 YYYYMMDDHHMM（12 位，UTC 时区）
 *
 * 安全权衡（用户已确认承担）：
 *   - 12 位数字 = ~10^12 组合，看似多
 *   - 但实际有效窗口仅 24h × 60min = 1440 个组合
 *   - 攻击者可枚举一日内所有分钟数找到任何用户的 token
 *   - 1 天 TTL 限制了爆破窗口（超过 24h 自动失效）
 *
 * 历史：v0.7.30 起用 32 字节随机（256-bit），v0.11.6 改时间戳满足"短 URL"产品需求
 */
function newShareToken(): string {
  const now = new Date();
  const Y = now.getUTCFullYear();
  const M = String(now.getUTCMonth() + 1).padStart(2, '0');
  const D = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  const m = String(now.getUTCMinutes()).padStart(2, '0');
  return `${Y}${M}${D}${h}${m}`;
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
