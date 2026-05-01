/**
 * /api/schools API-first routes
 *   Stage 2A acceptance: tenant-scoped school CRUD with protective deletes.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as schoolsGET, POST as schoolsPOST } from '../src/pages/api/schools/index';
import { GET as schoolGET, PATCH as schoolPATCH, DELETE as schoolDELETE } from '../src/pages/api/schools/[key]';

const SCHOOL_ROW = {
  key: 'motivation',
  discipline: 'keiei',
  title_zh: '动机理论',
  title_en: 'Motivation Theory',
  title_ja: null,
  era: '1940s',
  summary_zh: '研究工作动机。',
  summary_ja: null,
  theme_key: 'individual',
  tags_json: '["classic"]',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  kp_count: 0,
  scholar_count: 0,
};

function mockDb(opts: {
  role?: 'editor' | 'viewer' | null;
  existingSchool?: boolean;
  missingKp?: boolean;
  kpCount?: number;
  scholarCount?: number;
  viewCount?: number;
} = {}) {
  const role = opts.role === undefined ? 'editor' : opts.role;
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const row = {
    ...SCHOOL_ROW,
    kp_count: opts.kpCount ?? SCHOOL_ROW.kp_count,
    scholar_count: opts.scholarCount ?? SCHOOL_ROW.scholar_count,
  };

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
          if (sql.includes('SELECT COUNT(*) as n FROM school s')) return { n: 1 } as T;
          if (sql.includes('SELECT key FROM school WHERE key = ?')) {
            return (opts.existingSchool ? { key: stmt.binds[0] } : null) as T;
          }
          if (sql.includes('FROM school s') && sql.includes('s.key = ?')) return row as T;
          if (sql.includes('SELECT themes_json FROM discipline')) {
            return { themes_json: JSON.stringify([{ key: 'individual' }, { key: 'organization' }]) } as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('FROM school s') && !sql.includes('s.key = ?')) return { results: [row] as T[] };
          if (sql.includes('FROM kp_school')) return { results: [{ kp_id: 'k001' }] as T[] };
          if (sql.includes('FROM view WHERE discipline')) {
            const groups = opts.viewCount ? [{ schoolIds: ['motivation'] }] : [];
            return { results: [{ groups_json: JSON.stringify(groups) }] as T[] };
          }
          if (sql.includes('SELECT id FROM kp')) {
            return { results: opts.missingKp ? [] as T[] : [{ id: 'k001' }] as T[] };
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
  existingSchool?: boolean;
  missingKp?: boolean;
  kpCount?: number;
  scholarCount?: number;
  viewCount?: number;
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
  key: 'motivation',
  title: { zh: '动机理论', en: 'Motivation Theory' },
  era: '1940s',
  summary: { zh: '研究工作动机。' },
  themeKey: 'individual',
  tags: ['classic'],
  concepts: ['k001'],
};

describe('GET /api/schools', () => {
  test('viewer 可以列出 schools', async () => {
    const res = await schoolsGET(makeCtx({
      path: '/api/schools?discipline=keiei',
      method: 'GET',
      role: 'viewer',
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      schools: [{ key: 'motivation', title: { zh: '动机理论', en: 'Motivation Theory' }, concepts: ['k001'] }],
      page: { limit: 50, offset: 0, total: 1, next_offset: null },
    });
  });
});

describe('POST /api/schools', () => {
  test('未登录 → 401', async () => {
    const res = await schoolsPOST(makeCtx({
      path: '/api/schools?discipline=keiei',
      method: 'POST',
      user: null,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(401);
  });

  test('viewer 不能创建', async () => {
    const res = await schoolsPOST(makeCtx({
      path: '/api/schools?discipline=keiei',
      method: 'POST',
      role: 'viewer',
      canEdit: false,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'not_editor' });
  });

  test('body 里的 tenant_id / discipline 被拒绝', async () => {
    const res = await schoolsPOST(makeCtx({
      path: '/api/schools?discipline=keiei',
      method: 'POST',
      body: { ...CREATE_BODY, tenant_id: 'evil', discipline: 'evil' },
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'schema_invalid' });
  });

  test('key 已存在 → 409', async () => {
    const res = await schoolsPOST(makeCtx({
      path: '/api/schools?discipline=keiei',
      method: 'POST',
      existingSchool: true,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'school_key_exists' });
  });

  test('concepts 引用其它 tenant / 不存在 KP → 422', async () => {
    const res = await schoolsPOST(makeCtx({
      path: '/api/schools?discipline=keiei',
      method: 'POST',
      missingKp: true,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'kp_not_in_tenant', detail: ['k001'] });
  });

  test('editor 可以创建', async () => {
    const res = await schoolsPOST(makeCtx({
      path: '/api/schools?discipline=keiei',
      method: 'POST',
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, school: { key: 'motivation' } });
  });
});

describe('GET/PATCH/DELETE /api/schools/:key', () => {
  test('GET 返回单个 school', async () => {
    const res = await schoolGET(makeCtx({
      path: '/api/schools/motivation?discipline=keiei',
      method: 'GET',
      role: 'viewer',
      params: { key: 'motivation' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ school: { key: 'motivation', kp_count: 0, scholar_count: 0 } });
  });

  test('PATCH 可以局部修改', async () => {
    const res = await schoolPATCH(makeCtx({
      path: '/api/schools/motivation?discipline=keiei',
      method: 'PATCH',
      params: { key: 'motivation' },
      body: { title: { zh: '新动机理论' } },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, school: { key: 'motivation' } });
  });

  test('DELETE 有 KP 关联时保护性拒绝', async () => {
    const res = await schoolDELETE(makeCtx({
      path: '/api/schools/motivation?discipline=keiei',
      method: 'DELETE',
      params: { key: 'motivation' },
      kpCount: 2,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'school_has_kps', detail: 2 });
  });

  test('DELETE 有 scholar 关联时保护性拒绝', async () => {
    const res = await schoolDELETE(makeCtx({
      path: '/api/schools/motivation?discipline=keiei',
      method: 'DELETE',
      params: { key: 'motivation' },
      scholarCount: 1,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'school_has_scholars', detail: 1 });
  });

  test('DELETE 被 view 使用时保护性拒绝', async () => {
    const res = await schoolDELETE(makeCtx({
      path: '/api/schools/motivation?discipline=keiei',
      method: 'DELETE',
      params: { key: 'motivation' },
      viewCount: 1,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'school_used_in_views', detail: 1 });
  });

  test('DELETE 无依赖时成功', async () => {
    const ctx = makeCtx({
      path: '/api/schools/motivation?discipline=keiei',
      method: 'DELETE',
      params: { key: 'motivation' },
    });
    const res = await schoolDELETE(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    expect(db.calls.some((c) => c.sql.includes('DELETE FROM school WHERE key = ?'))).toBe(true);
  });
});
