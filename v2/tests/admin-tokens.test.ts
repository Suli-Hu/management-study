/**
 * /api/admin/tokens
 *   Scope safety: tokens cannot exceed the target user's discipline permissions.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { POST as tokenPOST } from '../src/pages/api/admin/tokens/index';

function mockDb(opts: {
  userEmail?: string;
  userPermissions?: string[];
  disciplines?: string[];
} = {}) {
  const userEmail = opts.userEmail ?? 'teacher@test.com';
  const userPermissions = new Set(opts.userPermissions ?? ['keiei']);
  const disciplines = new Set(opts.disciplines ?? ['keiei', 'marketing']);

  return {
    prepare(sql: string) {
      const stmt = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          stmt.binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          if (sql.includes('SELECT id, email FROM user WHERE id = ?')) {
            return { id: stmt.binds[0], email: userEmail } as T;
          }
          if (sql.includes('SELECT key FROM discipline WHERE key = ?')) {
            return disciplines.has(String(stmt.binds[0])) ? ({ key: stmt.binds[0] } as T) : null;
          }
          return null as T;
        },
        async all<T = unknown>() {
          if (sql.includes('SELECT discipline_key FROM user_permission WHERE user_id = ?')) {
            return { results: [...userPermissions].map((discipline_key) => ({ discipline_key })) as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

function makeCtx(body: unknown, env: Record<string, unknown>): APIContext {
  const url = new URL('http://localhost/api/admin/tokens');
  return {
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    url,
    params: {},
    props: {},
    locals: {
      runtime: { env },
      user: { id: 'admin', email: 'owner@test.com', display_name: null, created_at: '', email_verified_at: null },
      isSuperAdmin: true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('POST /api/admin/tokens', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', crypto);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('非 super-admin 目标用户不能拿到超出自身权限的 scope', async () => {
    const res = await tokenPOST(makeCtx({
      name: 'GPT marketing',
      user_id: 'u-teacher',
      scopes: ['marketing'],
      expires_days: 30,
    }, {
      DB: mockDb({ userPermissions: ['keiei'] }),
      ADMIN_EMAILS: 'owner@test.com',
    }));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: 'scope_exceeds_user_permission',
      detail: ['marketing'],
    });
  });

  test('目标用户已有权限的 scope 可以创建', async () => {
    const res = await tokenPOST(makeCtx({
      name: 'GPT keiei',
      user_id: 'u-teacher',
      scopes: ['keiei'],
      expires_days: 30,
    }, {
      DB: mockDb({ userPermissions: ['keiei'] }),
      ADMIN_EMAILS: 'owner@test.com',
    }));

    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; token: string; scopes: string[] };
    expect(data.ok).toBe(true);
    expect(data.token).toMatch(/^ms_v1_[a-f0-9]{32}$/);
    expect(data.scopes).toEqual(['keiei']);
  });

  test('super-admin 目标用户可以被 scope 到任意存在学科', async () => {
    const res = await tokenPOST(makeCtx({
      name: 'Owner marketing',
      user_id: 'u-owner',
      scopes: ['marketing'],
      expires_days: 30,
    }, {
      DB: mockDb({ userEmail: 'owner@test.com', userPermissions: [] }),
      ADMIN_EMAILS: 'owner@test.com',
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, scopes: ['marketing'] });
  });
});
