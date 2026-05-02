/**
 * Signup API integration tests (v0.7.2)
 *   POST /api/auth/signup         注册第一步：校验 + hash + pending_signup + 邮件
 *   POST /api/auth/signup-verify  注册第二步：code 校验 → user 行 → session
 *
 * 覆盖：AUTH_MODE 网关 / formData 与 JSON 双 parser / 弱密码 / 已注册邮箱
 *      enumeration 防御 / pending_signup race / code attempt 计数。
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { POST as signupPOST } from '../src/pages/api/auth/signup';
import { POST as signupVerifyPOST } from '../src/pages/api/auth/signup-verify';
import type { APIContext } from 'astro';

// ============================================================
// 工具：mock D1（同 auth-api.test.ts 风格）
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
  RESEND_API_KEY: undefined, // → email.ts 走 stub 模式（log 而非真发）
};

// 静默 console.warn（email stub 噪音）
let originalWarn: typeof console.warn;
let originalLog: typeof console.log;
beforeEach(() => {
  originalWarn = console.warn;
  originalLog = console.log;
  console.warn = () => {};
  console.log = () => {};
});
afterEach(() => {
  console.warn = originalWarn;
  console.log = originalLog;
});

// ============================================================
// /api/auth/signup
// ============================================================

describe('POST /api/auth/signup', () => {
  test('AUTH_MODE=password → 404', async () => {
    const req = formReq('http://localhost/api/auth/signup', {
      email: 'x@y.com',
      password: 'abcd1234',
    });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, AUTH_MODE: 'password', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('空 email → 303 /signup + invalid_email flash', async () => {
    const req = formReq('http://localhost/api/auth/signup', { email: '', password: 'abcd1234' });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/signup');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"invalid_email"');
  });

  test('非法 email 格式 → invalid_email', async () => {
    const req = formReq('http://localhost/api/auth/signup', { email: 'notanemail', password: 'abcd1234' });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.headers.get('Location')).toBe('http://localhost/signup');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"invalid_email"');
  });

  test('弱密码 too_short → weak_password:too_short + email 保留', async () => {
    const req = formReq('http://localhost/api/auth/signup', { email: 'a@b.com', password: 'a1' });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    const cookie = decodeURIComponent(res.headers.get('Set-Cookie') ?? '');
    expect(cookie).toContain('"error":"weak_password:too_short"');
    expect(cookie).toContain('"email":"a@b.com"');
  });

  test('弱密码 no_letter → weak_password:no_letter', async () => {
    const req = formReq('http://localhost/api/auth/signup', { email: 'a@b.com', password: '12345678' });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"weak_password:no_letter"');
  });

  test('弱密码 no_digit → weak_password:no_digit', async () => {
    const req = formReq('http://localhost/api/auth/signup', { email: 'a@b.com', password: 'abcdefgh' });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"weak_password:no_digit"');
  });

  test('弱密码 too_common → weak_password:too_common', async () => {
    const req = formReq('http://localhost/api/auth/signup', { email: 'a@b.com', password: 'password1' });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"weak_password:too_common"');
  });

  test('已注册 email → 静默跳 /signup/sent（不写 pending_signup, 不发邮件）', async () => {
    const db = createMockD1((sql, binds) => {
      // findUserByEmail
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        return { rows: [{ id: 'u_existing', email: binds[0] }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup', {
      email: 'taken@b.com',
      password: 'abcd1234',
    });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/signup/sent');
    // 不应该有 INSERT INTO pending_signup
    const inserted = db.calls.some((c) => /INSERT OR REPLACE INTO pending_signup/.test(c.sql));
    expect(inserted).toBe(false);
  });

  test('合法 + 新 email → 303 /signup/sent + 写 pending_signup', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/auth/signup', {
      email: 'new@b.com',
      password: 'abcd1234',
      display_name: 'Tester',
    });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/signup/sent');
    const insertCall = db.calls.find((c) => /INSERT OR REPLACE INTO pending_signup/.test(c.sql));
    expect(insertCall).toBeDefined();
    // 验证字段顺序：email, password_hash, salt, display_name, code, ...
    expect(insertCall!.binds[0]).toBe('new@b.com');
    expect(typeof insertCall!.binds[1]).toBe('string'); // hash
    expect((insertCall!.binds[1] as string).length).toBe(64); // hex(32 bytes)
    expect(insertCall!.binds[3]).toBe('Tester');
    expect(typeof insertCall!.binds[4]).toBe('string');
    expect((insertCall!.binds[4] as string)).toMatch(/^\d{6}$/); // 6 位 code
  });

  test('display_name 空 → null', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/auth/signup', {
      email: 'new@b.com',
      password: 'abcd1234',
    });
    await signupPOST(makeCtx(req, { ...baseEnv, DB: db }));
    const insertCall = db.calls.find((c) => /INSERT OR REPLACE INTO pending_signup/.test(c.sql));
    expect(insertCall!.binds[3]).toBeNull();
  });

  test('display_name 超长 40 → 截断', async () => {
    const longName = 'a'.repeat(60);
    const db = createMockD1();
    const req = formReq('http://localhost/api/auth/signup', {
      email: 'new@b.com',
      password: 'abcd1234',
      display_name: longName,
    });
    await signupPOST(makeCtx(req, { ...baseEnv, DB: db }));
    const insertCall = db.calls.find((c) => /INSERT OR REPLACE INTO pending_signup/.test(c.sql));
    expect((insertCall!.binds[3] as string).length).toBe(40);
  });

  test('email 大小写规范化为小写', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/auth/signup', {
      email: 'NewUser@Example.COM',
      password: 'abcd1234',
    });
    await signupPOST(makeCtx(req, { ...baseEnv, DB: db }));
    const insertCall = db.calls.find((c) => /INSERT OR REPLACE INTO pending_signup/.test(c.sql));
    expect(insertCall!.binds[0]).toBe('newuser@example.com');
  });

  test('JSON body 也接受', async () => {
    const db = createMockD1();
    const req = jsonReq('http://localhost/api/auth/signup', {
      email: 'json@b.com',
      password: 'abcd1234',
    });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(db.calls.some((c) => /INSERT OR REPLACE INTO pending_signup/.test(c.sql))).toBe(true);
  });

  test('prod HTTPS → Set-Cookie 带 Secure flag', async () => {
    const req = formReq('https://app.example.com/api/auth/signup', {
      email: 'new@b.com',
      password: 'abcd1234',
    });
    const res = await signupPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.headers.get('Set-Cookie') ?? '').toContain('Secure');
  });
});

// ============================================================
// /api/auth/signup-verify
// ============================================================

describe('POST /api/auth/signup-verify', () => {
  test('AUTH_MODE=password → 404', async () => {
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '123456' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, AUTH_MODE: 'password', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('缺 email → 303 /signup + missing_code', async () => {
    const req = formReq('http://localhost/api/auth/signup-verify', { email: '', code: '123456' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.headers.get('Location')).toBe('http://localhost/signup');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"missing_code"');
  });

  test('缺 code → 303 /signup + missing_code', async () => {
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"missing_code"');
  });

  test('pending_signup 不存在 → 303 /signup/sent + not_found', async () => {
    const db = createMockD1(() => ({ rows: [], meta: { success: true } }));
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'unknown@b.com', code: '123456' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.headers.get('Location')).toBe('http://localhost/signup/sent');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"not_found"');
  });

  test('过期 → expired flash', async () => {
    const expired = Date.now() - 1000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h', salt: 's',
          display_name: null, code: '111111', attempt_count: 0,
          expires_at: expired, created_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '111111' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"expired"');
  });

  test('错 code → wrong_code + attempt_count 增加', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h', salt: 's',
          display_name: null, code: '111111', attempt_count: 0,
          expires_at: future, created_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '999999' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"wrong_code"');
    const updateCall = db.calls.find((c) => /UPDATE pending_signup SET attempt_count/.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.binds[0]).toBe(1); // attempt_count + 1
  });

  test('attempt_count 已达上限 → wrong_code_locked', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h', salt: 's',
          display_name: null, code: '111111', attempt_count: 5,
          expires_at: future, created_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '999999' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"wrong_code_locked"');
  });

  test('错 code 且达 5 次失败 → wrong_code_locked', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h', salt: 's',
          display_name: null, code: '111111', attempt_count: 4, // 第 5 次失败 → lock
          expires_at: future, created_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '999999' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"wrong_code_locked"');
  });

  test('对的 code → 303 / + Set-Cookie session', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql, binds) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h64char_'.padEnd(64, '0'), salt: 'salt22char_'.padEnd(22, '0'),
          display_name: null, code: '111111', attempt_count: 0,
          expires_at: future, created_at: '',
        }] };
      }
      // findUserByEmail (race check) → not found
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        // 第一次（race check）→ null；第二次（promote 后）→ row
        if (binds[0] === 'a@b.com') {
          // 简单状态机：如果之前已经 INSERT，返回 row；否则 null
          const inserted = db.calls.some((c) => /INSERT INTO user/.test(c.sql));
          if (inserted) {
            return { rows: [{
              id: 'u_new', email: 'a@b.com', display_name: null,
              created_at: '', email_verified_at: '',
            }] };
          }
          return { rows: [] };
        }
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '111111' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('session=');
    // promote 验证：INSERT INTO user + DELETE FROM pending_signup
    expect(db.calls.some((c) => /INSERT INTO user/.test(c.sql))).toBe(true);
    expect(db.calls.some((c) => /DELETE FROM pending_signup/.test(c.sql))).toBe(true);
  });

  test('race: 对的 code 但 user 已被并发 INSERT → 仍 grant session, 不重复 INSERT', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h64char_'.padEnd(64, '0'), salt: 'salt22char_'.padEnd(22, '0'),
          display_name: null, code: '111111', attempt_count: 0,
          expires_at: future, created_at: '',
        }] };
      }
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        // race check 直接返回已存在的 user
        return { rows: [{
          id: 'u_race', email: 'a@b.com', display_name: null,
          created_at: '', email_verified_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '111111' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
    expect(res.headers.get('Set-Cookie') ?? '').toContain('session=');
    // 不应该再 INSERT user
    expect(db.calls.some((c) => /INSERT INTO user/.test(c.sql))).toBe(false);
    // 但仍 cleanup pending_signup
    expect(db.calls.some((c) => /DELETE FROM pending_signup/.test(c.sql))).toBe(true);
  });

  test('JSON body 也接受', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h64char_'.padEnd(64, '0'), salt: 'salt22char_'.padEnd(22, '0'),
          display_name: null, code: '111111', attempt_count: 0,
          expires_at: future, created_at: '',
        }] };
      }
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        const inserted = db.calls.some((c) => /INSERT INTO user/.test(c.sql));
        if (inserted) {
          return { rows: [{ id: 'u_new', email: 'a@b.com', display_name: null, created_at: '', email_verified_at: '' }] };
        }
        return { rows: [] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = jsonReq('http://localhost/api/auth/signup-verify', {
      email: 'a@b.com',
      code: '111111',
    });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Set-Cookie') ?? '').toContain('session=');
  });

  test('email 规范化（大小写）后查 pending_signup', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql, binds) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        if (binds[0] === 'a@b.com') {
          return { rows: [{
            email: 'a@b.com', password_hash: 'h64char_'.padEnd(64, '0'), salt: 'salt22char_'.padEnd(22, '0'),
            display_name: null, code: '111111', attempt_count: 0,
            expires_at: future, created_at: '',
          }] };
        }
        return { rows: [] };
      }
      // race check (pre-INSERT) → not found；post-INSERT → return inserted user
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        const inserted = db.calls.some((c) => /INSERT INTO user/.test(c.sql));
        if (inserted) {
          return { rows: [{ id: 'u_new', email: 'a@b.com', display_name: null, created_at: '', email_verified_at: '' }] };
        }
        return { rows: [] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'A@B.com', code: '111111' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
  });

  test('code 含空格也被规范化（去除非数字）', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h64char_'.padEnd(64, '0'), salt: 'salt22char_'.padEnd(22, '0'),
          display_name: null, code: '111222', attempt_count: 0,
          expires_at: future, created_at: '',
        }] };
      }
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        const inserted = db.calls.some((c) => /INSERT INTO user/.test(c.sql));
        if (inserted) {
          return { rows: [{ id: 'u_new', email: 'a@b.com', display_name: null, created_at: '', email_verified_at: '' }] };
        }
        return { rows: [] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '111 222' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
  });

  test('5 位 code → wrong_code（防止短 code 误判）', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_signup/.test(sql)) {
        return { rows: [{
          email: 'a@b.com', password_hash: 'h', salt: 's',
          display_name: null, code: '11111', attempt_count: 0,
          expires_at: future, created_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/signup-verify', { email: 'a@b.com', code: '11111' });
    const res = await signupVerifyPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"wrong_code"');
  });
});
