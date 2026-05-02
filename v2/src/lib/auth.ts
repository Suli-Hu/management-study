/**
 * Auth helpers — session + password / signup / reset / email-change tokens.
 *
 * 流程（v0.7 完整账户系统重做后）：
 *   /api/auth/signup            POST email + password → pending_signup → 邮箱 code
 *   /api/auth/signup-verify     POST code → user 行 + session
 *   /api/auth/login-password    POST email + password → session
 *   /api/auth/password-reset-*  POST email / token → 重置密码
 *   /api/account/*              改密 / 改邮箱 / 注销
 *   /api/auth/logout            POST → 清 cookie
 *
 * v0.7.6 删除：
 *   - magic-link 日常登录路径（createMagicLink / consumeMagicLink*）
 *   - EMAIL_TRUST_DAYS 信任窗口逻辑
 *   - magic_link 表保留（cleanupExpired 中仍清理过期行，防堆积）+
 *     user.trusted_until 列保留（D1 schema 不动，便于回滚）
 *
 * 约定：
 *   - session id 256-bit 随机，30 天滑动窗口
 *   - cookie 名 "session"，HttpOnly + Secure（prod）+ SameSite=Lax + Path=/
 */

import type { D1Database } from '@cloudflare/workers-types';

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
  // v0.7.6 删 trusted_until 字段类型：D1 schema 列保留以备回滚，但代码不再读写
}

/** 按 email 查 user（无 user 返回 null） */
export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return db
    .prepare('SELECT * FROM user WHERE email = ?')
    .bind(email.toLowerCase().trim())
    .first<User>();
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

// ============================================================
// v0.7.2 pending_signup —— 注册暂存
// ============================================================
//
// 注册流：/api/auth/signup 写本表 + 发邮箱 6 位 code；用户输 code 触发
// /api/auth/signup-verify → promote 到 user 表 + 写 session。
//
// 同 email 重复 signup → INSERT OR REPLACE 让后到覆盖前面，避免邮箱被
// 恶意抢注且让用户能纠正密码错误。

const PENDING_SIGNUP_TTL_MS = 30 * 60 * 1000; // 30 分钟
export const MAX_SIGNUP_CODE_ATTEMPTS = 5;

export interface PendingSignupRow {
  email: string;
  password_hash: string;
  salt: string;
  display_name: string | null;
  code: string;
  attempt_count: number;
  expires_at: number;
  created_at: string;
}

/** 创建（或覆盖）pending_signup 行 + 返回 6 位 code 给调用方发邮件 */
export async function createPendingSignup(
  db: D1Database,
  params: {
    email: string;
    passwordHash: string;
    salt: string;
    displayName: string | null;
  },
): Promise<{ code: string; expiresAt: number }> {
  const code = generateCode();
  const expiresAt = Date.now() + PENDING_SIGNUP_TTL_MS;
  const now = new Date().toISOString();
  await db
    .prepare(`
      INSERT OR REPLACE INTO pending_signup
        (email, password_hash, salt, display_name, code, attempt_count, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `)
    .bind(
      params.email.toLowerCase().trim(),
      params.passwordHash,
      params.salt,
      params.displayName,
      code,
      expiresAt,
      now,
    )
    .run();
  return { code, expiresAt };
}

/** 取 pending_signup 行（用于校验过期 / 看 attempt_count） */
export async function findPendingSignup(
  db: D1Database,
  email: string,
): Promise<PendingSignupRow | null> {
  return db
    .prepare('SELECT * FROM pending_signup WHERE email = ?')
    .bind(email.toLowerCase().trim())
    .first<PendingSignupRow>();
}

export type ConsumeSignupCodeResult =
  | { ok: true; row: PendingSignupRow }
  | { ok: false; reason: 'not_found' | 'expired' | 'wrong_code' | 'locked' };

/**
 * 按 (email, code) 校验 + consume pending_signup
 *
 * - code 对 + 未过期 → 返回 { ok: true, row }；调用方负责 promote 到 user + 删本行
 * - code 错 → attempt_count++；达 MAX_SIGNUP_CODE_ATTEMPTS 时 row 标记 locked
 *   下一次输错直接返回 locked
 * - 过期 → 返回 expired
 * - row 不存在 → 返回 not_found
 *
 * 注意：pending_signup 不在校验后立刻删除（promote 失败要可重试），由调用方在
 *   user INSERT 成功后才 deletePendingSignup
 */
export async function consumePendingSignupByCode(
  db: D1Database,
  email: string,
  code: string,
): Promise<ConsumeSignupCodeResult> {
  const normEmail = email.toLowerCase().trim();
  const normCode = code.replace(/\D/g, '').trim();

  const row = await findPendingSignup(db, normEmail);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.expires_at < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempt_count >= MAX_SIGNUP_CODE_ATTEMPTS) {
    return { ok: false, reason: 'locked' };
  }

  if (normCode.length !== 6 || row.code !== normCode) {
    const nextCount = row.attempt_count + 1;
    await db
      .prepare('UPDATE pending_signup SET attempt_count = ? WHERE email = ?')
      .bind(nextCount, normEmail)
      .run();
    if (nextCount >= MAX_SIGNUP_CODE_ATTEMPTS) {
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'wrong_code' };
  }

  return { ok: true, row };
}

/** 删 pending_signup 行（promote 到 user 之后调用） */
export async function deletePendingSignup(db: D1Database, email: string): Promise<void> {
  await db
    .prepare('DELETE FROM pending_signup WHERE email = ?')
    .bind(email.toLowerCase().trim())
    .run();
}

// ============================================================
// v0.7.3 登录用：读写 user 行的认证字段（password_hash + lock 状态）
// ============================================================

/** UserAuthRow 用于密码登录验证；故意不含 display_name 等无关字段，便于 mock */
export interface UserAuthRow {
  id: string;
  email: string;
  password_hash: string | null;
  password_salt: string | null;
  failed_attempts: number;
  locked_until: number | null;
}

/** 按 email 查 auth row（含密码 + 锁状态） */
export async function findUserAuthByEmail(
  db: D1Database,
  email: string,
): Promise<UserAuthRow | null> {
  return db
    .prepare(
      `SELECT id, email, password_hash, password_salt, failed_attempts, locked_until
       FROM user WHERE email = ?`,
    )
    .bind(email.toLowerCase().trim())
    .first<UserAuthRow>();
}

/** 写失败状态（attempts + locked_until）。调用方决定何时调用。 */
export async function updateUserLockState(
  db: D1Database,
  userId: string,
  state: { failed_attempts: number; locked_until: number | null },
): Promise<void> {
  await db
    .prepare('UPDATE user SET failed_attempts = ?, locked_until = ? WHERE id = ?')
    .bind(state.failed_attempts, state.locked_until, userId)
    .run();
}

/** 登录成功：last_login_at 刷新 + attempts 归零 + locked_until 清空，一条 SQL */
export async function updateUserLoginSuccess(
  db: D1Database,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'UPDATE user SET last_login_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
    )
    .bind(now, userId)
    .run();
}

// ============================================================
// v0.7.5 账户管理 —— display_name / 改邮箱 / 注销账户
// ============================================================

const PENDING_EMAIL_CHANGE_TTL_MS = 30 * 60 * 1000;
export const MAX_EMAIL_CHANGE_ATTEMPTS = 5;

export interface PendingEmailChangeRow {
  user_id: string;
  new_email: string;
  code: string;
  attempt_count: number;
  expires_at: number;
  created_at: string;
}

export async function updateUserDisplayName(
  db: D1Database,
  userId: string,
  displayName: string | null,
): Promise<void> {
  await db
    .prepare('UPDATE user SET display_name = ? WHERE id = ?')
    .bind(displayName, userId)
    .run();
}

/** 创建（或覆盖）pending_email_change 行 + 返回 6 位 code 给调用方发邮件 */
export async function createPendingEmailChange(
  db: D1Database,
  userId: string,
  newEmail: string,
): Promise<{ code: string; expiresAt: number }> {
  const code = generateCode();
  const expiresAt = Date.now() + PENDING_EMAIL_CHANGE_TTL_MS;
  const now = new Date().toISOString();
  await db
    .prepare(`
      INSERT OR REPLACE INTO pending_email_change
        (user_id, new_email, code, attempt_count, expires_at, created_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `)
    .bind(userId, newEmail.toLowerCase().trim(), code, expiresAt, now)
    .run();
  return { code, expiresAt };
}

export async function findPendingEmailChange(
  db: D1Database,
  userId: string,
): Promise<PendingEmailChangeRow | null> {
  return db
    .prepare('SELECT * FROM pending_email_change WHERE user_id = ?')
    .bind(userId)
    .first<PendingEmailChangeRow>();
}

export type ConsumeEmailChangeResult =
  | { ok: true; row: PendingEmailChangeRow }
  | { ok: false; reason: 'not_found' | 'expired' | 'wrong_code' | 'locked' };

export async function consumePendingEmailChangeByCode(
  db: D1Database,
  userId: string,
  code: string,
): Promise<ConsumeEmailChangeResult> {
  const normCode = code.replace(/\D/g, '').trim();
  const row = await findPendingEmailChange(db, userId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.expires_at < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempt_count >= MAX_EMAIL_CHANGE_ATTEMPTS) {
    return { ok: false, reason: 'locked' };
  }
  if (normCode.length !== 6 || row.code !== normCode) {
    const next = row.attempt_count + 1;
    await db
      .prepare('UPDATE pending_email_change SET attempt_count = ? WHERE user_id = ?')
      .bind(next, userId)
      .run();
    if (next >= MAX_EMAIL_CHANGE_ATTEMPTS) return { ok: false, reason: 'locked' };
    return { ok: false, reason: 'wrong_code' };
  }
  return { ok: true, row };
}

export async function deletePendingEmailChange(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('DELETE FROM pending_email_change WHERE user_id = ?')
    .bind(userId)
    .run();
}

/** 改邮箱落库（确保 new_email 不冲突由调用方先 check） */
export async function updateUserEmail(
  db: D1Database,
  userId: string,
  newEmail: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE user
       SET email = ?, email_verified_at = ?
       WHERE id = ?`,
    )
    .bind(newEmail.toLowerCase().trim(), now, userId)
    .run();
}

/** 注销账户：删 user 行 → CASCADE 自动删 session / user_permission /
 *  tenant_member / user_progress / user_note / study_session / pending_email_change /
 *  password_reset 等（看各表 FK ON DELETE 设置）。
 *  不删 magic_link（语义上是"邮箱级"暂存，不是用户级）。 */
export async function deleteUserAndCascade(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('DELETE FROM user WHERE id = ?')
    .bind(userId)
    .run();
}

// ============================================================
// v0.7.4 password_reset —— 忘记密码 token
// ============================================================

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 分钟

export interface PasswordResetRow {
  token: string;
  user_id: string;
  expires_at: number;
  used_at: string | null;
  created_at: string;
}

/** 创建 reset token，返回 token 字符串供调用方组邮件链接 */
export async function createPasswordReset(
  db: D1Database,
  userId: string,
): Promise<{ token: string; expiresAt: number }> {
  const token = generateToken(32);
  const expiresAt = Date.now() + PASSWORD_RESET_TTL_MS;
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO password_reset (token, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)',
    )
    .bind(token, userId, expiresAt, now)
    .run();
  return { token, expiresAt };
}

export type ConsumeResetResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' };

/** 校验 + consume token（标 used_at）。成功返回 user_id 给调用方 UPDATE user。 */
export async function consumePasswordReset(
  db: D1Database,
  token: string,
): Promise<ConsumeResetResult> {
  const row = await db
    .prepare('SELECT * FROM password_reset WHERE token = ?')
    .bind(token)
    .first<PasswordResetRow>();
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.used_at) return { ok: false, reason: 'used' };
  if (row.expires_at < Date.now()) return { ok: false, reason: 'expired' };

  await db
    .prepare('UPDATE password_reset SET used_at = ? WHERE token = ?')
    .bind(new Date().toISOString(), token)
    .run();
  return { ok: true, userId: row.user_id };
}

/** 更新密码 + 解锁 + 刷新 password_changed_at（重置流 / settings 改密都用） */
export async function updateUserPassword(
  db: D1Database,
  userId: string,
  passwordHash: string,
  passwordSalt: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE user
       SET password_hash = ?, password_salt = ?, password_changed_at = ?,
           failed_attempts = 0, locked_until = NULL
       WHERE id = ?`,
    )
    .bind(passwordHash, passwordSalt, now, userId)
    .run();
}

/** 失效该 user 的所有 D1 session 行（重置密码 / 注销账户 / "退出所有设备"用）
 *
 *  注意：v0.3.5 后主要靠 signed cookie stateless，session 表行不一定存在；
 *  无 row 也是 OK 的（DELETE 无 match 不报错）。但 cookie 在 exp 前仍可能
 *  生效——这是已知 tradeoff（accept 在 README）。如果要绝对失效现存 cookie，
 *  得加 SESSION_SECRET rotation 或 token blacklist 表（v0.8+ SaaS 阶段再说）。
 */
export async function deleteAllSessionsForUser(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM session WHERE user_id = ?')
    .bind(userId)
    .run();
}

/** 创建注册的 user —— 区别于 findOrCreateUser（隐式登录用），这里是显式注册 */
export async function createSignupUser(
  db: D1Database,
  params: {
    email: string;
    passwordHash: string;
    salt: string;
    displayName: string | null;
  },
): Promise<User> {
  const id = generateToken(12);
  const now = new Date().toISOString();
  const normEmail = params.email.toLowerCase().trim();

  await db
    .prepare(`
      INSERT INTO user
        (id, email, display_name, created_at, email_verified_at,
         password_hash, password_salt, password_changed_at, last_login_at,
         failed_attempts, locked_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
    `)
    .bind(
      id, normEmail, params.displayName, now, now,
      params.passwordHash, params.salt, now, now,
    )
    .run();

  const user = await db
    .prepare('SELECT * FROM user WHERE email = ?')
    .bind(normEmail)
    .first<User>();
  if (!user) throw new Error(`createSignupUser: user vanished after INSERT for ${normEmail}`);
  return user;
}
