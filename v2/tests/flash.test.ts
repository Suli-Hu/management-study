import { describe, expect, test } from 'vitest';
import {
  buildFlashCookie,
  buildFlashClearCookie,
  readFlash,
  FLASH_COOKIE,
} from '../src/lib/flash';

describe('buildFlashCookie', () => {
  test('JSON encoded + Max-Age=60 + HttpOnly', () => {
    const c = buildFlashCookie({ error: 'bad_password' }, true);
    expect(c).toContain(`${FLASH_COOKIE}=`);
    expect(c).toContain('Max-Age=60');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
  });
  test('dev mode no Secure', () => {
    const c = buildFlashCookie({ k: 'v' }, false);
    expect(c).not.toContain('Secure');
  });
  test('multiple keys in payload', () => {
    const c = buildFlashCookie({ email: 'a@b.c', error: 'x' }, false);
    const value = c.split(';')[0].split('=').slice(1).join('=');
    const decoded = JSON.parse(decodeURIComponent(value));
    expect(decoded.email).toBe('a@b.c');
    expect(decoded.error).toBe('x');
  });
});

describe('buildFlashClearCookie', () => {
  test('Max-Age=0', () => {
    const c = buildFlashClearCookie(false);
    expect(c).toContain('Max-Age=0');
    expect(c).toContain(`${FLASH_COOKIE}=;`);
  });
});

describe('readFlash', () => {
  test('round-trip: buildFlashCookie → readFlash', () => {
    const set = buildFlashCookie({ error: 'bad_password' }, false);
    const cookieHeader = set.split(';')[0]; // 只要 "flash=..." 部分
    const got = readFlash(cookieHeader);
    expect(got).toEqual({ error: 'bad_password' });
  });
  test('null / empty', () => {
    expect(readFlash(null)).toBeNull();
    expect(readFlash(undefined)).toBeNull();
    expect(readFlash('')).toBeNull();
    expect(readFlash('other=1')).toBeNull();
  });
  test('malformed JSON returns null', () => {
    expect(readFlash(`${FLASH_COOKIE}=not-json`)).toBeNull();
  });
  test('array not accepted', () => {
    const bad = `${FLASH_COOKIE}=${encodeURIComponent(JSON.stringify([1,2]))}`;
    expect(readFlash(bad)).toBeNull();
  });
  test('multiple cookies in header — finds flash', () => {
    const set = buildFlashCookie({ email: 'a@b.c' }, false);
    const flashPair = set.split(';')[0];
    const header = `session=xxx; ${flashPair}; other=yy`;
    expect(readFlash(header)).toEqual({ email: 'a@b.c' });
  });
  test('values coerced to string (defense against injected non-string payloads)', () => {
    const weird = `${FLASH_COOKIE}=${encodeURIComponent(JSON.stringify({ n: 42, b: true, u: null }))}`;
    expect(readFlash(weird)).toEqual({ n: '42', b: 'true', u: '' });
  });
});
