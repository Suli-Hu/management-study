/**
 * v0.11.0 Issue #1 ④b: view group 细粒度 CRUD endpoints
 *   POST   /api/views/:id/groups
 *   PATCH  /api/views/:id/groups/:groupId
 *   DELETE /api/views/:id/groups/:groupId
 *   POST   /api/views/:id/groups/:groupId/schools (auto-move)
 *   DELETE /api/views/:id/groups/:groupId/schools/:schoolKey
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { POST as addGroupPOST } from '../src/pages/api/views/[id]/groups/index';
import { PATCH as patchGroupPATCH, DELETE as deleteGroupDELETE } from '../src/pages/api/views/[id]/groups/[groupId]';
import { POST as addSchoolsPOST } from '../src/pages/api/views/[id]/groups/[groupId]/schools/index';
import { DELETE as removeSchoolDELETE } from '../src/pages/api/views/[id]/groups/[groupId]/schools/[schoolKey]';

const VIEW_ROW = {
  id: 'v_default',
  discipline: 'keiei',
  name: '全集',
  jp: '',
  icon: '📚',
  description: '',
  flow: '',
  scope: 'public',
  kind: 'manual',
  is_default: 1,
  position: 0,
  groups_json: JSON.stringify([
    { id: 'g1', title: '个人层', flow: '', schoolIds: ['motivation', 'leadership'] },
    { id: 'g2', title: '组织层', flow: '', schoolIds: ['change', 'culture'] },
  ]),
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const ALL_SCHOOLS = ['motivation', 'leadership', 'change', 'culture', 'newschool'];

function mockDb(opts: { missingView?: boolean } = {}) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    calls,
    prepare(sql: string) {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) { stmt.binds = args; return stmt; },
        async first<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('FROM tenant WHERE')) return { id: 'keiei', discipline_key: 'keiei' } as T;
          if (sql.includes('FROM tenant_member')) return { role: 'editor' } as T;
          if (sql.includes('FROM view WHERE id = ?')) {
            return (opts.missingView ? null : VIEW_ROW) as T;
          }
          if (sql.includes('SELECT * FROM view')) {
            return (opts.missingView ? null : VIEW_ROW) as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('SELECT key FROM school WHERE discipline')) {
            // 返回 binds 里的 schoolIds 与 ALL_SCHOOLS 的交集
            const requested = stmt.binds.slice(1) as string[]; // 第 0 是 discipline
            const found = requested.filter((k) => ALL_SCHOOLS.includes(k));
            return { results: found.map((key) => ({ key })) as T[] };
          }
          return { results: [] as T[] };
        },
        async run() { calls.push({ sql, binds: stmt.binds }); return { success: true }; },
      };
      return stmt;
    },
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      for (const s of stmts) await s.run();
      return [];
    },
  };
}

function makeCtx(opts: {
  body?: unknown;
  user?: APIContext['locals']['user'];
  params?: Record<string, string>;
  missingView?: boolean;
  search?: string;
}): APIContext {
  const url = new URL(`http://localhost/api/views/x/groups${opts.search ?? '?discipline=keiei'}`);
  const init: RequestInit = { method: 'POST' };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  return {
    request: new Request(url, init),
    url,
    params: opts.params ?? {},
    props: {},
    locals: {
      runtime: { env: { DB: mockDb({ missingView: opts.missingView }) } },
      user: opts.user === undefined
        ? { id: 'u1', email: 'a@b.com', display_name: null, created_at: '', email_verified_at: null }
        : opts.user,
      isSuperAdmin: true,
      isAdmin: true,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canRead: () => true,
      canEdit: () => true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('POST /api/views/:id/groups (add group)', () => {
  test('未登录 → 401', async () => {
    const res = await addGroupPOST(makeCtx({
      body: { title: '新组' },
      user: null,
      params: { id: 'v_default' },
    }));
    expect(res.status).toBe(401);
  });

  test('view 不存在 → 404', async () => {
    const res = await addGroupPOST(makeCtx({
      body: { title: '新组' },
      params: { id: 'nope' },
      missingView: true,
    }));
    expect(res.status).toBe(404);
  });

  test('title 空 → 422', async () => {
    const res = await addGroupPOST(makeCtx({
      body: { title: '' },
      params: { id: 'v_default' },
    }));
    expect(res.status).toBe(422);
  });

  test('happy: server 自动从 title 生成 id', async () => {
    const res = await addGroupPOST(makeCtx({
      body: { title: '环境层' },
      params: { id: 'v_default' },
    }));
    expect(res.status).toBe(201);
    const body = await res.json() as { new_group_id: string };
    expect(body.new_group_id).toMatch(/^[a-z0-9_-]+$/);
  });

  test('id 冲突 (用户传) → 409', async () => {
    const res = await addGroupPOST(makeCtx({
      body: { id: 'g1', title: '重复' },
      params: { id: 'v_default' },
    }));
    expect(res.status).toBe(409);
  });

  test('schoolIds 已在别 group → 409 schools_in_other_group', async () => {
    const res = await addGroupPOST(makeCtx({
      body: { title: '新', schoolIds: ['motivation'] }, // motivation 已在 g1
      params: { id: 'v_default' },
    }));
    expect(res.status).toBe(409);
    const body = await res.json() as { reason: string };
    expect(body.reason).toBe('schools_in_other_group');
  });
});

describe('PATCH /api/views/:id/groups/:groupId', () => {
  test('group 不存在 → 404', async () => {
    const res = await patchGroupPATCH(makeCtx({
      body: { title: '新名' },
      params: { id: 'v_default', groupId: 'nope' },
    }));
    expect(res.status).toBe(404);
  });

  test('PATCH 空 body → 422', async () => {
    const res = await patchGroupPATCH(makeCtx({
      body: {},
      params: { id: 'v_default', groupId: 'g1' },
    }));
    expect(res.status).toBe(422);
  });

  test('happy: 改 title', async () => {
    const ctx = makeCtx({
      body: { title: '员工层' },
      params: { id: 'v_default', groupId: 'g1' },
    });
    const res = await patchGroupPATCH(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    const upd = db.calls.find((c) => c.sql.includes('UPDATE view SET') && c.sql.includes('name = ?'));
    expect(upd).toBeTruthy();
    const groupsArg = upd!.binds.find((b) => typeof b === 'string' && b.startsWith('[')) as string;
    const groups = JSON.parse(groupsArg);
    expect(groups[0]).toMatchObject({ id: 'g1', title: '员工层' });
    expect(groups[1].title).toBe('组织层'); // 不动
  });
});

describe('DELETE /api/views/:id/groups/:groupId', () => {
  test('group 不存在 → 404', async () => {
    const res = await deleteGroupDELETE(makeCtx({
      params: { id: 'v_default', groupId: 'nope' },
    }));
    expect(res.status).toBe(404);
  });

  test('happy: 删 g1 → groups[] 只剩 g2', async () => {
    const ctx = makeCtx({
      params: { id: 'v_default', groupId: 'g1' },
    });
    const res = await deleteGroupDELETE(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    const upd = db.calls.find((c) => c.sql.includes('UPDATE view SET') && c.sql.includes('name = ?'));
    const groupsArg = upd!.binds.find((b) => typeof b === 'string' && b.startsWith('[')) as string;
    const groups = JSON.parse(groupsArg);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('g2');
  });
});

describe('POST /api/views/:id/groups/:groupId/schools (auto-move)', () => {
  test('group 不存在 → 404', async () => {
    const res = await addSchoolsPOST(makeCtx({
      body: { schoolKeys: ['newschool'] },
      params: { id: 'v_default', groupId: 'nope' },
    }));
    expect(res.status).toBe(404);
  });

  test('schoolKeys 空 → 422', async () => {
    const res = await addSchoolsPOST(makeCtx({
      body: { schoolKeys: [] },
      params: { id: 'v_default', groupId: 'g1' },
    }));
    expect(res.status).toBe(422);
  });

  test('school 不在 discipline → 422 school_not_in_tenant', async () => {
    const res = await addSchoolsPOST(makeCtx({
      body: { schoolKeys: ['nonexistent_school'] },
      params: { id: 'v_default', groupId: 'g1' },
    }));
    expect(res.status).toBe(422);
  });

  test('happy: 加新学派进 g1 (从 __new__)', async () => {
    const ctx = makeCtx({
      body: { schoolKeys: ['newschool'] },
      params: { id: 'v_default', groupId: 'g1' },
    });
    const res = await addSchoolsPOST(ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { moved_from: Record<string, string> };
    expect(body.moved_from).toEqual({ newschool: '__new__' });
  });

  test('happy: auto-move — 把 g2 的 change 移到 g1', async () => {
    const ctx = makeCtx({
      body: { schoolKeys: ['change'] },
      params: { id: 'v_default', groupId: 'g1' },
    });
    const res = await addSchoolsPOST(ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { moved_from: Record<string, string> };
    expect(body.moved_from).toEqual({ change: 'g2' });

    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    const upd = db.calls.find((c) => c.sql.includes('UPDATE view SET') && c.sql.includes('name = ?'));
    const groupsArg = upd!.binds.find((b) => typeof b === 'string' && b.startsWith('[')) as string;
    const groups = JSON.parse(groupsArg);
    const g1 = groups.find((g: { id: string }) => g.id === 'g1');
    const g2 = groups.find((g: { id: string }) => g.id === 'g2');
    expect(g1.schoolIds).toContain('change');
    expect(g2.schoolIds).not.toContain('change');
  });

  test('happy: 已在目标 group 静默跳过 (idempotent)', async () => {
    const ctx = makeCtx({
      body: { schoolKeys: ['motivation'] }, // motivation 已在 g1
      params: { id: 'v_default', groupId: 'g1' },
    });
    const res = await addSchoolsPOST(ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { moved_from: Record<string, string> };
    expect(body.moved_from).toEqual({ motivation: 'g1' });
  });
});

describe('DELETE /api/views/:id/groups/:groupId/schools/:schoolKey', () => {
  test('school 不在该 group → 404 school_not_in_group', async () => {
    const res = await removeSchoolDELETE(makeCtx({
      params: { id: 'v_default', groupId: 'g1', schoolKey: 'change' }, // change 在 g2 不在 g1
    }));
    expect(res.status).toBe(404);
    const body = await res.json() as { reason: string };
    expect(body.reason).toBe('school_not_in_group');
  });

  test('group 不存在 → 404 group_not_found', async () => {
    const res = await removeSchoolDELETE(makeCtx({
      params: { id: 'v_default', groupId: 'nope', schoolKey: 'motivation' },
    }));
    expect(res.status).toBe(404);
  });

  test('happy: 从 g1 拿走 motivation', async () => {
    const ctx = makeCtx({
      params: { id: 'v_default', groupId: 'g1', schoolKey: 'motivation' },
    });
    const res = await removeSchoolDELETE(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    const upd = db.calls.find((c) => c.sql.includes('UPDATE view SET') && c.sql.includes('name = ?'));
    const groupsArg = upd!.binds.find((b) => typeof b === 'string' && b.startsWith('[')) as string;
    const groups = JSON.parse(groupsArg);
    const g1 = groups.find((g: { id: string }) => g.id === 'g1');
    expect(g1.schoolIds).toEqual(['leadership']);
  });
});
