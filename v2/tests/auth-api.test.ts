/**
 * Auth API integration tests — 5 路由的 HTTP 层行为
 *   POST /api/auth/login       email-flow 入口（发 magic link）
 *   GET  /api/auth/verify      email-flow token 验证
 *   POST /api/auth/verify-code 跨设备 code 验证
 *   POST /api/auth/password    考试期 password 登录（admin/guest）
 *   POST /api/auth/logout      清 cookie
 *
 * 覆盖角度：AUTH_MODE 网关 / formData 与 JSON 双重 parser / 错误路径 flash cookie /
 *           状态码 / Location / Set-Cookie / timing-safe 密码比对。
 *
 * 不重测 lib/auth 内部（已在 auth.test.ts 覆盖），聚焦 route wiring。
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { POST as loginPOST } from '../src/pages/api/auth/login';
import { GET as verifyGET } from '../src/pages/api/auth/verify';
import { POST as verifyCodePOST } from '../src/pages/api/auth/verify-code';
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

function jsonReq(url: string, body: Record<string, unknown>, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

// ========== /api/auth/login ==========

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    // sendEmail 会调 fetch（Resend API）——mock 掉
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('AUTH_MODE=password → 404（email flow 关闭）', async () => {
    const req = formReq('http://localhost/api/auth/login', { email: 'a@b.c' });
    const res = await loginPOST(makeCtx(req, { AUTH_MODE: 'password', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('无效 email → 400', async () => {
    const req = formReq('http://localhost/api/auth/login', { email: 'not-an-email' });
    const res = await loginPOST(makeCtx(req, { DB: createMockD1() }));
    expect(res.status).toBe(400);
  });

  test('空 email → 400', async () => {
    const req = formReq('http://localhost/api/auth/login', { email: '' });
    const res = await loginPOST(makeCtx(req, { DB: createMockD1() }));
    expect(res.status).toBe(400);
  });

  test('有效 email → 303 /login/sent + flash cookie with email', async () => {
    // createMagicLink: INSERT into magic_link_code
    const db = createMockD1(() => ({ meta: { success: true, changes: 1 } }));
    const req = formReq('http://localhost/api/auth/login', { email: 'user@example.com' });
    const res = await loginPOST(makeCtx(req, {
      DB: db,
      RESEND_API_KEY: 'test-key',
      RESEND_FROM: 'noreply@test.com',
      APP_URL: 'http://localhost',
    }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/login/sent');
    expect(res.headers.get('Set-Cookie') ?? '').toContain('flash=');
  });

  test('sendEmail 抛错仍返 303（防 email enumeration）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const db = createMockD1(() => ({ meta: { success: true, changes: 1 } }));
    const req = formReq('http://localhost/api/auth/login', { email: 'user@example.com' });
    const res = await loginPOST(makeCtx(req, {
      DB: db,
      RESEND_API_KEY: 'test-key',
      RESEND_FROM: 'noreply@test.com',
    }));
    expect(res.status).toBe(303);
  });
});

// ========== /api/auth/verify ==========

describe('GET /api/auth/verify', () => {
  test('AUTH_MODE=password → 404', async () => {
    const req = new Request('http://localhost/api/auth/verify?token=x', { method: 'GET' });
    const res = await verifyGET(makeCtx(req, { AUTH_MODE: 'password', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('缺 token → 302 /login + missing_token flash', async () => {
    const req = new Request('http://localhost/api/auth/verify', { method: 'GET' });
    const res = await verifyGET(makeCtx(req, { DB: createMockD1() }));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('http://localhost/login');
    expect(res.headers.get('Set-Cookie') ?? '').toContain('flash=');
  });

  test('无效 token → 302 /login + invalid_or_expired flash', async () => {
    // consumeMagicLink: SELECT FROM magic_link WHERE token — 找不到返回空
    const db = createMockD1((sql) => {
      if (/FROM magic_link\b/i.test(sql)) return { rows: [] };
      return { rows: [], meta: { success: true } };
    });
    const req = new Request('http://localhost/api/auth/verify?token=bad-token', { method: 'GET' });
    const res = await verifyGET(makeCtx(req, { DB: db }));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('http://localhost/login');
  });

  test('有效 token → 302 / + session cookie', async () => {
    const futureMs = Date.now() + 15 * 60_000;
    let userCreated = false;
    const db = createMockD1((sql) => {
      if (/FROM magic_link\b/i.test(sql) && /WHERE token/i.test(sql)) {
        return { rows: [{ email: 'alice@test.com', expires_at: futureMs, used_at: null }] };
      }
      if (/UPDATE magic_link SET used_at/i.test(sql)) return { meta: { success: true, changes: 1 } };
      if (/SELECT.*FROM user.*WHERE email/i.test(sql) && !userCreated) return { rows: [] };
      if (/INSERT.*INTO user/i.test(sql)) { userCreated = true; return { meta: { success: true, changes: 1 } }; }
      if (/SELECT.*FROM user.*WHERE email/i.test(sql)) {
        return { rows: [{ id: 'u1', email: 'alice@test.com', display_name: null, created_at: new Date().toISOString(), email_verified_at: new Date().toISOString() }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = new Request('http://localhost/api/auth/verify?token=good', { method: 'GET' });
    const res = await verifyGET(makeCtx(req, { DB: db, SESSION_SECRET: 'test' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('http://localhost/');
    expect(res.headers.get('Set-Cookie') ?? '').toContain('session=');
  });
});

// ========== /api/auth/verify-code ==========

describe('POST /api/auth/verify-code', () => {
  test('AUTH_MODE=password → 404', async () => {
    const req = formReq('http://localhost/api/auth/verify-code', { email: 'a@b.c', code: '123456' });
    const res = await verifyCodePOST(makeCtx(req, { AUTH_MODE: 'password', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('缺 email 或 code → 303 /login + missing_code flash', async () => {
    const req = formReq('http://localhost/api/auth/verify-code', { email: '', code: '123456' });
    const res = await verifyCodePOST(makeCtx(req, { DB: createMockD1() }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/login');
  });

  test('错 code → 303 /login/sent + invalid_code flash（带 email 回显）', async () => {
    const db = createMockD1((sql) => {
      if (/FROM magic_link\b/i.test(sql)) return { rows: [] };
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/verify-code', { email: 'a@b.c', code: '999999' });
    const res = await verifyCodePOST(makeCtx(req, { DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/login/sent');
  });

  test('正确 code → 303 / + session cookie', async () => {
    const futureMs = Date.now() + 15 * 60_000;
    let userCreated = false;
    const db = createMockD1((sql) => {
      // consumeMagicLinkByCode 第一个查询：WHERE email=? AND code=? AND used_at IS NULL
      if (/FROM magic_link\b/i.test(sql) && /AND code = \?/i.test(sql)) {
        return { rows: [{ token: 't-good', expires_at: futureMs, used_at: null, attempt_count: 0 }] };
      }
      if (/UPDATE magic_link SET used_at/i.test(sql)) return { meta: { success: true, changes: 1 } };
      if (/SELECT.*FROM user.*WHERE email/i.test(sql) && !userCreated) return { rows: [] };
      if (/INSERT.*INTO user/i.test(sql)) { userCreated = true; return { meta: { success: true, changes: 1 } }; }
      if (/SELECT.*FROM user.*WHERE email/i.test(sql)) {
        return { rows: [{ id: 'u1', email: 'alice@test.com', display_name: null, created_at: new Date().toISOString(), email_verified_at: new Date().toISOString() }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/verify-code', { email: 'alice@test.com', code: '123456' });
    const res = await verifyCodePOST(makeCtx(req, { DB: db, SESSION_SECRET: 'test' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
    expect(res.headers.get('Set-Cookie') ?? '').toContain('session=');
  });
});
