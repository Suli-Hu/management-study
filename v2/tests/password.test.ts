/**
 * password lib tests (v0.7.1)
 *
 * 覆盖：
 *   - 强度校验（长度 / 字母 / 数字 / 常见密码）
 *   - hash/verify roundtrip + 不同 salt 不同 hash
 *   - verify wrong password / wrong salt / corrupt input
 *   - timing-safe 比较的边界
 *   - lock state 转移：失败累积、达阈值锁定、锁定窗口判定
 *   - PBKDF2 性能 budget（Workers 上 < 200ms / call）
 */

import { describe, expect, test } from 'vitest';
import {
  checkPasswordStrength,
  hashPassword,
  verifyPassword,
  generateSalt,
  timingSafeEqualHex,
  isLocked,
  applyFailedAttempt,
  resetFailedAttempts,
  MAX_FAILED_ATTEMPTS,
  LOCK_DURATION_MS,
} from '../src/lib/password';

// ============================================================
// Strength check
// ============================================================

describe('checkPasswordStrength', () => {
  test('合法 8 位含字母+数字 → ok', () => {
    expect(checkPasswordStrength('abcd1234').ok).toBe(true);
  });

  test('长合法密码 → ok', () => {
    expect(checkPasswordStrength('Sl#82521210').ok).toBe(true);
  });

  test('7 位 → too_short', () => {
    expect(checkPasswordStrength('abc1234').reason).toBe('too_short');
  });

  test('空字符串 → too_short', () => {
    expect(checkPasswordStrength('').reason).toBe('too_short');
  });

  test('8 位纯数字 → no_letter', () => {
    expect(checkPasswordStrength('12345678').reason).toBe('no_letter');
  });

  test('8 位纯字母 → no_digit', () => {
    expect(checkPasswordStrength('abcdefgh').reason).toBe('no_digit');
  });

  test('"password1" → too_common', () => {
    expect(checkPasswordStrength('password1').reason).toBe('too_common');
  });

  test('大小写常见密码也判断 → too_common', () => {
    expect(checkPasswordStrength('PASSWORD1').reason).toBe('too_common');
  });

  test('特殊符号不强求', () => {
    // 没特殊符号但够长 + 含字母数字 → ok
    expect(checkPasswordStrength('myPass2026').ok).toBe(true);
  });

  test('Unicode 字母不算字母（设计选择，避免输入法歧义）', () => {
    // /[a-zA-Z]/ 只匹配 ASCII 字母 —— 8 字符中文 + 数字应该 fail no_letter
    expect(checkPasswordStrength('中文密码1234').reason).toBe('no_letter');
  });
});

// ============================================================
// Salt generation
// ============================================================

describe('generateSalt', () => {
  test('返回 base64url 22 字符（16 字节 padding 去掉）', () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  test('两次生成不重复（高概率）', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toBe(b);
  });
});

// ============================================================
// Hash + Verify roundtrip
// ============================================================

describe('hashPassword / verifyPassword', () => {
  test('hash → verify 同密码返回 true', async () => {
    const { hash, salt } = await hashPassword('Sl#82521210');
    expect(await verifyPassword('Sl#82521210', hash, salt)).toBe(true);
  });

  test('hash 是 64 字符 hex', async () => {
    const { hash } = await hashPassword('abcd1234');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('错误密码 → false', async () => {
    const { hash, salt } = await hashPassword('correct1');
    expect(await verifyPassword('wrong123', hash, salt)).toBe(false);
  });

  test('同密码不同 salt 产生不同 hash', async () => {
    const a = await hashPassword('samepass1');
    const b = await hashPassword('samepass1');
    expect(a.hash).not.toBe(b.hash);
    expect(a.salt).not.toBe(b.salt);
  });

  test('verify 用错的 salt → false', async () => {
    const { hash } = await hashPassword('Sl#82521210');
    const wrongSalt = generateSalt();
    expect(await verifyPassword('Sl#82521210', hash, wrongSalt)).toBe(false);
  });

  test('verify 大小写敏感', async () => {
    const { hash, salt } = await hashPassword('CaseSensitive1');
    expect(await verifyPassword('casesensitive1', hash, salt)).toBe(false);
    expect(await verifyPassword('CaseSensitive1', hash, salt)).toBe(true);
  });

  test('verify 空密码 → false', async () => {
    const { hash, salt } = await hashPassword('something1');
    expect(await verifyPassword('', hash, salt)).toBe(false);
  });

  test('verify 空 hash → false', async () => {
    expect(await verifyPassword('something1', '', generateSalt())).toBe(false);
  });

  test('verify 空 salt → false', async () => {
    const { hash } = await hashPassword('something1');
    expect(await verifyPassword('something1', hash, '')).toBe(false);
  });

  test('verify 错长度 hash → false（不抛）', async () => {
    expect(await verifyPassword('something1', 'tooshort', generateSalt())).toBe(false);
    expect(await verifyPassword('something1', 'a'.repeat(63), generateSalt())).toBe(false);
    expect(await verifyPassword('something1', 'a'.repeat(65), generateSalt())).toBe(false);
  });

  test('verify 错长度 salt → false（不抛）', async () => {
    const { hash } = await hashPassword('something1');
    // 太短的 salt（解码后 < 16 字节）
    expect(await verifyPassword('something1', hash, 'aGVsbG8')).toBe(false);
  });

  test('verify 非法 base64 salt → false（不抛）', async () => {
    const { hash } = await hashPassword('something1');
    // 含非 base64url 字符
    expect(await verifyPassword('something1', hash, '!!!@@@###$$$%%%^^^&&&*')).toBe(false);
  });
});

// ============================================================
// timingSafeEqualHex
// ============================================================

describe('timingSafeEqualHex', () => {
  test('同字符串 → true', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true);
  });

  test('不同字符串 → false', () => {
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false);
  });

  test('长度不同 → false（不抛）', () => {
    expect(timingSafeEqualHex('abc', 'abcd')).toBe(false);
  });

  test('空字符串相等', () => {
    expect(timingSafeEqualHex('', '')).toBe(true);
  });
});

// ============================================================
// Lock state
// ============================================================

describe('isLocked', () => {
  test('null user → false', () => {
    expect(isLocked(null)).toBe(false);
  });

  test('locked_until 为 null → false', () => {
    expect(isLocked({ failed_attempts: 0, locked_until: null })).toBe(false);
  });

  test('locked_until 在未来 → true', () => {
    const future = Date.now() + 60_000;
    expect(isLocked({ failed_attempts: 5, locked_until: future })).toBe(true);
  });

  test('locked_until 在过去 → false', () => {
    const past = Date.now() - 60_000;
    expect(isLocked({ failed_attempts: 5, locked_until: past })).toBe(false);
  });

  test('支持注入 now（测试边界）', () => {
    const t = 1_000_000_000;
    expect(isLocked({ failed_attempts: 5, locked_until: t + 1 }, t)).toBe(true);
    expect(isLocked({ failed_attempts: 5, locked_until: t - 1 }, t)).toBe(false);
    expect(isLocked({ failed_attempts: 5, locked_until: t }, t)).toBe(false); // 不含等号
  });
});

describe('applyFailedAttempt', () => {
  test('第 1 次失败 → attempts=1, 未锁', () => {
    const next = applyFailedAttempt({ failed_attempts: 0, locked_until: null });
    expect(next.failed_attempts).toBe(1);
    expect(next.locked_until).toBeNull();
  });

  test('第 4 次失败（阈值前）→ attempts=4, 仍未锁', () => {
    const next = applyFailedAttempt({ failed_attempts: 3, locked_until: null });
    expect(next.failed_attempts).toBe(4);
    expect(next.locked_until).toBeNull();
  });

  test('第 5 次失败（达阈值）→ attempts=5, 锁 30 分钟', () => {
    const now = 1_000_000_000;
    const next = applyFailedAttempt({ failed_attempts: 4, locked_until: null }, now);
    expect(next.failed_attempts).toBe(5);
    expect(next.locked_until).toBe(now + LOCK_DURATION_MS);
  });

  test('达阈值后再失败 → attempts 继续累加，锁刷新', () => {
    const now = 1_000_000_000;
    const next = applyFailedAttempt({ failed_attempts: 5, locked_until: now - 100 }, now);
    expect(next.failed_attempts).toBe(6);
    expect(next.locked_until).toBe(now + LOCK_DURATION_MS);
  });

  test('MAX_FAILED_ATTEMPTS = 5（常量校验）', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
  });

  test('LOCK_DURATION_MS = 30 分钟', () => {
    expect(LOCK_DURATION_MS).toBe(30 * 60 * 1000);
  });
});

describe('resetFailedAttempts', () => {
  test('归零状态', () => {
    expect(resetFailedAttempts()).toEqual({ failed_attempts: 0, locked_until: null });
  });
});

// ============================================================
// 性能 budget
// ============================================================

describe('PBKDF2 性能', () => {
  test('单次 hash < 500ms（CI 环境放宽 limit）', async () => {
    const start = Date.now();
    await hashPassword('benchmark1');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  test('verify 跟 hash 同数量级', async () => {
    const { hash, salt } = await hashPassword('benchmark2');
    const start = Date.now();
    await verifyPassword('benchmark2', hash, salt);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
