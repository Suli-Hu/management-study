/**
 * v0.10.0 Issue #2: theme CRUD endpoints (GET list / GET one / DELETE)
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as themesGET } from '../src/pages/api/themes/index';
import { GET as themeGET, DELETE as themeDELETE } from '../src/pages/api/themes/[key]';

const THEMES = [
  { key: 'individual', title: { zh: '个人层' }, tags: [], schools: [] },
  { key: 'organization', title: { zh: '组织层' }, tags: [], schools: [] },
];

function mockDb(opts: { themeKey?: string; refCount?: number; missingDiscipline?: boolean } = {}) {
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
          if (sql.includes('SELECT themes_json FROM discipline')) {
            if (opts.missingDiscipline) return null as T;
            return { themes_json: JSON.stringify(THEMES) } as T;
          }
          if (sql.includes('SELECT COUNT(*) as n FROM school WHERE discipline = ? AND theme_key = ?')) {
            return { n: opts.refCount ?? 0 } as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('SELECT theme_key, COUNT(*)')) {
            return { results: [{ theme_key: 'individual', n: 3 }] as T[] };
          }
          return { results: [] as T[] };
        },
        async run() { calls.push({ sql, binds: stmt.binds }); return { success: true }; },
      };
      return stmt;
    },
  };
}

function makeCtx(opts: {
  path: string;
  method: string;
  user?: APIContext['locals']['user'];
  canEdit?: boolean;
  canRead?: boolean;
  params?: Record<string, string>;
  themeKey?: string;
  refCount?: number;
  missingDiscipline?: boolean;
}): APIContext {
  const url = new URL(`http://localhost${opts.path}`);
  return {
    request: new Request(url, { method: opts.method }),
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
      canEdit: () => opts.canEdit ?? true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('GET /api/themes (list)', () => {
  test('返回 themes 列表 + 真实 school_count', async () => {
    const res = await themesGET(makeCtx({ path: '/api/themes?discipline=keiei', method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.themes).toHaveLength(2);
    expect(body.themes[0]).toMatchObject({ key: 'individual', school_count: 3 });
    expect(body.themes[1]).toMatchObject({ key: 'organization', school_count: 0 });
  });

  test('discipline 不存在 → 404', async () => {
    const res = await themesGET(makeCtx({ path: '/api/themes?discipline=nope', method: 'GET', missingDiscipline: true }));
    expect(res.status).toBe(404);
  });

  test('canRead=false → 403', async () => {
    const res = await themesGET(makeCtx({ path: '/api/themes?discipline=keiei', method: 'GET', canRead: false }));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/themes/:key', () => {
  test('返回单个 theme + school_count', async () => {
    const res = await themeGET(makeCtx({
      path: '/api/themes/individual?discipline=keiei',
      method: 'GET',
      params: { key: 'individual' },
      refCount: 5,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.theme).toMatchObject({ key: 'individual', school_count: 5 });
  });

  test('theme 不存在 → 404', async () => {
    const res = await themeGET(makeCtx({
      path: '/api/themes/nope?discipline=keiei',
      method: 'GET',
      params: { key: 'nope' },
    }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/themes/:key', () => {
  test('未登录 → 401', async () => {
    const res = await themeDELETE(makeCtx({
      path: '/api/themes/individual?discipline=keiei',
      method: 'DELETE',
      params: { key: 'individual' },
      user: null,
    }));
    expect(res.status).toBe(401);
  });

  test('canEdit=false → 403', async () => {
    const res = await themeDELETE(makeCtx({
      path: '/api/themes/individual?discipline=keiei',
      method: 'DELETE',
      params: { key: 'individual' },
      canEdit: false,
    }));
    expect(res.status).toBe(403);
  });

  test('has_dependents 时拒绝 → 409', async () => {
    const res = await themeDELETE(makeCtx({
      path: '/api/themes/individual?discipline=keiei',
      method: 'DELETE',
      params: { key: 'individual' },
      refCount: 3,
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ reason: 'has_dependents', ref_count: 3 });
  });

  test('无 dependents → 200 + 写 D1', async () => {
    const ctx = makeCtx({
      path: '/api/themes/organization?discipline=keiei',
      method: 'DELETE',
      params: { key: 'organization' },
      refCount: 0,
    });
    const res = await themeDELETE(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    expect(db.calls.some((c) => c.sql.includes('UPDATE discipline SET themes_json'))).toBe(true);
  });
});
