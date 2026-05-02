/**
 * Login-password API integration tests (v0.7.3)
 *   POST /api/auth/login-password  邮箱 + 密码登录已注册账号
 *
 * 覆盖：AUTH_MODE 网关 / enum 防御 / 锁定状态机 / 失败计数累积 /
 *      content-type 双解析 / cookie remember / prod HTTPS Secure。
 *
 * 注意：用真实 PBKDF2 hash —— 测试启动时算一次 known password 的 hash，
 *      mock D1 返回这个 hash，让 verifyPassword 真跑。
 */

import { describe, expect, test, beforeAll, beforeEach, afterEach } from 'vitest';
import { POST as loginPasswordPOST } from '../src/pages/api/auth/login-password';
import { hashPassword } from '../src/lib/password';
import type { APIContext } from 'astro';

const KNOWN_PASSWORD = 'CorrectHorse42';
let knownHash: string;
let knownSalt: string;

beforeAll(async () => {
  const r = await hashPassword(KNOWN_PASSWORD);
  knownHash = r.hash;
  knownSalt = r.salt;
});

// ============================================================
// mock D1（同 signup-api.test 风格）
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

/** 默认 mock：返回有 password_hash 的 user 行 */
function userRowMock(overrides: Partial<{
  id: string;
  email: string;
  password_hash: string | null;
  password_salt: string | null;
  failed_attempts: number;
  locked_until: number | null;
}> = {}) {
  return {
    id: 'u_test',
    email: 'a@b.com',
    password_hash: knownHash,
    password_salt: knownSalt,
    failed_attempts: 0,
    locked_until: null,
    ...overrides,
  };
}

// ============================================================
// 网关 / 输入校验
// ============================================================

describe('POST /api/auth/login-password — gating', () => {
  test('AUTH_MODE=password → 404', async () => {
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, AUTH_MODE: 'password', DB: createMockD1() }));
    expect(res.status).toBe(404);
  });

  test('缺 email → bad_credentials', async () => {
    const req = formReq('http://localhost/api/auth/login-password', { email: '', password: KNOWN_PASSWORD });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/signin');
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"bad_credentials"');
  });

  test('缺 password → bad_credentials', async () => {
    const req = formReq('http://localhost/api/auth/login-password', { email: 'a@b.com', password: '' });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"bad_credentials"');
  });

  test('非法 email 格式 → bad_credentials（不暴露格式校验细节）', async () => {
    const req = formReq('http://localhost/api/auth/login-password', { email: 'notanemail', password: KNOWN_PASSWORD });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"bad_credentials"');
  });
});

// ============================================================
// Enumeration 防御
// ============================================================

describe('POST /api/auth/login-password — enumeration defense', () => {
  test('email 不存在 → bad_credentials（不区分于错密码）', async () => {
    const db = createMockD1(() => ({ rows: [], meta: { success: true } }));
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'nope@b.com', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"bad_credentials"');
    // dummy hash 跑过 → 不应该写 user 行
    expect(db.calls.some((c) => /UPDATE user/.test(c.sql))).toBe(false);
  });

  test('user 存在但 password_hash 为 NULL → bad_credentials', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock({ password_hash: null, password_salt: null })] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"bad_credentials"');
    expect(db.calls.some((c) => /UPDATE user/.test(c.sql))).toBe(false);
  });
});

// ============================================================
// 锁定状态机
// ============================================================

describe('POST /api/auth/login-password — lock state', () => {
  test('locked_until 在未来 → bad_credentials_locked + 不验证密码', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock({ failed_attempts: 5, locked_until: future })] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"bad_credentials_locked"');
    // 不应改 attempts（一旦锁定就不验证）
    expect(db.calls.some((c) => /UPDATE user SET failed_attempts/.test(c.sql))).toBe(false);
  });

  test('locked_until 过期 → 走正常流程', async () => {
    const past = Date.now() - 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock({ failed_attempts: 5, locked_until: past })] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
    // 成功 → updateUserLoginSuccess
    expect(db.calls.some((c) => /UPDATE user SET last_login_at/.test(c.sql))).toBe(true);
  });

  test('密码错 → bad_credentials + failed_attempts++ 落库', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock({ failed_attempts: 1 })] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: 'WrongPassword99',
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"bad_credentials"');
    const updateCall = db.calls.find((c) => /UPDATE user SET failed_attempts/.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.binds[0]).toBe(2); // failed_attempts++
    expect(updateCall!.binds[1]).toBeNull(); // 还没到 5，未锁
  });

  test('密码错 + 第 5 次失败 → bad_credentials_locked + locked_until 写入', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock({ failed_attempts: 4 })] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: 'WrongPassword99',
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"bad_credentials_locked"');
    const updateCall = db.calls.find((c) => /UPDATE user SET failed_attempts/.test(c.sql));
    expect(updateCall!.binds[0]).toBe(5);
    expect(typeof updateCall!.binds[1]).toBe('number');
    expect(updateCall!.binds[1] as number).toBeGreaterThan(Date.now());
  });
});

// ============================================================
// 成功路径
// ============================================================

describe('POST /api/auth/login-password — success', () => {
  test('密码对 → 303 / + Set-Cookie session + login_success 落库', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock()] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    // login_success: last_login_at + reset attempts + clear lock
    const updateCall = db.calls.find((c) => /UPDATE user SET last_login_at/.test(c.sql));
    expect(updateCall).toBeDefined();
  });

  test('email 大小写规范化', async () => {
    const db = createMockD1((sql, binds) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        // 验证 binds[0] 是 lowercase
        expect(binds[0]).toBe('a@b.com');
        return { rows: [userRowMock()] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'A@B.COM', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/');
  });

  test('JSON body 也接受', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock()] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = jsonReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Set-Cookie') ?? '').toContain('session=');
  });

  test('remember=false → cookie 无 Max-Age（关浏览器即失效）', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock()] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = jsonReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD, remember: false,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.headers.get('Set-Cookie') ?? '').not.toContain('Max-Age=');
  });

  test('remember=true（默认）→ cookie 带 30 天 Max-Age', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock()] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD, remember: '1',
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.headers.get('Set-Cookie') ?? '').toContain('Max-Age=2592000'); // 30 天
  });

  test('prod HTTPS → Secure flag', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [userRowMock()] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('https://app.example.com/api/auth/login-password', {
      email: 'a@b.com', password: KNOWN_PASSWORD,
    });
    const res = await loginPasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.headers.get('Set-Cookie') ?? '').toContain('Secure');
  });
});
