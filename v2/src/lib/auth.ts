/**
 * Auth helpers — magic link + session.
 *
 * 流程：
 *   /api/auth/login  (POST email)   → 生成 token，写 magic_link 表，发邮件
 *   /api/auth/verify (GET ?token=)  → 验证 token，找/建 user，建 session，Set-Cookie，redirect /
 *   /api/auth/logout (POST)         → 删 session，清 cookie
 *
 * 约定：
 *   - magic_link token 10 分钟有效，单次使用（used_at 标记）
 *   - session id 256-bit 随机，30 天滑动窗口
 *   - cookie 名 "session"，HttpOnly + Secure（prod）+ SameSite=Lax + Path=/
 */

import type { D1Database } from '@cloudflare/workers-types';

const MAGIC_LINK_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 非 remember 模式：cookie 无 Max-Age（关浏览器就失效），DB 里给 1 小时上限防堆积 */
const SESSION_EPHEMERAL_TTL_MS = 60 * 60 * 1000;

export const COOKIE_NAME = 'session';

/** Web Crypto 生成 URL-safe base64 token */
export function generateToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let str = '';
  for (let i = 0; i < buf.length; i++) str += String.fromCharCode(buf[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** 6 位数字 code（跨设备登录用） */
export function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  email_verified_at: string | null;
}

/**
 * 判断用户是否管理员 —— 逗号分隔的 email CSV 来自 env.ADMIN_EMAILS
 * （wrangler.toml [vars]，可随时改，无需发 code）。
 * 非 admin = 只读；admin = 可编辑/删除 KP（write gate）。
 */
export function isAdmin(user: User | null, adminEmailsCSV: string | undefined): boolean {
  if (!user) return false;
  if (!adminEmailsCSV) return false;
  const admins = adminEmailsCSV
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

/** 从 ADMIN_EMAILS CSV 里取第一个（password 模式需要知道 admin 身份的固定 email） */
export function getPrimaryAdminEmail(adminEmailsCSV: string | undefined): string | null {
  if (!adminEmailsCSV) return null;
  const first = adminEmailsCSV.split(',')[0]?.trim().toLowerCase();
  return first || null;
}

/**
 * 判断用户是否访客（password 模式下 GUEST_PASSWORD 登录者）。
 * 访客行为：只读 + 未来 user_progress/note 写入跳过（"无记忆"约定）。
 */
export function isGuest(user: User | null, guestEmail: string | undefined): boolean {
  if (!user) return false;
  if (!guestEmail) return false;
  return user.email.toLowerCase() === guestEmail.trim().toLowerCase();
}

/**
 * 常量时间字符串比较（防 timing attack）。仅比较 ASCII 可打印字符足够。
 * 密码比 email / 邮箱后，走这个而不是 ===。
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ========== Magic link ==========

export async function createMagicLink(db: D1Database, email: string): Promise<{ token: string; code: string }> {
  const token = generateToken(32);
  const code = generateCode();
  const expiresAt = Date.now() + MAGIC_LINK_TTL_MS;
  await db
    .prepare('INSERT INTO magic_link (token, email, code, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, email.toLowerCase().trim(), code, expiresAt)
    .run();
  return { token, code };
}

/** 验证并 consume token，返回 email 或 null（失败 = 不存在/过期/已用） */
export async function consumeMagicLink(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT email, expires_at, used_at FROM magic_link WHERE token = ?')
    .bind(token)
    .first<{ email: string; expires_at: number; used_at: string | null }>();
  if (!row) return null;
  if (row.used_at) return null;
  if (row.expires_at < Date.now()) return null;

  await db
    .prepare('UPDATE magic_link SET used_at = ? WHERE token = ?')
    .bind(new Date().toISOString(), token)
    .run();
  return row.email;
}

/**
 * 按 (email, code) 匹配并 consume。返回 email 或 null。
 * 同一 email 可能有多条未过期 link（反复重发），我们取最新一条 code 匹配。
 */
export async function consumeMagicLinkByCode(
  db: D1Database,
  email: string,
  code: string,
): Promise<string | null> {
  const normEmail = email.toLowerCase().trim();
  const normCode = code.replace(/\D/g, '').trim();
  if (normCode.length !== 6) return null;

  const row = await db
    .prepare(`
      SELECT token, expires_at, used_at
      FROM magic_link
      WHERE email = ? AND code = ? AND used_at IS NULL
      ORDER BY expires_at DESC
      LIMIT 1
    `)
    .bind(normEmail, normCode)
    .first<{ token: string; expires_at: number; used_at: string | null }>();
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;

  await db
    .prepare('UPDATE magic_link SET used_at = ? WHERE token = ?')
    .bind(new Date().toISOString(), row.token)
    .run();
  return normEmail;
}

// ========== User ==========

export async function findOrCreateUser(db: D1Database, email: string): Promise<User> {
  const normEmail = email.toLowerCase().trim();
  const existing = await db
    .prepare('SELECT * FROM user WHERE email = ?')
    .bind(normEmail)
    .first<User>();
  if (existing) {
    // 首次 magic link 验证算邮箱确认
    if (!existing.email_verified_at) {
      const now = new Date().toISOString();
      await db
        .prepare('UPDATE user SET email_verified_at = ? WHERE id = ?')
        .bind(now, existing.id)
        .run();
      existing.email_verified_at = now;
    }
    return existing;
  }

  const id = generateToken(12);
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO user (id, email, display_name, created_at, email_verified_at) VALUES (?, ?, NULL, ?, ?)',
    )
    .bind(id, normEmail, now, now)
    .run();
  return {
    id,
    email: normEmail,
    display_name: null,
    created_at: now,
    email_verified_at: now,
  };
}

// ========== Session ==========

export async function createSession(
  db: D1Database,
  userId: string,
  remember: boolean = true,
): Promise<string> {
  const id = generateToken(32);
  const expiresAt = Date.now() + (remember ? SESSION_TTL_MS : SESSION_EPHEMERAL_TTL_MS);
  await db
    .prepare('INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, userId, expiresAt)
    .run();
  return id;
}

export async function getSessionUser(db: D1Database, sessionId: string): Promise<User | null> {
  const row = await db
    .prepare(`
      SELECT u.*, s.expires_at as session_expires_at
      FROM session s
      INNER JOIN user u ON u.id = s.user_id
      WHERE s.id = ?
    `)
    .bind(sessionId)
    .first<User & { session_expires_at: number }>();
  if (!row) return null;
  if (row.session_expires_at < Date.now()) {
    // 过期了，清理
    await db.prepare('DELETE FROM session WHERE id = ?').bind(sessionId).run();
    return null;
  }
  const { session_expires_at, ...user } = row;
  return user;
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM session WHERE id = ?').bind(sessionId).run();
}

// ========== Cookie ==========

export function parseCookieSession(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const p of pairs) {
    const [k, ...rest] = p.split('=');
    if (k.trim() === COOKIE_NAME) return rest.join('=').trim();
  }
  return null;
}

export function buildSessionCookie(
  sessionId: string,
  isProd: boolean,
  remember: boolean = true,
): string {
  const parts = [
    `${COOKIE_NAME}=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
  ];
  // remember = true → 30 天 persistent cookie；false → 无 Max-Age，关浏览器即失效
  if (remember) {
    parts.push(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  }
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookie(isProd: boolean): string {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}
