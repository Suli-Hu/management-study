import { describe, expect, test } from 'vitest';
import {
  generateToken,
  generateCode,
  parseCookieSession,
  buildSessionCookie,
  buildClearCookie,
  COOKIE_NAME,
} from '../src/lib/auth';

describe('generateToken', () => {
  test('default 32 bytes → 43 char URL-safe base64', () => {
    const t = generateToken();
    expect(t.length).toBe(43); // 32 bytes = 43 chars base64url (no padding)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('unique across calls', () => {
    const s = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(s.size).toBe(100);
  });

  test('custom byte count', () => {
    const t = generateToken(12);
    // 12 bytes base64 = 16 chars, minus "==" padding = 16
    expect(t.length).toBe(16);
  });
});

describe('generateCode', () => {
  test('always 6 digits, leading zeros preserved', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });

  test('distribution across many samples (not a constant value)', () => {
    const set = new Set(Array.from({ length: 50 }, () => generateCode()));
    // 50 samples from 10^6 space — all equal would be astronomically unlikely
    expect(set.size).toBeGreaterThan(40);
  });
});

describe('parseCookieSession', () => {
  test('null / empty cookie header', () => {
    expect(parseCookieSession(null)).toBeNull();
    expect(parseCookieSession('')).toBeNull();
    expect(parseCookieSession(undefined)).toBeNull();
  });

  test('single session cookie', () => {
    expect(parseCookieSession(`${COOKIE_NAME}=abc123`)).toBe('abc123');
  });

  test('session cookie among others', () => {
    expect(parseCookieSession(`_ga=foo; ${COOKIE_NAME}=xyz; theme=dark`)).toBe('xyz');
  });

  test('no session cookie → null', () => {
    expect(parseCookieSession('_ga=foo; theme=dark')).toBeNull();
  });
});

describe('buildSessionCookie', () => {
  test('prod: includes Secure', () => {
    const c = buildSessionCookie('abc', true);
    expect(c).toContain(`${COOKIE_NAME}=abc`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain('Secure');
    expect(c).toMatch(/Max-Age=\d+/);
  });

  test('dev: no Secure', () => {
    const c = buildSessionCookie('abc', false);
    expect(c).not.toContain('Secure');
  });
});

describe('buildClearCookie', () => {
  test('empty value + Max-Age=0', () => {
    const c = buildClearCookie(true);
    expect(c).toContain(`${COOKIE_NAME}=`);
    expect(c).toContain('Max-Age=0');
  });
});
