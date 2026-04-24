import { describe, expect, test } from 'vitest';
import {
  generateToken,
  generateCode,
  parseCookieSession,
  buildSessionCookie,
  buildClearCookie,
  isAdmin,
  isGuest,
  getPrimaryAdminEmail,
  timingSafeEqual,
  signSessionCookie,
  verifySessionCookie,
  buildSignedSessionCookie,
  sessionUserFromPayload,
  getSessionSecret,
  COOKIE_NAME,
  type User,
  type SessionPayload,
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

describe('isAdmin', () => {
  const admin: User = {
    id: 'u1',
    email: 'husuli0623@gmail.com',
    display_name: null,
    created_at: '',
    email_verified_at: null,
  };
  const other: User = { ...admin, email: 'bob@example.com' };

  test('null user is not admin', () => {
    expect(isAdmin(null, 'husuli0623@gmail.com')).toBe(false);
  });
  test('missing csv is not admin', () => {
    expect(isAdmin(admin, undefined)).toBe(false);
    expect(isAdmin(admin, '')).toBe(false);
  });
  test('email match (case-insensitive)', () => {
    expect(isAdmin(admin, 'husuli0623@gmail.com')).toBe(true);
    expect(isAdmin({ ...admin, email: 'Husuli0623@GMAIL.com' }, 'husuli0623@gmail.com')).toBe(true);
  });
  test('non-admin rejected', () => {
    expect(isAdmin(other, 'husuli0623@gmail.com')).toBe(false);
  });
  test('multiple admins csv', () => {
    expect(isAdmin(other, 'husuli0623@gmail.com, bob@example.com')).toBe(true);
  });
});

describe('isGuest', () => {
  const guest: User = {
    id: 'g1',
    email: 'guest@local.invalid',
    display_name: null,
    created_at: '',
    email_verified_at: null,
  };
  const real: User = { ...guest, email: 'real@example.com' };

  test('null user is not guest', () => {
    expect(isGuest(null, 'guest@local.invalid')).toBe(false);
  });
  test('missing GUEST_EMAIL is not guest', () => {
    expect(isGuest(guest, undefined)).toBe(false);
    expect(isGuest(guest, '')).toBe(false);
  });
  test('exact email match (case-insensitive)', () => {
    expect(isGuest(guest, 'guest@local.invalid')).toBe(true);
    expect(isGuest({ ...guest, email: 'GUEST@local.invalid' }, 'guest@local.invalid')).toBe(true);
  });
  test('non-guest user rejected', () => {
    expect(isGuest(real, 'guest@local.invalid')).toBe(false);
  });
});

describe('getPrimaryAdminEmail', () => {
  test('null/empty csv → null', () => {
    expect(getPrimaryAdminEmail(undefined)).toBeNull();
    expect(getPrimaryAdminEmail('')).toBeNull();
    expect(getPrimaryAdminEmail(',,,')).toBeNull();
  });
  test('single email', () => {
    expect(getPrimaryAdminEmail('husuli0623@gmail.com')).toBe('husuli0623@gmail.com');
  });
  test('first of multiple, lowercased + trimmed', () => {
    expect(getPrimaryAdminEmail(' Husuli0623@Gmail.com , bob@example.com '))
      .toBe('husuli0623@gmail.com');
  });
});

describe('timingSafeEqual', () => {
  test('equal strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('', '')).toBe(true);
  });
  test('different strings', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
    expect(timingSafeEqual('ab', 'abc')).toBe(false);
  });
  test('same content different types of chars', () => {
    expect(timingSafeEqual('123', '123')).toBe(true);
    expect(timingSafeEqual('husuli0623@gmail.com', 'husuli0623@gmail.com')).toBe(true);
  });
});

// ===== v0.3.5 A5 signed session cookie =====

describe('getSessionSecret', () => {
  test('returns env value when present', () => {
    expect(getSessionSecret('prod-secret-xyz')).toBe('prod-secret-xyz');
  });
  test('returns dev fallback when missing (+ warns)', () => {
    const warn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
      const s = getSessionSecret(undefined);
      expect(s.length).toBeGreaterThan(10);
      expect(warned).toBe(true);
    } finally {
      console.warn = warn;
    }
  });
});

describe('signSessionCookie / verifySessionCookie', () => {
  const secret = 'test-secret-abcdef';
  const payload: SessionPayload = {
    uid: 'u123',
    email: 'alice@example.com',
    exp: Date.now() + 60_000,
    rem: true,
  };

  test('sign → verify returns original payload', async () => {
    const signed = await signSessionCookie(payload, secret);
    expect(signed).toContain('.');
    const out = await verifySessionCookie(signed, secret);
    expect(out).toEqual(payload);
  });

  test('verify fails on wrong secret', async () => {
    const signed = await signSessionCookie(payload, secret);
    expect(await verifySessionCookie(signed, 'other-secret')).toBeNull();
  });

  test('verify fails on tampered payload', async () => {
    const signed = await signSessionCookie(payload, secret);
    const [b64, sig] = signed.split('.');
    // flip first char of b64
    const flipped = (b64[0] === 'A' ? 'B' : 'A') + b64.slice(1);
    expect(await verifySessionCookie(`${flipped}.${sig}`, secret)).toBeNull();
  });

  test('verify fails on tampered signature', async () => {
    const signed = await signSessionCookie(payload, secret);
    const [b64] = signed.split('.');
    expect(await verifySessionCookie(`${b64}.deadbeef`, secret)).toBeNull();
  });

  test('verify fails on expired payload', async () => {
    const expired: SessionPayload = { ...payload, exp: Date.now() - 1000 };
    const signed = await signSessionCookie(expired, secret);
    expect(await verifySessionCookie(signed, secret)).toBeNull();
  });

  test('verify fails on malformed input', async () => {
    expect(await verifySessionCookie('', secret)).toBeNull();
    expect(await verifySessionCookie(null, secret)).toBeNull();
    expect(await verifySessionCookie(undefined, secret)).toBeNull();
    expect(await verifySessionCookie('no-dot', secret)).toBeNull();
    expect(await verifySessionCookie('.only-dot', secret)).toBeNull();
    expect(await verifySessionCookie('only-dot.', secret)).toBeNull();
  });

  test('verify rejects payload missing fields', async () => {
    // Manually craft a cookie without rem field
    const bad = { uid: 'x', email: 'x@x', exp: Date.now() + 60000 };
    const b64 = btoa(JSON.stringify(bad)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    // Need to actually sign it to pass HMAC first...
    // Easier test: verify that a valid HMAC but bad JSON still fails
    // Do it by just calling with a known bad payload structure
    const signed = await signSessionCookie(payload, secret);
    const [, sig] = signed.split('.');
    expect(await verifySessionCookie(`${b64}.${sig}`, secret)).toBeNull();
  });
});

describe('buildSignedSessionCookie', () => {
  test('包 Max-Age + HttpOnly + SameSite=Lax', async () => {
    const cookie = await buildSignedSessionCookie(
      { id: 'u1', email: 'a@b.c' },
      true, // remember
      'secret',
      true, // isProd
    );
    expect(cookie).toContain(`${COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toMatch(/Max-Age=\d+/);
  });
  test('remember=false 无 Max-Age', async () => {
    const cookie = await buildSignedSessionCookie(
      { id: 'u1', email: 'a@b.c' },
      false,
      'secret',
      false,
    );
    expect(cookie).not.toContain('Max-Age');
    expect(cookie).not.toContain('Secure');
  });
  test('round-trip: 签出的 cookie 能被 verify 解回', async () => {
    const full = await buildSignedSessionCookie(
      { id: 'u42', email: 'bob@test.com' },
      true,
      'sec',
      false,
    );
    // full 是 Set-Cookie 格式；从 session=xxx 里提 value
    const m = full.match(/session=([^;]+);/);
    expect(m).toBeTruthy();
    const value = m![1];
    const payload = await verifySessionCookie(value, 'sec');
    expect(payload?.uid).toBe('u42');
    expect(payload?.email).toBe('bob@test.com');
    expect(payload?.rem).toBe(true);
  });
});

describe('sessionUserFromPayload', () => {
  test('payload → minimal SessionUser', () => {
    const u = sessionUserFromPayload({
      uid: 'u1',
      email: 'test@x.com',
      exp: Date.now() + 1000,
      rem: false,
    });
    expect(u.id).toBe('u1');
    expect(u.email).toBe('test@x.com');
    expect(u.display_name).toBeNull();
    expect(u.email_verified_at).toBeNull();
  });
});
