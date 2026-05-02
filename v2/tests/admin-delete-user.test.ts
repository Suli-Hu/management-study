/**
 * DELETE /api/admin/users/[user_id]  (v0.7.7)
 *
 * 覆盖：登录态 / super-admin gate / 防自杀 / 防删 super-admin 邮箱 /
 *      target 不存在 / 成功路径 + CASCADE。
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { DELETE as deleteUser } from '../src/pages/api/admin/users/[user_id]/index';

interface MockUser {
  id: string;
  email: string;
}
interface MockOptions {
  targetUser?: MockUser | null;
}

function mockDb(opts: MockOptions = {}) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const target = opts.targetUser === undefined ? null : opts.targetUser;
  const db = {
    calls,
    prepare(sql: string) {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) { stmt.binds = args; return stmt; },
        async first<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (/SELECT id, email FROM user WHERE id/.test(sql)) {
            return (target as unknown) as T | null;
          }
          return null as T | null;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          return { results: [] as T[] };
        },
        async run() {
          calls.push({ sql, binds: stmt.binds });
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: Array<{ sql: string; binds: unknown[] }>) {
      return stmts.map(() => ({ success: true }));
    },
  };
  return db;
}

function makeCtx(
  params: { user_id?: string },
  opts: {
    db: ReturnType<typeof mockDb>;
    isSuperAdmin?: boolean;
    currentUser?: { id: string; email: string };
    adminEmails?: string;
  },
): APIContext {
  const url = new URL(`http://localhost/api/admin/users/${params.user_id ?? ''}`);
  return {
    request: new Request(url, { method: 'DELETE' }),
    url,
    params,
    props: {},
    locals: {
      runtime: { env: { DB: opts.db, ADMIN_EMAILS: opts.adminEmails ?? 'admin@test.com' } },
      user: opts.currentUser ?? { id: 'u_super', email: 'admin@test.com', display_name: null, created_at: '', email_verified_at: null },
      isSuperAdmin: opts.isSuperAdmin ?? true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('DELETE /api/admin/users/[user_id]', () => {
  test('未登录 → 403 not_admin', async () => {
    const db = mockDb();
    const ctx = {
      ...makeCtx({ user_id: 'u_target' }, { db }),
      locals: { runtime: { env: { DB: db, ADMIN_EMAILS: 'admin@test.com' } }, user: null } as unknown as APIContext['locals'],
    } as APIContext;
    const res = await deleteUser(ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'not_admin' });
  });

  test('非 super-admin → 403 super_admin_required', async () => {
    const db = mockDb();
    const res = await deleteUser(makeCtx({ user_id: 'u_target' }, { db, isSuperAdmin: false }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'super_admin_required' });
  });

  test('缺 user_id → 400 bad_request', async () => {
    const db = mockDb();
    const res = await deleteUser(makeCtx({}, { db }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: 'bad_request' });
  });

  test('target 不存在 → 404 user_not_found', async () => {
    const db = mockDb({ targetUser: null });
    const res = await deleteUser(makeCtx({ user_id: 'u_ghost' }, { db }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'user_not_found' });
  });

  test('删自己 → 403 cannot_delete_self', async () => {
    const db = mockDb({ targetUser: { id: 'u_super', email: 'admin@test.com' } });
    const res = await deleteUser(makeCtx({ user_id: 'u_super' }, { db }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'cannot_delete_self' });
    expect(db.calls.some((c) => /DELETE FROM user/.test(c.sql))).toBe(false);
  });

  test('删 super-admin 邮箱 user → 403 cannot_delete_super_admin', async () => {
    const db = mockDb({ targetUser: { id: 'u_other', email: 'admin@test.com' } });
    const res = await deleteUser(makeCtx({ user_id: 'u_other' }, {
      db,
      currentUser: { id: 'u_super', email: 'admin@test.com' },
      adminEmails: 'admin@test.com',
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'cannot_delete_super_admin' });
    expect(db.calls.some((c) => /DELETE FROM user/.test(c.sql))).toBe(false);
  });

  test('多 super-admin email CSV 也保护', async () => {
    const db = mockDb({ targetUser: { id: 'u_admin2', email: 'admin2@test.com' } });
    const res = await deleteUser(makeCtx({ user_id: 'u_admin2' }, {
      db,
      adminEmails: 'admin@test.com, admin2@test.com',
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'cannot_delete_super_admin' });
  });

  test('合法 → 200 ok + DELETE FROM user 跑了', async () => {
    const db = mockDb({ targetUser: { id: 'u_alice', email: 'alice@b.com' } });
    const res = await deleteUser(makeCtx({ user_id: 'u_alice' }, { db }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; user_id: string; email: string };
    expect(body).toMatchObject({ ok: true, user_id: 'u_alice', email: 'alice@b.com' });

    const deleteCall = db.calls.find((c) => /DELETE FROM user WHERE id = \?/.test(c.sql));
    expect(deleteCall).toBeDefined();
    expect(deleteCall!.binds[0]).toBe('u_alice');
  });

  test('email 大小写比较不敏感（防 super-admin csv 漏配）', async () => {
    const db = mockDb({ targetUser: { id: 'u_admin', email: 'Admin@Test.Com' } });
    const res = await deleteUser(makeCtx({ user_id: 'u_admin' }, {
      db,
      adminEmails: 'admin@test.com',
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'cannot_delete_super_admin' });
  });
});
