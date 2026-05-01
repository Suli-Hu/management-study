/**
 * /api/views API-first routes
 *   Stage 2C acceptance: tenant-scoped view CRUD and reorder.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as viewsGET, POST as viewsPOST } from '../src/pages/api/views/index';
import { DELETE as viewDELETE, GET as viewGET, PATCH as viewPATCH } from '../src/pages/api/views/[id]';
import { POST as reorderPOST } from '../src/pages/api/views/reorder';

const VIEW_ROW = {
  id: 'default',
  discipline: 'keiei',
  name: '默认视图',
  jp: 'デフォルト',
  icon: '📚',
  description: '默认分组',
  flow: '',
  scope: 'public' as const,
  kind: 'manual' as const,
  is_default: 0,
  position: 0,
  groups_json: JSON.stringify([{ id: 'main', title: '主要理论', flow: '', schoolIds: ['motivation'] }]),
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function mockDb(opts: {
  role?: 'editor' | 'viewer' | null;
  existingView?: boolean;
  missingSchool?: boolean;
  isDefault?: boolean;
  viewIds?: string[];
} = {}) {
  const role = opts.role === undefined ? 'editor' : opts.role;
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const rows = (opts.viewIds ?? ['default']).map((id, position) => ({
    ...VIEW_ROW,
    id,
    is_default: (opts.isDefault && id === 'default') || id === 'primary' ? 1 : 0,
    position,
  }));

  return {
    calls,
    prepare(sql: string) {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          stmt.binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('FROM tenant WHERE')) return { id: 'keiei', discipline_key: 'keiei' } as T;
          if (sql.includes('FROM tenant_member')) return (role ? { role } : null) as T;
          if (sql.includes('SELECT id FROM view WHERE id = ?')) {
            return (opts.existingView ? { id: stmt.binds[0] } : null) as T;
          }
          if (sql.includes('SELECT * FROM view WHERE id = ?')) {
            return (rows.find((row) => row.id === stmt.binds[0]) ?? null) as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('SELECT * FROM view WHERE discipline')) return { results: rows as T[] };
          if (sql.includes('SELECT key FROM school')) {
            return { results: opts.missingSchool ? [] as T[] : [{ key: 'motivation' }] as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          calls.push({ sql, binds: stmt.binds });
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: unknown[]) {
      calls.push({ sql: `BATCH:${stmts.length}`, binds: [] });
      for (const stmt of stmts as Array<{ sql?: string; binds?: unknown[] }>) {
        calls.push({ sql: stmt.sql ?? 'BATCH_STMT', binds: stmt.binds ?? [] });
      }
      return [];
    },
  };
}

function makeCtx(opts: {
  path: string;
  method: string;
  body?: unknown;
  user?: APIContext['locals']['user'];
  role?: 'editor' | 'viewer' | null;
  canEdit?: boolean;
  canRead?: boolean;
  existingView?: boolean;
  missingSchool?: boolean;
  isDefault?: boolean;
  viewIds?: string[];
  params?: Record<string, string>;
}): APIContext {
  const url = new URL(`http://localhost${opts.path}`);
  const init: RequestInit = { method: opts.method };
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
      runtime: { env: { DB: mockDb(opts) } },
      user: opts.user === undefined
        ? { id: 'u1', email: 'editor@test.com', display_name: null, created_at: '', email_verified_at: null }
        : opts.user,
      isSuperAdmin: false,
      isAdmin: false,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canRead: () => opts.canRead ?? true,
      canEdit: () => opts.canEdit ?? opts.role !== 'viewer',
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

const CREATE_BODY = {
  id: 'default',
  name: '默认视图',
  jp: 'デフォルト',
  icon: '📚',
  description: '默认分组',
  flow: '',
  scope: 'public',
  kind: 'manual',
  isDefault: true,
  position: 0,
  groups: [{ id: 'main', title: '主要理论', flow: '', schoolIds: ['motivation'] }],
};

describe('GET /api/views', () => {
  test('viewer 可以列出 views', async () => {
    const res = await viewsGET(makeCtx({
      path: '/api/views?discipline=keiei',
      method: 'GET',
      role: 'viewer',
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      views: [{ id: 'default', groups: [{ schoolIds: ['motivation'] }] }],
    });
  });
});

describe('POST /api/views', () => {
  test('未登录 → 401', async () => {
    const res = await viewsPOST(makeCtx({
      path: '/api/views?discipline=keiei',
      method: 'POST',
      user: null,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(401);
  });

  test('viewer 不能创建', async () => {
    const res = await viewsPOST(makeCtx({
      path: '/api/views?discipline=keiei',
      method: 'POST',
      role: 'viewer',
      canEdit: false,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'not_editor' });
  });

  test('body 里的 tenant_id / discipline 被拒绝', async () => {
    const res = await viewsPOST(makeCtx({
      path: '/api/views?discipline=keiei',
      method: 'POST',
      body: { ...CREATE_BODY, tenant_id: 'evil', discipline: 'evil' },
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'schema_invalid' });
  });

  test('id 已存在 → 409', async () => {
    const res = await viewsPOST(makeCtx({
      path: '/api/views?discipline=keiei',
      method: 'POST',
      existingView: true,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'view_id_exists' });
  });

  test('groups 引用其它 tenant / 不存在 school → 422', async () => {
    const res = await viewsPOST(makeCtx({
      path: '/api/views?discipline=keiei',
      method: 'POST',
      missingSchool: true,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'school_not_in_tenant', detail: ['motivation'] });
  });

  test('editor 可以创建默认 view，并取消其它默认', async () => {
    const ctx = makeCtx({
      path: '/api/views?discipline=keiei',
      method: 'POST',
      body: CREATE_BODY,
    });
    const res = await viewsPOST(ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, view: { id: 'default' } });
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    expect(db.calls.some((c) => c.sql.includes('UPDATE view SET is_default = 0'))).toBe(true);
  });
});

describe('GET/PATCH/DELETE /api/views/:id', () => {
  test('GET 返回单个 view', async () => {
    const res = await viewGET(makeCtx({
      path: '/api/views/default?discipline=keiei',
      method: 'GET',
      role: 'viewer',
      params: { id: 'default' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ view: { id: 'default', name: '默认视图' } });
  });

  test('PATCH 可以局部修改', async () => {
    const res = await viewPATCH(makeCtx({
      path: '/api/views/default?discipline=keiei',
      method: 'PATCH',
      params: { id: 'default' },
      body: { name: '新的默认视图' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, view: { id: 'default' } });
  });

  test('DELETE 默认视图时保护性拒绝', async () => {
    const res = await viewDELETE(makeCtx({
      path: '/api/views/default?discipline=keiei',
      method: 'DELETE',
      params: { id: 'default' },
      isDefault: true,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'view_is_default' });
  });

  test('DELETE 非默认视图成功', async () => {
    const ctx = makeCtx({
      path: '/api/views/default?discipline=keiei',
      method: 'DELETE',
      params: { id: 'default' },
    });
    const res = await viewDELETE(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    expect(db.calls.some((c) => c.sql.includes('DELETE FROM view WHERE id = ?'))).toBe(true);
  });
});

describe('POST /api/views/reorder', () => {
  test('viewIds 必须等于当前集合', async () => {
    const res = await reorderPOST(makeCtx({
      path: '/api/views/reorder?discipline=keiei',
      method: 'POST',
      viewIds: ['default', 'timeline'],
      body: { viewIds: ['default'] },
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'view_ids_mismatch' });
  });

  test('可以重排并设置默认视图', async () => {
    const ctx = makeCtx({
      path: '/api/views/reorder?discipline=keiei',
      method: 'POST',
      viewIds: ['default', 'timeline'],
      body: { viewIds: ['timeline', 'default'], defaultViewId: 'timeline' },
    });
    const res = await reorderPOST(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    expect(db.calls.some((c) => c.sql.includes('UPDATE view SET position = ?'))).toBe(true);
  });
});
