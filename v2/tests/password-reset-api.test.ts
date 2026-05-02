/**
 * Password reset API integration tests (v0.7.4)
 *   POST /api/auth/password-reset-request   申请重置链接
 *   POST /api/auth/password-reset-confirm   设新密码 + 自动登录
 *
 * 覆盖：enumeration 防御 / token 生命周期（创建 → consume → reused → expired）/
 *      密码强度校验 / 不一致校验 / session 失效 / content-type 双解析。
 */

import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { POST as resetRequestPOST } from '../src/pages/api/auth/password-reset-request';
import { POST as resetConfirmPOST } from '../src/pages/api/auth/password-reset-confirm';
import type { APIContext } from 'astro';

// ============================================================
// mock D1
// ============================================================

interface MockRows {
  rows?: unknown[];
  meta?: { success: boolean; changes?: number };
}
type MockHandler = (sql: string, binds: unknown[]) => MockRows | undefined;

function createMockD1(handler: MockHandler = () => ({ rows: [], meta: { success: true } })) {
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
    async batch(_stmts: unknown[]) { return []; },
    async exec(_sql: string) { return { count: 0, duration: 0 }; },
    calls,
  };
  return db;
}

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

function jsonReq(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseEnv = {
  ADMIN_EMAILS: 'admin@test.com',
  SESSION_SECRET: 'test-secret-not-for-prod',
  RESEND_API_KEY: undefined,
};

let originalWarn: typeof console.warn;
let originalLog: typeof console.log;
let originalError: typeof console.error;
beforeEach(() => {
  originalWarn = console.warn;
  originalLog = console.log;
  originalError = console.error;
  console.warn = () => {};
  console.log = () => {};
  console.error = () => {};
});
afterEach(() => {
  console.warn = originalWarn;
  console.log = originalLog;
  console.error = originalError;
});

// ============================================================
// /api/auth/password-reset-request
// ============================================================

describe('POST /api/auth/password-reset-request', () => {
  test('AUTH_MODE=password → 404', async () => {
    const req = formReq('http://localhost/api/auth/password-reset-request', { email: 'a@b.com' });
    const res = await resetRequestPOST(makeCtx(req, { ...baseEnv, AUTH_MODE: 'password', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('空 email → 303 /password-reset + invalid_email', async () => {
    const req = formReq('http://localhost/api/auth/password-reset-request', { email: '' });
    const res = await resetRequestPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/password-reset');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"invalid_email"');
  });

  test('非法 email 格式 → invalid_email', async () => {
    const req = formReq('http://localhost/api/auth/password-reset-request', { email: 'notanemail' });
    const res = await resetRequestPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"invalid_email"');
  });

  test('email 不存在 → 静默跳 sent，不写 password_reset，不发邮件', async () => {
    const db = createMockD1(() => ({ rows: [], meta: { success: true } }));
    const req = formReq('http://localhost/api/auth/password-reset-request', { email: 'nope@b.com' });
    const res = await resetRequestPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/password-reset/sent');
    expect(db.calls.some((c) => /INSERT INTO password_reset/.test(c.sql))).toBe(false);
  });

  test('email 存在 → 写 password_reset + 跳 sent', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        return { rows: [{ id: 'u1', email: 'a@b.com' }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/password-reset-request', { email: 'a@b.com' });
    const res = await resetRequestPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/password-reset/sent');
    const insertCall = db.calls.find((c) => /INSERT INTO password_reset/.test(c.sql));
    expect(insertCall).toBeDefined();
    expect(insertCall!.binds[1]).toBe('u1'); // user_id
    // token 应该是 URL-safe base64 字符串
    expect(typeof insertCall!.binds[0]).toBe('string');
    expect((insertCall!.binds[0] as string).length).toBeGreaterThan(20);
  });

  test('email 大小写规范化', async () => {
    const db = createMockD1((sql, binds) => {
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        expect(binds[0]).toBe('a@b.com');
        return { rows: [{ id: 'u1', email: 'a@b.com' }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/password-reset-request', { email: 'A@B.COM' });
    const res = await resetRequestPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
  });

  test('JSON body 也接受', async () => {
    const db = createMockD1();
    const req = jsonReq('http://localhost/api/auth/password-reset-request', { email: 'a@b.com' });
    const res = await resetRequestPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/password-reset/sent');
  });

  test('prod HTTPS → Set-Cookie Secure', async () => {
    const req = formReq('https://app.example.com/api/auth/password-reset-request', { email: 'a@b.com' });
    const res = await resetRequestPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.headers.get('Set-Cookie') ?? '').toContain('Secure');
  });
});

// ============================================================
// /api/auth/password-reset-confirm
// ============================================================

describe('POST /api/auth/password-reset-confirm', () => {
  test('AUTH_MODE=password → 404', async () => {
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 't', password: 'abcd1234', password_confirm: 'abcd1234',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, AUTH_MODE: 'password', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('缺 token → 303 /password-reset + missing_token', async () => {
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: '', password: 'abcd1234', password_confirm: 'abcd1234',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.headers.get('Location')).toBe('http://localhost/password-reset');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"missing_token"');
  });

  test('两次密码不一致 → 303 confirm + password_mismatch（不 consume token）', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'abcd1234', password_confirm: 'XXXXxxxx',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.headers.get('Location')).toBe('http://localhost/password-reset/confirm?token=tk1');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"password_mismatch"');
    expect(db.calls.some((c) => /UPDATE password_reset/.test(c.sql))).toBe(false);
  });

  test('密码弱 too_short → weak_password:too_short（不 consume token）', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'a1', password_confirm: 'a1',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? ''))
      .toContain('"error":"weak_password:too_short"');
    expect(db.calls.some((c) => /UPDATE password_reset/.test(c.sql))).toBe(false);
  });

  test('密码弱 no_letter → weak_password:no_letter', async () => {
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: '12345678', password_confirm: '12345678',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? ''))
      .toContain('"error":"weak_password:no_letter"');
  });

  test('token 不存在 → token_invalid', async () => {
    const db = createMockD1(() => ({ rows: [], meta: { success: true } }));
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'badtoken', password: 'abcd1234', password_confirm: 'abcd1234',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.headers.get('Location')).toBe('http://localhost/password-reset');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"token_invalid"');
  });

  test('token 过期 → token_expired', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM password_reset WHERE token/.test(sql)) {
        return { rows: [{
          token: 'tk1', user_id: 'u1', used_at: null,
          expires_at: Date.now() - 60_000, created_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'abcd1234', password_confirm: 'abcd1234',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"token_expired"');
  });

  test('token 已用过 → token_used', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM password_reset WHERE token/.test(sql)) {
        return { rows: [{
          token: 'tk1', user_id: 'u1', used_at: '2026-05-01T00:00:00Z',
          expires_at: Date.now() + 60_000, created_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'abcd1234', password_confirm: 'abcd1234',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"token_used"');
  });

  test('对的 token + 强密码 → 303 / + Set-Cookie + UPDATE user + DELETE session', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM password_reset WHERE token/.test(sql)) {
        return { rows: [{
          token: 'tk1', user_id: 'u1', used_at: null,
          expires_at: Date.now() + 60_000, created_at: '',
        }] };
      }
      if (/SELECT id, email FROM user WHERE id/.test(sql)) {
        return { rows: [{ id: 'u1', email: 'a@b.com' }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'NewPass2026', password_confirm: 'NewPass2026',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('session=');
    // 必备的几条 SQL
    expect(db.calls.some((c) => /UPDATE password_reset SET used_at/.test(c.sql))).toBe(true);
    expect(db.calls.some((c) => /UPDATE user[\s\S]*password_hash/.test(c.sql))).toBe(true);
    expect(db.calls.some((c) => /DELETE FROM session WHERE user_id/.test(c.sql))).toBe(true);
  });

  test('对的 token 但 user 已被删 → 303 /login + invalid_or_expired', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM password_reset WHERE token/.test(sql)) {
        return { rows: [{
          token: 'tk1', user_id: 'u1', used_at: null,
          expires_at: Date.now() + 60_000, created_at: '',
        }] };
      }
      if (/SELECT id, email FROM user WHERE id/.test(sql)) {
        return { rows: [] }; // user 不见了
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'NewPass2026', password_confirm: 'NewPass2026',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.headers.get('Location')).toBe('http://localhost/signin');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"invalid_or_expired"');
  });

  test('JSON body 也接受', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM password_reset WHERE token/.test(sql)) {
        return { rows: [{
          token: 'tk1', user_id: 'u1', used_at: null,
          expires_at: Date.now() + 60_000, created_at: '',
        }] };
      }
      if (/SELECT id, email FROM user WHERE id/.test(sql)) {
        return { rows: [{ id: 'u1', email: 'a@b.com' }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = jsonReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'NewPass2026', password_confirm: 'NewPass2026',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Set-Cookie') ?? '').toContain('session=');
  });

  test('成功路径 prod HTTPS → Secure flag', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM password_reset WHERE token/.test(sql)) {
        return { rows: [{
          token: 'tk1', user_id: 'u1', used_at: null,
          expires_at: Date.now() + 60_000, created_at: '',
        }] };
      }
      if (/SELECT id, email FROM user WHERE id/.test(sql)) {
        return { rows: [{ id: 'u1', email: 'a@b.com' }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('https://app.example.com/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'NewPass2026', password_confirm: 'NewPass2026',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.headers.get('Set-Cookie') ?? '').toContain('Secure');
  });

  test('密码不一致检查发生在 token 校验之前（弱密码 + token 错时也是先报弱密码）', async () => {
    const db = createMockD1(); // 默认空 → token 不存在
    const req = formReq('http://localhost/api/auth/password-reset-confirm', {
      token: 'tk1', password: 'a1', password_confirm: 'XXXX',
    });
    const res = await resetConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    // 报 password_mismatch（先于 token 校验和强度校验）
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"password_mismatch"');
  });
});
