/**
 * /api/scholars API-first routes
 *   Stage 2B acceptance: tenant-scoped scholar CRUD with reference checks.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as scholarsGET, POST as scholarsPOST } from '../src/pages/api/scholars/index';
import { DELETE as scholarDELETE, GET as scholarGET, PATCH as scholarPATCH } from '../src/pages/api/scholars/[key]';

const SCHOLAR_ROW = {
  key: 'maslow',
  discipline: 'keiei',
  name_zh: '马斯洛',
  name_en: 'Abraham Maslow',
  name_ja: null,
  contribution_zh: '提出需求层次理论。',
  contribution_ja: null,
  institution: 'Brandeis University',
  born: '1908',
  died: '1970',
  nationality: '美国',
  flag: '',
  origin: '',
  field: '心理学',
  tags_json: '["classic"]',
  nobel_year: null,
  nobel_detail: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  kp_count: 0,
  school_count: 1,
};

function mockDb(opts: {
  role?: 'editor' | 'viewer' | null;
  existingScholar?: boolean;
  missingSchool?: boolean;
  missingKp?: boolean;
  kpCount?: number;
} = {}) {
  const role = opts.role === undefined ? 'editor' : opts.role;
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const row = { ...SCHOLAR_ROW, kp_count: opts.kpCount ?? SCHOLAR_ROW.kp_count };

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
          if (sql.includes('SELECT COUNT(*) as n FROM scholar s')) return { n: 1 } as T;
          if (sql.includes('SELECT key FROM scholar WHERE discipline = ? AND key = ?')) {
            return (opts.existingScholar ? { key: stmt.binds[1] } : null) as T;
          }
          if (sql.includes('FROM scholar s') && sql.includes('s.key = ?')) return row as T;
          return null as T;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('FROM scholar s') && !sql.includes('s.key = ?')) return { results: [row] as T[] };
          if (sql.includes('FROM scholar_school')) return { results: [{ school_key: 'motivation' }] as T[] };
          if (sql.includes('FROM kp_scholar')) return { results: [{ kp_id: 'k001' }] as T[] };
          if (sql.includes('SELECT key FROM school')) {
            return { results: opts.missingSchool ? [] as T[] : [{ key: 'motivation' }] as T[] };
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
  existingScholar?: boolean;
  missingSchool?: boolean;
  missingKp?: boolean;
  kpCount?: number;
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
  key: 'maslow',
  name: { zh: '马斯洛', en: 'Abraham Maslow' },
  schools: ['motivation'],
  contribution: { zh: '提出需求层次理论。' },
  institution: 'Brandeis University',
  born: '1908',
  died: '1970',
  nationality: '美国',
  field: '心理学',
  tags: ['classic'],
  nobel: null,
  kpsOrder: ['k001'],
};

describe('GET /api/scholars', () => {
  test('viewer 可以列出 scholars', async () => {
    const res = await scholarsGET(makeCtx({
      path: '/api/scholars?discipline=keiei',
      method: 'GET',
      role: 'viewer',
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      scholars: [{ key: 'maslow', name: { zh: '马斯洛', en: 'Abraham Maslow' }, schools: ['motivation'], kpsOrder: ['k001'] }],
      page: { limit: 50, offset: 0, total: 1, next_offset: null },
    });
  });
});

describe('POST /api/scholars', () => {
  test('未登录 → 401', async () => {
    const res = await scholarsPOST(makeCtx({
      path: '/api/scholars?discipline=keiei',
      method: 'POST',
      user: null,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(401);
  });

  test('viewer 不能创建', async () => {
    const res = await scholarsPOST(makeCtx({
      path: '/api/scholars?discipline=keiei',
      method: 'POST',
      role: 'viewer',
      canEdit: false,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'not_editor' });
  });

  test('body 里的 tenant_id / discipline 被拒绝', async () => {
    const res = await scholarsPOST(makeCtx({
      path: '/api/scholars?discipline=keiei',
      method: 'POST',
      body: { ...CREATE_BODY, tenant_id: 'evil', discipline: 'evil' },
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'schema_invalid' });
  });

  test('key 已存在 → 409', async () => {
    const res = await scholarsPOST(makeCtx({
      path: '/api/scholars?discipline=keiei',
      method: 'POST',
      existingScholar: true,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'scholar_key_exists' });
  });

  test('schools 引用其它 tenant / 不存在 school → 422', async () => {
    const res = await scholarsPOST(makeCtx({
      path: '/api/scholars?discipline=keiei',
      method: 'POST',
      missingSchool: true,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'school_not_in_tenant', detail: ['motivation'] });
  });

  test('kpsOrder 引用其它 tenant / 不存在 KP → 422', async () => {
    const res = await scholarsPOST(makeCtx({
      path: '/api/scholars?discipline=keiei',
      method: 'POST',
      missingKp: true,
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: 'kp_not_in_tenant', detail: ['k001'] });
  });

  test('editor 可以创建', async () => {
    const res = await scholarsPOST(makeCtx({
      path: '/api/scholars?discipline=keiei',
      method: 'POST',
      body: CREATE_BODY,
    }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, scholar: { key: 'maslow' } });
  });
});

describe('GET/PATCH/DELETE /api/scholars/:key', () => {
  test('GET 返回单个 scholar', async () => {
    const res = await scholarGET(makeCtx({
      path: '/api/scholars/maslow?discipline=keiei',
      method: 'GET',
      role: 'viewer',
      params: { key: 'maslow' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ scholar: { key: 'maslow', kp_count: 0, school_count: 1 } });
  });

  test('PATCH 可以局部修改', async () => {
    const res = await scholarPATCH(makeCtx({
      path: '/api/scholars/maslow?discipline=keiei',
      method: 'PATCH',
      params: { key: 'maslow' },
      body: { name: { zh: '亚伯拉罕·马斯洛' } },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, scholar: { key: 'maslow' } });
  });

  test('DELETE 有 KP 关联时保护性拒绝', async () => {
    const res = await scholarDELETE(makeCtx({
      path: '/api/scholars/maslow?discipline=keiei',
      method: 'DELETE',
      params: { key: 'maslow' },
      kpCount: 2,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'scholar_has_kps', detail: 2 });
  });

  test('DELETE 无 KP 依赖时成功', async () => {
    const ctx = makeCtx({
      path: '/api/scholars/maslow?discipline=keiei',
      method: 'DELETE',
      params: { key: 'maslow' },
    });
    const res = await scholarDELETE(ctx);
    expect(res.status).toBe(200);
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    expect(db.calls.some((c) => c.sql.includes('DELETE FROM scholar WHERE key = ? AND discipline = ?'))).toBe(true);
  });
});
