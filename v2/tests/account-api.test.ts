/**
 * Account management API integration tests (v0.7.5)
 *   POST /api/account/profile               改 display_name
 *   POST /api/account/change-password       改密码（输旧密码）
 *   POST /api/account/change-email-request  改邮箱第一步
 *   POST /api/account/change-email-confirm  改邮箱第二步
 *   POST /api/account/logout-all            退出所有设备
 *   POST /api/account/delete                注销账户
 *
 * 覆盖：必须登录 / 旧密码确认 / 强度校验 / 一致性校验 / pending 表生命周期 /
 *      session 失效 / 注销 confirm phrase / email 占用冲突。
 */

import { describe, expect, test, beforeAll, beforeEach, afterEach } from 'vitest';
import { POST as profilePOST } from '../src/pages/api/account/profile';
import { POST as changePasswordPOST } from '../src/pages/api/account/change-password';
import { POST as changeEmailRequestPOST } from '../src/pages/api/account/change-email-request';
import { POST as changeEmailConfirmPOST } from '../src/pages/api/account/change-email-confirm';
import { POST as logoutAllPOST } from '../src/pages/api/account/logout-all';
import { POST as deletePOST } from '../src/pages/api/account/delete';
import { hashPassword } from '../src/lib/password';
import type { APIContext } from 'astro';

const KNOWN_PASSWORD = 'CurrentPass2025';
let knownHash: string;
let knownSalt: string;

beforeAll(async () => {
  const r = await hashPassword(KNOWN_PASSWORD);
  knownHash = r.hash;
  knownSalt = r.salt;
});

// ============================================================
// mock D1 (与之前相同)
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
        bind(...args: unknown[]) { binds = args; return stmt; },
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

const sessionUser = { id: 'u_me', email: 'me@b.com' };

function makeCtx(request: Request, env: Record<string, unknown>, user = sessionUser as null | typeof sessionUser): APIContext {
  const url = new URL(request.url);
  return {
    request,
    url,
    params: {},
    props: {},
    locals: {
      runtime: { env },
      user,
    } as unknown as APIContext['locals'],
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

const baseEnv = { ADMIN_EMAILS: 'admin@test.com', SESSION_SECRET: 'test-secret' };

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

/** 默认 user auth row mock */
function authRowMock(overrides: Partial<{ password_hash: string | null; password_salt: string | null }> = {}) {
  return {
    id: 'u_me',
    email: 'me@b.com',
    password_hash: knownHash,
    password_salt: knownSalt,
    failed_attempts: 0,
    locked_until: null,
    ...overrides,
  };
}

// ============================================================
// /api/account/profile
// ============================================================

describe('POST /api/account/profile', () => {
  test('未登录 → 401', async () => {
    const req = formReq('http://localhost/api/account/profile', { display_name: 'Bob' });
    const res = await profilePOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }, null));
    expect(res.status).toBe(401);
  });

  test('合法 → 303 settings + UPDATE display_name', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/account/profile', { display_name: 'Bob' });
    const res = await profilePOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/settings/account');
    const updateCall = db.calls.find((c) => /UPDATE user SET display_name/.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.binds[0]).toBe('Bob');
  });

  test('空 display_name → null（清空回退用 email 前缀）', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/account/profile', { display_name: '' });
    await profilePOST(makeCtx(req, { ...baseEnv, DB: db }));
    const updateCall = db.calls.find((c) => /UPDATE user SET display_name/.test(c.sql));
    expect(updateCall!.binds[0]).toBeNull();
  });

  test('超长 display_name 截断 40', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/account/profile', { display_name: 'a'.repeat(60) });
    await profilePOST(makeCtx(req, { ...baseEnv, DB: db }));
    const updateCall = db.calls.find((c) => /UPDATE user SET display_name/.test(c.sql));
    expect((updateCall!.binds[0] as string).length).toBe(40);
  });
});

// ============================================================
// /api/account/change-password
// ============================================================

describe('POST /api/account/change-password', () => {
  test('未登录 → 401', async () => {
    const req = formReq('http://localhost/api/account/change-password', {
      current_password: 'x', password: 'NewPass2025', password_confirm: 'NewPass2025',
    });
    const res = await changePasswordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }, null));
    expect(res.status).toBe(401);
  });

  test('缺当前密码 → missing_current_password', async () => {
    const req = formReq('http://localhost/api/account/change-password', {
      current_password: '', password: 'NewPass2025', password_confirm: 'NewPass2025',
    });
    const res = await changePasswordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"missing_current_password"');
  });

  test('两次新密码不一致 → password_mismatch', async () => {
    const req = formReq('http://localhost/api/account/change-password', {
      current_password: 'x', password: 'NewPass2025', password_confirm: 'XXXxxx99',
    });
    const res = await changePasswordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"password_mismatch"');
  });

  test('新密码弱 too_short → weak_password:too_short', async () => {
    const req = formReq('http://localhost/api/account/change-password', {
      current_password: 'x', password: 'a1', password_confirm: 'a1',
    });
    const res = await changePasswordPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"weak_password:too_short"');
  });

  test('user 没设过密码 → no_password_set', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [authRowMock({ password_hash: null, password_salt: null })] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-password', {
      current_password: 'x', password: 'NewPass2025', password_confirm: 'NewPass2025',
    });
    const res = await changePasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"no_password_set"');
  });

  test('当前密码错 → wrong_current_password（不写 user）', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [authRowMock()] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-password', {
      current_password: 'WRONG', password: 'NewPass2025', password_confirm: 'NewPass2025',
    });
    const res = await changePasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"wrong_current_password"');
    expect(db.calls.some((c) => /UPDATE user[\s\S]*password_hash/.test(c.sql))).toBe(false);
  });

  test('全合法 → password_updated + UPDATE password + DELETE session', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) {
        return { rows: [authRowMock()] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-password', {
      current_password: KNOWN_PASSWORD, password: 'NewPass2025', password_confirm: 'NewPass2025',
    });
    const res = await changePasswordPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"ok":"password_updated"');
    expect(db.calls.some((c) => /UPDATE user[\s\S]*password_hash/.test(c.sql))).toBe(true);
    expect(db.calls.some((c) => /DELETE FROM session WHERE user_id/.test(c.sql))).toBe(true);
  });
});

// ============================================================
// /api/account/change-email-request
// ============================================================

describe('POST /api/account/change-email-request', () => {
  test('未登录 → 401', async () => {
    const req = formReq('http://localhost/api/account/change-email-request', {
      new_email: 'x@y.com', current_password: 'x',
    });
    const res = await changeEmailRequestPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }, null));
    expect(res.status).toBe(401);
  });

  test('非法新邮箱 → invalid_email', async () => {
    const req = formReq('http://localhost/api/account/change-email-request', {
      new_email: 'notanemail', current_password: KNOWN_PASSWORD,
    });
    const res = await changeEmailRequestPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"invalid_email"');
  });

  test('缺当前密码 → missing_current_password', async () => {
    const req = formReq('http://localhost/api/account/change-email-request', {
      new_email: 'new@b.com', current_password: '',
    });
    const res = await changeEmailRequestPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"missing_current_password"');
  });

  test('新邮箱跟当前一样 → email_unchanged', async () => {
    const req = formReq('http://localhost/api/account/change-email-request', {
      new_email: 'me@b.com', current_password: KNOWN_PASSWORD,
    });
    const res = await changeEmailRequestPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"email_unchanged"');
  });

  test('当前密码错 → wrong_current_password', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) return { rows: [authRowMock()] };
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-email-request', {
      new_email: 'new@b.com', current_password: 'WRONG',
    });
    const res = await changeEmailRequestPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"wrong_current_password"');
  });

  test('新邮箱已被占用 → email_taken', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) return { rows: [authRowMock()] };
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        return { rows: [{ id: 'u_other', email: 'taken@b.com' }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-email-request', {
      new_email: 'taken@b.com', current_password: KNOWN_PASSWORD,
    });
    const res = await changeEmailRequestPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"email_taken"');
  });

  test('全合法 → email_change_sent + 写 pending_email_change', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) return { rows: [authRowMock()] };
      if (/SELECT \* FROM user WHERE email/.test(sql)) return { rows: [] };
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-email-request', {
      new_email: 'new@b.com', current_password: KNOWN_PASSWORD,
    });
    const res = await changeEmailRequestPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"ok":"email_change_sent"');
    const insertCall = db.calls.find((c) => /INSERT OR REPLACE INTO pending_email_change/.test(c.sql));
    expect(insertCall).toBeDefined();
    expect(insertCall!.binds[0]).toBe('u_me');
    expect(insertCall!.binds[1]).toBe('new@b.com');
  });
});

// ============================================================
// /api/account/change-email-confirm
// ============================================================

describe('POST /api/account/change-email-confirm', () => {
  test('未登录 → 401', async () => {
    const req = formReq('http://localhost/api/account/change-email-confirm', { code: '123456' });
    const res = await changeEmailConfirmPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }, null));
    expect(res.status).toBe(401);
  });

  test('缺 code → missing_code', async () => {
    const req = formReq('http://localhost/api/account/change-email-confirm', { code: '' });
    const res = await changeEmailConfirmPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"missing_code"');
  });

  test('没 pending → not_found', async () => {
    const db = createMockD1(() => ({ rows: [], meta: { success: true } }));
    const req = formReq('http://localhost/api/account/change-email-confirm', { code: '123456' });
    const res = await changeEmailConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"not_found"');
  });

  test('错 code → wrong_code + attempt_count++', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_email_change/.test(sql)) {
        return { rows: [{
          user_id: 'u_me', new_email: 'new@b.com', code: '111111',
          attempt_count: 0, expires_at: future, created_at: '',
        }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-email-confirm', { code: '999999' });
    const res = await changeEmailConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"wrong_code"');
    expect(db.calls.some((c) => /UPDATE pending_email_change SET attempt_count/.test(c.sql))).toBe(true);
  });

  test('对的 code → email_changed + UPDATE user.email + DELETE pending + DELETE session + 跳 /login', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_email_change/.test(sql)) {
        return { rows: [{
          user_id: 'u_me', new_email: 'new@b.com', code: '111111',
          attempt_count: 0, expires_at: future, created_at: '',
        }] };
      }
      // race check: new_email 没被占用
      if (/SELECT \* FROM user WHERE email/.test(sql)) return { rows: [] };
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-email-confirm', { code: '111111' });
    const res = await changeEmailConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/signin');
    const cookieHeader = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('Set-Cookie') ?? ''];
    const all = cookieHeader.join(' ');
    expect(all).toContain('email_changed');
    expect(db.calls.some((c) => /UPDATE user[\s\S]*email = \?/.test(c.sql))).toBe(true);
    expect(db.calls.some((c) => /DELETE FROM pending_email_change/.test(c.sql))).toBe(true);
    expect(db.calls.some((c) => /DELETE FROM session WHERE user_id/.test(c.sql))).toBe(true);
  });

  test('对的 code 但 race: new_email 被占用 → email_taken + 删 pending', async () => {
    const future = Date.now() + 60_000;
    const db = createMockD1((sql) => {
      if (/SELECT \* FROM pending_email_change/.test(sql)) {
        return { rows: [{
          user_id: 'u_me', new_email: 'new@b.com', code: '111111',
          attempt_count: 0, expires_at: future, created_at: '',
        }] };
      }
      if (/SELECT \* FROM user WHERE email/.test(sql)) {
        return { rows: [{ id: 'u_other', email: 'new@b.com' }] };
      }
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/change-email-confirm', { code: '111111' });
    const res = await changeEmailConfirmPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"email_taken"');
    expect(db.calls.some((c) => /DELETE FROM pending_email_change/.test(c.sql))).toBe(true);
    // 不应 UPDATE user.email
    expect(db.calls.some((c) => /UPDATE user[\s\S]*email = \?/.test(c.sql))).toBe(false);
  });
});

// ============================================================
// /api/account/logout-all
// ============================================================

describe('POST /api/account/logout-all', () => {
  test('未登录 → 401', async () => {
    const req = formReq('http://localhost/api/account/logout-all', {});
    const res = await logoutAllPOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }, null));
    expect(res.status).toBe(401);
  });

  test('登录 → 303 /signin + 清 cookie + DELETE session（v0.7.9）', async () => {
    const db = createMockD1();
    const req = formReq('http://localhost/api/account/logout-all', {});
    const res = await logoutAllPOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/signin');
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('Set-Cookie') ?? ''];
    expect(cookies.some((c) => c.includes('session=') && c.includes('Max-Age=0'))).toBe(true);
    expect(db.calls.some((c) => /DELETE FROM session WHERE user_id/.test(c.sql))).toBe(true);
  });
});

// ============================================================
// /api/account/delete
// ============================================================

describe('POST /api/account/delete', () => {
  test('未登录 → 401', async () => {
    const req = formReq('http://localhost/api/account/delete', {
      current_password: 'x', confirm: 'DELETE',
    });
    const res = await deletePOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }, null));
    expect(res.status).toBe(401);
  });

  test('confirm 不是 DELETE → confirm_phrase_mismatch', async () => {
    const req = formReq('http://localhost/api/account/delete', {
      current_password: KNOWN_PASSWORD, confirm: 'delete',
    });
    const res = await deletePOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"confirm_phrase_mismatch"');
  });

  test('缺当前密码 → missing_current_password', async () => {
    const req = formReq('http://localhost/api/account/delete', {
      current_password: '', confirm: 'DELETE',
    });
    const res = await deletePOST(makeCtx(req, { ...baseEnv, DB: createMockD1() }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"missing_current_password"');
  });

  test('密码错 → wrong_current_password（不删 user）', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) return { rows: [authRowMock()] };
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/delete', {
      current_password: 'WRONG', confirm: 'DELETE',
    });
    const res = await deletePOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(decodeURIComponent(res.headers.get('Set-Cookie') ?? '')).toContain('"error":"wrong_current_password"');
    expect(db.calls.some((c) => /DELETE FROM user/.test(c.sql))).toBe(false);
  });

  test('全合法 → 303 /signin + DELETE user + 清 cookie + flash account_deleted（v0.7.9）', async () => {
    const db = createMockD1((sql) => {
      if (/SELECT id, email, password_hash/.test(sql)) return { rows: [authRowMock()] };
      return { rows: [], meta: { success: true } };
    });
    const req = formReq('http://localhost/api/account/delete', {
      current_password: KNOWN_PASSWORD, confirm: 'DELETE',
    });
    const res = await deletePOST(makeCtx(req, { ...baseEnv, DB: db }));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('http://localhost/signin');
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('Set-Cookie') ?? ''];
    const all = cookies.join(' ');
    expect(all).toContain('account_deleted');
    expect(all).toContain('session=');
    expect(db.calls.some((c) => /DELETE FROM user WHERE id/.test(c.sql))).toBe(true);
  });
});
