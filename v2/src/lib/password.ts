/**
 * Password helpers — PBKDF2 hash + verify + strength check (v0.7.1)
 *
 * 算法选择：PBKDF2-SHA256, 100k 轮, 16 字节 salt, 32 字节 derived key
 *   - WebCrypto 原生支持（CF Workers 环境兼容）
 *   - 100k 轮在 Workers 上 ~30-50ms / call —— 登录可接受，注册可接受
 *   - scrypt / argon2id 强度更好但需要 WASM，权衡选 PBKDF2
 *
 * 存储格式：
 *   - hash: hex 字符串（64 字符 = 32 字节）
 *   - salt: base64url 字符串（22 字符 = 16 字节）
 *
 * 强度策略（D3 决定，自用 + 未来 SaaS 平衡）：
 *   - 长度 ≥ 8
 *   - 至少含 1 字母 + 1 数字
 *   - 不强求特殊符号（避免烦扰）
 *   - 不查字典（避免依赖）
 *
 * 锁定策略（D4 决定）：
 *   - 连续 5 次失败 → 锁 30 分钟
 *   - 锁定时直接拒绝，不验证密码（防 timing 区分锁/未锁状态）
 */

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_BYTES = 32;
const SALT_BYTES = 16;

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 分钟

// ============================================================
// 编码工具（独立实现，跟 auth.ts 风格一致）
// ============================================================

function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ============================================================
// 强度校验
// ============================================================

export interface PasswordStrengthResult {
  ok: boolean;
  reason?: 'too_short' | 'no_letter' | 'no_digit' | 'too_common';
  message?: string;
}

const COMMON_PASSWORDS = new Set([
  '12345678', 'password', 'qwerty12', 'abc12345',
  'password1', 'admin123', 'letmein1', 'welcome1',
  '11111111', '00000000', 'asdfghjk',
]);

/** 校验密码强度。前端 + 后端双校验同一函数，规则不漂移。 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  if (password.length < 8) {
    return { ok: false, reason: 'too_short', message: '密码至少 8 位' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, reason: 'no_letter', message: '密码必须包含字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, reason: 'no_digit', message: '密码必须包含数字' };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, reason: 'too_common', message: '密码过于常见' };
  }
  return { ok: true };
}

// ============================================================
// Hash / Verify (PBKDF2-SHA256)
// ============================================================

export interface HashedPassword {
  hash: string;  // hex (64 chars)
  salt: string;  // base64url (22 chars)
}

/** 生成 16 字节 random salt → base64url */
export function generateSalt(): string {
  const buf = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(buf);
  return bytesToB64url(buf);
}

/** PBKDF2 derive 32 字节 → hex */
async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBytes(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    PBKDF2_HASH_BYTES * 8,
  );
  return bytesToHex(bits);
}

/** 给定明文密码 → { hash, salt }（salt 自动生成） */
export async function hashPassword(password: string): Promise<HashedPassword> {
  const salt = generateSalt();
  const hash = await pbkdf2(password, b64urlToBytes(salt));
  return { hash, salt };
}

/** 给定明文密码 + 已存的 salt → 重新算 hash 跟 expectedHash 常量时间比较 */
export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
): Promise<boolean> {
  // basic format guard：避免 b64urlToBytes 抛错
  if (!password || !expectedHash || !salt) return false;
  if (expectedHash.length !== PBKDF2_HASH_BYTES * 2) return false;
  let saltBytes: Uint8Array;
  try {
    saltBytes = b64urlToBytes(salt);
  } catch {
    return false;
  }
  if (saltBytes.length !== SALT_BYTES) return false;

  const computed = await pbkdf2(password, saltBytes);
  return timingSafeEqualHex(computed, expectedHash);
}

/** 常量时间字符串比较（hex 字符）—— 防 timing attack 区分前缀匹配长度 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// Lock helpers
// ============================================================

export interface UserLockState {
  failed_attempts: number;
  locked_until: number | null;
}

/** 当前是否处于锁定窗口内 */
export function isLocked(user: UserLockState | null | undefined, now = Date.now()): boolean {
  if (!user?.locked_until) return false;
  return user.locked_until > now;
}

/** 失败尝试 +1 后应得的下一个状态（不直接写库，调用方决定何时落库） */
export function applyFailedAttempt(
  current: UserLockState,
  now = Date.now(),
): UserLockState {
  const nextAttempts = current.failed_attempts + 1;
  if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failed_attempts: nextAttempts,
      locked_until: now + LOCK_DURATION_MS,
    };
  }
  return {
    failed_attempts: nextAttempts,
    locked_until: current.locked_until,
  };
}

/** 登录成功后归零状态 */
export function resetFailedAttempts(): UserLockState {
  return { failed_attempts: 0, locked_until: null };
}
