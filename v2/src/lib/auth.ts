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

/** 失败 3 次后 code 作废（v0.3.2 修 A4 rate limit） */
export const MAX_CODE_ATTEMPTS = 3;

/**
 * 按 (email, code) 匹配并 consume —— 带速率限制（v0.3.2 修 A4）
 *
 * 行为：
 *   - code 对 → 置 used_at → 返回 email
 *   - code 错 → 找最新 unused link（不限 code 匹配）attempt_count + 1
 *     - 达到 MAX_CODE_ATTEMPTS 时把该行 used_at 置位（等同作废）
 *     - 无论错多少次，返回 null
 *   - 无 link 或 expired → 返回 null（同静默失败，防 enumeration）
 *
 * 用户视角：错 3 次就要重发；暴力攻击 10^6 / 10min 被压到 3 / 10min。
 */
export async function consumeMagicLinkByCode(
  db: D1Database,
  email: string,
  code: string,
): Promise<string | null> {
  const normEmail = email.toLowerCase().trim();
  const normCode = code.replace(/\D/g, '').trim();
  if (normCode.length !== 6) return null;

  // 先查 code 是否匹配
  const matched = await db
    .prepare(`
      SELECT token, expires_at, used_at, attempt_count
      FROM magic_link
      WHERE email = ? AND code = ? AND used_at IS NULL
      ORDER BY expires_at DESC
      LIMIT 1
    `)
    .bind(normEmail, normCode)
    .first<{ token: string; expires_at: number; used_at: string | null; attempt_count: number }>();

  if (matched && matched.expires_at >= Date.now()) {
    // 成功 → consume
    await db
      .prepare('UPDATE magic_link SET used_at = ? WHERE token = ?')
      .bind(new Date().toISOString(), matched.token)
      .run();
    return normEmail;
  }

  // code 不对 or 过期 → 给最新 unused link +1 attempt
  const latestForEmail = await db
    .prepare(`
      SELECT token, attempt_count
      FROM magic_link
      WHERE email = ? AND used_at IS NULL AND expires_at >= ?
      ORDER BY expires_at DESC
      LIMIT 1
    `)
    .bind(normEmail, Date.now())
    .first<{ token: string; attempt_count: number }>();

  if (latestForEmail) {
    const nextCount = latestForEmail.attempt_count + 1;
    if (nextCount >= MAX_CODE_ATTEMPTS) {
      // 达到上限 → 作废整条 link
      await db
        .prepare('UPDATE magic_link SET used_at = ?, attempt_count = ? WHERE token = ?')
        .bind(new Date().toISOString(), nextCount, latestForEmail.token)
        .run();
    } else {
      await db
        .prepare('UPDATE magic_link SET attempt_count = ? WHERE token = ?')
        .bind(nextCount, latestForEmail.token)
        .run();
    }
  }

  return null;
}

// ========== User ==========

/**
 * 找或建 user —— race-safe（v0.3.2 修 A1 TOCTOU）
 *
 * 并发两个 request 同 email login：旧 SELECT-then-INSERT 会有一方挂 UNIQUE constraint。
 * 新实现用 `INSERT OR IGNORE` + `SELECT` —— 插入失败（已存在）被静默忽略，
 * 然后 SELECT 拿到那一条（无论是刚插的还是并发对方插的）。
 */
export async function findOrCreateUser(db: D1Database, email: string): Promise<User> {
  const normEmail = email.toLowerCase().trim();
  const id = generateToken(12);
  const now = new Date().toISOString();

  // INSERT OR IGNORE：若 UNIQUE(email) 已存在则不做任何事（无错误）
  await db
    .prepare(
      'INSERT OR IGNORE INTO user (id, email, display_name, created_at, email_verified_at) VALUES (?, ?, NULL, ?, ?)',
    )
    .bind(id, normEmail, now, now)
    .run();

  // 现在必然存在（刚插或并发对方插或更早就存在）
  const user = await db
    .prepare('SELECT * FROM user WHERE email = ?')
    .bind(normEmail)
    .first<User>();
  if (!user) throw new Error(`findOrCreateUser: user vanished after INSERT for ${normEmail}`);

  // 首次 magic link 验证算邮箱确认（若老 user 从未验证）
  if (!user.email_verified_at) {
    await db
      .prepare('UPDATE user SET email_verified_at = ? WHERE id = ?')
      .bind(now, user.id)
      .run();
    user.email_verified_at = now;
  }
  return user;
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

/**
 * 清理过期 session + 过期 magic_link（v0.3.2 修 A3 DB 堆积）
 *
 * 设计：不起后台 Cron，middleware 概率性触发（~1% requests）。
 * 单用户体量下每天 ~100 次清理足够；避免多起 Cron / Worker 依赖。
 * 返回删除的行数（方便日志/debug）。
 */
export async function cleanupExpired(
  db: D1Database,
): Promise<{ sessions: number; magicLinks: number }> {
  const now = Date.now();
  const s = await db.prepare('DELETE FROM session WHERE expires_at < ?').bind(now).run();
  // magic_link 表：删 (used_at 非空 AND 超过 30 天) OR (expires_at 已过期 AND 未使用但老)
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const m = await db
    .prepare(`
      DELETE FROM magic_link
      WHERE (used_at IS NOT NULL AND used_at < ?)
         OR (expires_at < ?)
    `)
    .bind(thirtyDaysAgo, now - 60 * 1000) // expired > 1 min ago
    .run();
  return {
    sessions: (s.meta as { changes?: number })?.changes ?? 0,
    magicLinks: (m.meta as { changes?: number })?.changes ?? 0,
  };
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

// ========== Signed session cookie (v0.3.5 修 A5) ==========
//
// 背景：原来 middleware 每请求 `SELECT ... FROM session s JOIN user u ...` 查 D1。
// N+1 问题：首页 + 每个静态资源每次都查。PWA 时更痛。
//
// 新方案（stateless）：
//   cookie = base64url(JSON payload) + "." + hex(HMAC-SHA256(payload, secret))
//   payload = { uid, email, exp, rem }
//
// Middleware：
//   1. 解 cookie → verifySessionCookie() → payload | null
//   2. 若 exp > now，synthesize locals.user = { id: uid, email, ... }
//   3. **不查 D1**
//
// 撤销：logout 清 cookie 即可。被盗 cookie 在 exp 前仍有效 —— 接受此 tradeoff（单用户 + 访客场景）。
//
// SESSION_SECRET：prod 从 CF Pages Dashboard secret 注入；dev fallback 用固定字符串。

/** SessionUser — 从 cookie 解出的最小身份，不含 display_name / created_at（查 D1 才有） */
export interface SessionUser {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  email_verified_at: string | null;
}

export interface SessionPayload {
  uid: string;
  email: string;
  exp: number; // unix ms
  rem: boolean;
}

/** dev fallback —— prod 必设 SESSION_SECRET，缺失 = 警告 + 用此值（仅能阻挡非攻击者的意外 tamper） */
const DEV_SECRET_FALLBACK = 'dev-secret-do-not-use-in-prod';

export function getSessionSecret(secret: string | undefined): string {
  if (!secret) {
    console.warn('[auth] SESSION_SECRET missing — using dev fallback. Set in CF Pages for prod.');
    return DEV_SECRET_FALLBACK;
  }
  return secret;
}

/** URL-safe base64 encode (没 padding) */
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function hex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}
function hexDecode(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function hmacSign(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return hex(sig);
}

async function hmacVerify(payloadB64: string, sigHex: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'HMAC',
      key,
      hexDecode(sigHex) as BufferSource,
      new TextEncoder().encode(payloadB64),
    );
  } catch {
    return false;
  }
}

/** 签发 session cookie value（not 整个 Set-Cookie header；见 buildSessionCookie 组装） */
export async function signSessionCookie(payload: SessionPayload, secret: string): Promise<string> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = b64url(jsonBytes);
  const sig = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/** 验证 + 解 cookie value → payload | null（失败 = tampered / expired / malformed） */
export async function verifySessionCookie(
  cookieValue: string | null | undefined,
  secret: string,
): Promise<SessionPayload | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf('.');
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  const payloadB64 = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const ok = await hmacVerify(payloadB64, sig, secret);
  if (!ok) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as SessionPayload).uid !== 'string' ||
    typeof (parsed as SessionPayload).email !== 'string' ||
    typeof (parsed as SessionPayload).exp !== 'number' ||
    typeof (parsed as SessionPayload).rem !== 'boolean'
  ) {
    return null;
  }
  const payload = parsed as SessionPayload;
  if (payload.exp < Date.now()) return null;
  return payload;
}

/** 把 payload 变 SessionUser（middleware 放 locals.user 用） */
export function sessionUserFromPayload(payload: SessionPayload): SessionUser {
  return {
    id: payload.uid,
    email: payload.email,
    display_name: null,
    created_at: '',
    email_verified_at: null,
  };
}

// ========== Cookie 组装 ==========

export function buildSessionCookie(
  signedValue: string,
  isProd: boolean,
  remember: boolean = true,
): string {
  const parts = [
    `${COOKIE_NAME}=${signedValue}`,
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

/** 组合：从 user + remember + secret 一把出 Set-Cookie header value */
export async function buildSignedSessionCookie(
  user: { id: string; email: string },
  remember: boolean,
  secret: string,
  isProd: boolean,
): Promise<string> {
  const expiresAt = Date.now() + (remember ? SESSION_TTL_MS : SESSION_EPHEMERAL_TTL_MS);
  const payload: SessionPayload = {
    uid: user.id,
    email: user.email,
    exp: expiresAt,
    rem: remember,
  };
  const signedValue = await signSessionCookie(payload, secret);
  return buildSessionCookie(signedValue, isProd, remember);
}
