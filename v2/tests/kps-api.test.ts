/**
 * /api/kps API-first routes
 *   Focus: auth gate, tenant resolution, and strict input schema before D1 writes.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as kpsGET, POST as kpsPOST } from '../src/pages/api/kps/index';
import { GET as kpGET } from '../src/pages/api/kps/[id]';

function mockDb(opts: { memberRole?: 'owner' | 'editor' | 'viewer' | null } = {}) {
  const memberRole = opts.memberRole === undefined ? 'editor' : opts.memberRole;
  return {
    prepare(sql: string) {
      const stmt = {
        _binds: [] as unknown[],
        bind(...args: unknown[]) {
          stmt._binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          if (sql.includes('FROM tenant WHERE')) return { id: 'keiei', discipline_key: 'keiei' } as T;
          if (sql.includes('FROM tenant_member')) return (memberRole ? { role: memberRole } : null) as T;
          if (sql.includes('FROM kp WHERE id = ?')) return null as T;
          if (sql.includes('COUNT(*) as n')) return { n: 0 } as T;
          return null as T;
        },
        async all<T = unknown>() {
          return { results: [] as T[] };
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
    async batch() {
      return [];
    },
  };
}

function makeCtx(opts: {
  path: string;
  method: string;
  body?: unknown;
  user?: APIContext['locals']['user'];
  canEdit?: boolean;
  canRead?: boolean;
  isSuperAdmin?: boolean;
  memberRole?: 'owner' | 'editor' | 'viewer' | null;
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
      runtime: { env: { DB: mockDb({ memberRole: opts.memberRole }) } },
      user: opts.user === undefined
        ? { id: 'u1', email: 'admin@test.com', display_name: null, created_at: '', email_verified_at: null }
        : opts.user,
      isAdmin: opts.isSuperAdmin ?? false,
      isSuperAdmin: opts.isSuperAdmin ?? false,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canEdit: () => opts.canEdit ?? true,
      canRead: () => opts.canRead ?? true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('POST /api/kps', () => {
  test('未登录 → 401', async () => {
    const res = await kpsPOST(makeCtx({
      path: '/api/kps?discipline=keiei',
      method: 'POST',
      user: null,
      body: {},
    }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_authenticated' });
  });

  test('body 里的 tenant_id / discipline 不被接受为输入 schema', async () => {
    const res = await kpsPOST(makeCtx({
      path: '/api/kps?discipline=keiei',
      method: 'POST',
      body: {
        tenant_id: 'evil',
        discipline: 'evil',
        title: { zh: '测试' },
        body: { zh: { format: 'narrative', prose: '正文' } },
        schools: ['scientific'],
      },
    }));
    expect(res.status).toBe(422);
    // v0.8.2 F4：strict zod 拒未知顶层 key → path=[] 不触及 body → schema_invalid（之前误归 body_structure_invalid）
    const data = await res.json() as { reason: string; detail: Array<{ code: string }> };
    expect(data.reason).toBe('schema_invalid');
    expect(data.detail.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
  });

  test('viewer 不能创建 KP', async () => {
    const res = await kpsPOST(makeCtx({
      path: '/api/kps?discipline=keiei',
      method: 'POST',
      memberRole: 'viewer',
      canEdit: false,
      body: {
        title: { zh: '测试' },
        body: { zh: '正文' },
        format: 'narrative',
        schools: ['scientific'],
      },
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_editor' });
  });

  test('super-admin token scope 不含目标学科时也不能写', async () => {
    const res = await kpsPOST(makeCtx({
      path: '/api/kps?discipline=keiei',
      method: 'POST',
      isSuperAdmin: true,
      canEdit: false,
      body: {
        title: { zh: '测试' },
        body: { zh: '正文' },
        format: 'narrative',
        schools: ['scientific'],
      },
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_editor' });
  });
});

describe('GET /api/kps', () => {
  test('返回分页结构', async () => {
    const res = await kpsGET(makeCtx({
      path: '/api/kps?discipline=keiei&limit=20&offset=0&q=组织&school=scientific',
      method: 'GET',
      memberRole: 'viewer',
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      page: { limit: 20, offset: 0, total: 0, next_offset: null },
      kps: [],
    });
  });
});

describe('GET /api/kps/:id', () => {
  test('不存在的 KP → 404', async () => {
    const res = await kpGET(makeCtx({
      path: '/api/kps/k404',
      method: 'GET',
      params: { id: 'k404' },
    }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'kp_not_found' });
  });
});
