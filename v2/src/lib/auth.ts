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

export const COOKIE_NAME = 'session';

/** Web Crypto 生成 URL-safe base64 token */
export function generateToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let str = '';
  for (let i = 0; i < buf.length; i++) str += String.fromCharCode(buf[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  email_verified_at: string | null;
}

// ========== Magic link ==========

export async function createMagicLink(db: D1Database, email: string): Promise<string> {
  const token = generateToken(32);
  const expiresAt = Date.now() + MAGIC_LINK_TTL_MS;
  await db
    .prepare('INSERT INTO magic_link (token, email, expires_at) VALUES (?, ?, ?)')
    .bind(token, email.toLowerCase().trim(), expiresAt)
    .run();
  return token;
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

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const id = generateToken(32);
  const expiresAt = Date.now() + SESSION_TTL_MS;
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

export function buildSessionCookie(sessionId: string, isProd: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${COOKIE_NAME}=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookie(isProd: boolean): string {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}
