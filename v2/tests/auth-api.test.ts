/**
 * Auth API integration tests — logout + password 路由的 HTTP 层行为。
 *
 * v0.7.6 起 magic-link 登录路径（/api/auth/login / verify / verify-code）
 * 已删除，相关测试也一并删除；signup / password reset / login-password /
 * account 等新路径有各自的 *.test.ts。
 *
 * 不重测 lib/auth 内部（已在 auth.test.ts 覆盖），聚焦 route wiring。
 */

import { describe, expect, test } from 'vitest';
import { POST as passwordPOST } from '../src/pages/api/auth/password';
import { POST as logoutPOST } from '../src/pages/api/auth/logout';
import type { APIContext } from 'astro';

// ========== 最小 D1 mock ==========
// 策略：per-test 用 handler 控制返回，避免真建 sqlite 拖慢 CI。

interface MockRows {
  rows?: unknown[];
  meta?: { success: boolean; changes?: number; last_row_id?: number };
}
type MockHandler = (sql: string, binds: unknown[]) => MockRows | undefined;

function createMockD1(handler: MockHandler = () => ({ rows: [], meta: { success: true, changes: 0 } })) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          calls.push({ sql, binds });
          const r = handler(sql, binds);
          return ((r?.rows?.[0] ?? null) as T | null);
        },
        async all<T = unknown>(): Promise<{ results: T[] }> {
          calls.push({ sql, binds });
          const r = handler(sql, binds);
          return { results: (r?.rows ?? []) as T[] };
        },
        async run(): Promise<{ success: boolean; meta: Record<string, unknown> }> {
          calls.push({ sql, binds });
          const r = handler(sql, binds);
          return { success: r?.meta?.success ?? true, meta: r?.meta ?? {} };
        },
      };
      return stmt;
    },
    async batch(_stmts: unknown[]) {
      return [];
    },
    async exec(_sql: string) {
      return { count: 0, duration: 0 };
    },
    calls,
  };
  return db;
}

// ========== 最小 APIContext mock ==========

function makeCtx(request: Request, env: Record<string, unknown>): APIContext {
  const url = new URL(request.url);
  return {
    request,
    url,
    params: {},
    props: {},
    locals: { runtime: { env } } as unknown as APIContext['locals'],
    redirect: () => new Response(null, { status: 302 }),
    cookies: {} as unknown as APIContext['cookies'],
    clientAddress: '127.0.0.1',
    site: undefined,
    generator: 'test',
    preferredLocale: undefined,
    preferredLocaleList: undefined,
    currentLocale: undefined,
    routePattern: '',
    originPathname: url.pathname,
    isPrerendered: false,
    getActionResult: () => undefined,
    callAction: () => Promise.resolve(undefined) as never,
    rewrite: () => Promise.resolve(new Response()) as never,
  } as unknown as APIContext;
}

function formReq(url: string, body: Record<string, string>): Request {
  const fd = new URLSearchParams(body);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: fd.toString(),
  });
}

// ========== /api/auth/logout ==========

describe('POST /api/auth/logout', () => {
  test('302 to / + clear cookie（dev, 无 Secure）', async () => {
    const req = new Request('http://localhost:4321/api/auth/logout', { method: 'POST' });
    const res = await logoutPOST(makeCtx(req, {}));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('http://localhost:4321/');
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).not.toContain('Secure');
  });

  test('prod HTTPS → Secure flag', async () => {
    const req = new Request('https://app.example.com/api/auth/logout', { method: 'POST' });
    const res = await logoutPOST(makeCtx(req, {}));
    expect(res.headers.get('Set-Cookie')).toContain('Secure');
  });
});

// ========== /api/auth/password ==========

describe('POST /api/auth/password', () => {
  const baseEnv = {
    AUTH_MODE: 'password',
    ADMIN_PASSWORD: 'admin-pw-secret',
    GUEST_PASSWORD: 'guest-pw-secret',
    ADMIN_EMAILS: 'admin@test.com',
    GUEST_EMAIL: 'guest@test.local',
    SESSION_SECRET: 'test-secret',
  };

  test('AUTH_MODE != password → 404', async () => {
    const req = formReq('http://localhost/api/auth/password', { password: 'x' });
    const res = await passwordPOST(makeCtx(req, { ...baseEnv, AUTH_MODE: 'email', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('空 password → 303 /login + bad_password flash', async () => {
    const req = formReq('http://localhost/api/auth/password', { password: '' });
    const res = await passwordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/login');
    expect(res.headers.get('Set-Cookie') ?? '').toContain('flash=');
  });

  test('错 password → 303 /login + bad_password flash', async () => {
    const req = formReq('http://localhost/api/auth/password', { password: 'wrong' });
    const res = await passwordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/login');
  });

  test('admin password → 303 / + signed session cookie', async () => {
    // findOrCreateUser: 第一次查无 → insert → 返回新 user
    const now = new Date().toISOString();
    let userCreated = false;
    const db = createMockD1((sql) => {
      if (/SELECT.*FROM user.*WHERE email/i.test(sql) && !userCreated) {
        return { rows: [] };
      }
      if (/INSERT.*INTO user/i.test(sql)) {
        userCreated = true;
        return { meta: { success: true, changes: 1 } };
      }
      if (/SELECT.*FROM user.*WHERE email/i.test(sql) && userCreated) {
        return {
          rows: [{
            id: 'u-admin-1',
            email: 'admin@test.com',
            display_name: null,
            created_at: now,
            email_verified_at: now,
          }],
        };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/password', {
      password: 'admin-pw-secret',
      remember: '1',
    });
    const res = await passwordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('session=');
    expect(cookie).toContain('Max-Age='); // remember=1
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  test('guest password → 303 / + session cookie', async () => {
    const now = new Date().toISOString();
    let created = false;
    const db = createMockD1((sql) => {
      if (/SELECT.*FROM user.*WHERE email/i.test(sql) && !created) return { rows: [] };
      if (/INSERT.*INTO user/i.test(sql)) { created = true; return { meta: { success: true, changes: 1 } }; }
      if (/SELECT.*FROM user.*WHERE email/i.test(sql)) {
        return { rows: [{ id: 'u-guest-1', email: 'guest@test.local', display_name: null, created_at: now, email_verified_at: now }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/password', { password: 'guest-pw-secret' });
    const res = await passwordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Set-Cookie')).toContain('session=');
  });

  test('remember=false 无 Max-Age（session cookie 随浏览器关闭过期）', async () => {
    const now = new Date().toISOString();
    let created = false;
    const db = createMockD1((sql) => {
      if (/SELECT.*FROM user.*WHERE email/i.test(sql) && !created) return { rows: [] };
      if (/INSERT.*INTO user/i.test(sql)) { created = true; return { meta: { success: true, changes: 1 } }; }
      if (/SELECT.*FROM user.*WHERE email/i.test(sql)) {
        return { rows: [{ id: 'u1', email: 'admin@test.com', display_name: null, created_at: now, email_verified_at: now }] };
      }
      return { rows: [], meta: { success: true } };
    });
    // form 不带 remember 字段 → body.get('remember') === null → remember=false
    const req = formReq('http://localhost/api/auth/password', { password: 'admin-pw-secret' });
    const res = await passwordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('session=');
    expect(cookie).not.toContain('Max-Age=');
  });
});
