/**
 * v0.10.0 Issue #4a/#4b: view-groups-order + view-group-schools reorder
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { POST as groupsOrderPOST } from '../src/pages/api/edit/reorder/view-groups-order';
import { POST as groupSchoolsPOST } from '../src/pages/api/edit/reorder/view-group-schools';

const VIEW_GROUPS = [
  { id: 'g1', title: '个人层', flow: '', schoolIds: ['motivation', 'leadership'] },
  { id: 'g2', title: '组织层', flow: '', schoolIds: ['change', 'culture'] },
];

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
          if (sql.includes('SELECT groups_json FROM view')) {
            if (opts.missingView) return null as T;
            return { groups_json: JSON.stringify(VIEW_GROUPS) } as T;
          }
          return null as T;
        },
        async all<T = unknown>() { calls.push({ sql, binds: stmt.binds }); return { results: [] as T[] }; },
        async run() { calls.push({ sql, binds: stmt.binds }); return { success: true }; },
      };
      return stmt;
    },
  };
}

function makeCtx(opts: {
  body: unknown;
  user?: APIContext['locals']['user'];
  canEdit?: boolean;
  missingView?: boolean;
}): APIContext {
  const url = new URL('http://localhost/api/edit/reorder/x');
  return {
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.body),
    }),
    url,
    params: {},
    props: {},
    locals: {
      runtime: { env: { DB: mockDb({ missingView: opts.missingView }) } },
      user: opts.user === undefined
        ? { id: 'u1', email: 'a@b.com', display_name: null, created_at: '', email_verified_at: null }
        : opts.user,
      isSuperAdmin: false, isAdmin: false, isGuest: false, isInviteGuest: false,
      apiTokenScopes: null, permissions: new Map(),
      canRead: () => true,
      canEdit: () => opts.canEdit ?? true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('POST /api/edit/reorder/view-groups-order', () => {
  test('未登录 → 401', async () => {
    const res = await groupsOrderPOST(makeCtx({
      body: { discipline: 'keiei', viewId: 'v1', groupIds: ['g2', 'g1'] },
      user: null,
    }));
    expect(res.status).toBe(401);
  });

  test('canEdit=false → 403', async () => {
    const res = await groupsOrderPOST(makeCtx({
      body: { discipline: 'keiei', viewId: 'v1', groupIds: ['g2', 'g1'] },
      canEdit: false,
    }));
    expect(res.status).toBe(403);
  });

  test('view 不存在 → 404', async () => {
    const res = await groupsOrderPOST(makeCtx({
      body: { discipline: 'keiei', viewId: 'nope', groupIds: ['g1', 'g2'] },
      missingView: true,
    }));
    expect(res.status).toBe(404);
  });

  test('groupIds 集合不匹配 → 400 set_mismatch', async () => {
    const res = await groupsOrderPOST(makeCtx({
      body: { discipline: 'keiei', viewId: 'v1', groupIds: ['g1', 'g2', 'g3'] },
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe('set_mismatch');
  });

  test('happy: groupIds 同集合不同序 → 200 + UPDATE view', async () => {
    const ctx = makeCtx({
      body: { discipline: 'keiei', viewId: 'v1', groupIds: ['g2', 'g1'] },
    });
    const res = await groupsOrderPOST(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    const upd = db.calls.find((c) => c.sql.includes('UPDATE view SET groups_json'));
    expect(upd).toBeTruthy();
    const reordered = JSON.parse(upd!.binds[0] as string);
    expect(reordered.map((g: { id: string }) => g.id)).toEqual(['g2', 'g1']);
  });
});

describe('POST /api/edit/reorder/view-group-schools', () => {
  test('happy: 同组重排 → 200', async () => {
    const ctx = makeCtx({
      body: {
        discipline: 'keiei', viewId: 'v1',
        groupsSchoolIds: { g1: ['leadership', 'motivation'] },
      },
    });
    const res = await groupSchoolsPOST(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    const upd = db.calls.find((c) => c.sql.includes('UPDATE view SET groups_json'));
    expect(upd).toBeTruthy();
    const groups = JSON.parse(upd!.binds[0] as string);
    expect(groups[0].schoolIds).toEqual(['leadership', 'motivation']);
    expect(groups[1].schoolIds).toEqual(['change', 'culture']); // 不动
  });

  test('happy: 跨组移动 → 200', async () => {
    const ctx = makeCtx({
      body: {
        discipline: 'keiei', viewId: 'v1',
        groupsSchoolIds: {
          g1: ['motivation'],                            // 移走 leadership
          g2: ['change', 'culture', 'leadership'],       // 接收 leadership
        },
      },
    });
    const res = await groupSchoolsPOST(ctx);
    expect(res.status).toBe(200);
  });

  test('schoolIds 跨组重复 → 400 school_duplicated', async () => {
    const res = await groupSchoolsPOST(makeCtx({
      body: {
        discipline: 'keiei', viewId: 'v1',
        groupsSchoolIds: {
          g1: ['motivation', 'leadership'],
          g2: ['leadership', 'change', 'culture'],   // leadership 在两组
        },
      },
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe('school_duplicated');
  });

  test('总集合变化（不只是重排）→ 400 set_mismatch', async () => {
    const res = await groupSchoolsPOST(makeCtx({
      body: {
        discipline: 'keiei', viewId: 'v1',
        groupsSchoolIds: { g1: ['motivation', 'leadership', 'NEW_SCHOOL'] },  // 引入新 school
      },
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe('set_mismatch');
  });

  test('group 不在 view 里 → 400 group_not_in_view', async () => {
    const res = await groupSchoolsPOST(makeCtx({
      body: {
        discipline: 'keiei', viewId: 'v1',
        groupsSchoolIds: { gNOPE: [] },
      },
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe('group_not_in_view');
  });

  test('未登录 → 401', async () => {
    const res = await groupSchoolsPOST(makeCtx({
      body: { discipline: 'keiei', viewId: 'v1', groupsSchoolIds: { g1: [] } },
      user: null,
    }));
    expect(res.status).toBe(401);
  });
});
