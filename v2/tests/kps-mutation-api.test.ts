/**
 * /api/kps/:id mutation routes
 *   Stage 1 acceptance: editor can patch/delete, viewer cannot, versions are readable.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { PATCH as kpPATCH, DELETE as kpDELETE } from '../src/pages/api/kps/[id]';
import { GET as versionsGET } from '../src/pages/api/kps/[id]/versions';

const KP_ROW = {
  id: 'k001',
  tenant_id: 'keiei',
  discipline: 'keiei',
  year: '1943',
  title_zh: '旧标题',
  title_en: 'Old title',
  title_ja: null,
  body_zh: '旧正文',
  body_ja: null,
  tags_json: '[]',
  format: 'narrative',
  eval_content_zh_json: '{}',
  eval_content_ja_json: '{}',
  created_by: 'u1',
  updated_by: 'u1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function mockDb(opts: { role?: 'editor' | 'viewer'; missingSchool?: boolean } = {}) {
  const role = opts.role ?? 'editor';
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
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
          if (sql.includes('FROM kp WHERE id = ?')) return KP_ROW as T;
          if (sql.includes('FROM tenant WHERE')) return { id: 'keiei', discipline_key: 'keiei' } as T;
          if (sql.includes('FROM tenant_member')) return { role } as T;
          if (sql.includes('MAX(version)')) return { version: 2 } as T;
          return null as T;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('FROM kp_school')) return { results: [{ school_key: 'motivation' }] as T[] };
          if (sql.includes('FROM kp_scholar')) return { results: [{ scholar_key: 'maslow' }] as T[] };
          if (sql.includes('SELECT key FROM school')) {
            return { results: opts.missingSchool ? [] as T[] : [{ key: 'motivation' }] as T[] };
          }
          if (sql.includes('SELECT key FROM scholar')) return { results: [{ key: 'maslow' }] as T[] };
          if (sql.includes('FROM knowledge_point_versions')) {
            return {
              results: [{
                id: 7,
                kp_id: 'k001',
                tenant_id: 'keiei',
                version: 2,
                snapshot_json: JSON.stringify({ id: 'k001', title: { zh: '旧标题' } }),
                edited_by: 'u1',
                created_at: '2026-01-02T00:00:00.000Z',
              }] as T[],
            };
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
  method: string;
  body?: unknown;
  role?: 'editor' | 'viewer';
  missingSchool?: boolean;
}): APIContext {
  const url = new URL('http://localhost/api/kps/k001');
  const init: RequestInit = { method: opts.method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const db = mockDb({ role: opts.role, missingSchool: opts.missingSchool });
  return {
    request: new Request(url, init),
    url,
    params: { id: 'k001' },
    props: {},
    locals: {
      runtime: { env: { DB: db } },
      user: { id: 'u1', email: 'editor@test.com', display_name: null, created_at: '', email_verified_at: null },
      isSuperAdmin: false,
      isAdmin: false,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canRead: () => true,
      canEdit: () => opts.role !== 'viewer',
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('PATCH /api/kps/:id', () => {
  test('viewer 不能修改', async () => {
    const res = await kpPATCH(makeCtx({ method: 'PATCH', role: 'viewer', body: { title: { zh: '新标题' } } }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_editor' });
  });

  test('editor 可以局部修改并返回更新后 KP', async () => {
    const res = await kpPATCH(makeCtx({ method: 'PATCH', body: { title: { zh: '新标题' } } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      kp: { id: 'k001', tenant_id: 'keiei', discipline: 'keiei' },
    });
  });

  test('引用不存在的学派 → 422', async () => {
    const res = await kpPATCH(makeCtx({
      method: 'PATCH',
      missingSchool: true,
      body: { schools: ['missing_school'] },
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'school_not_in_tenant' });
  });
});

describe('DELETE /api/kps/:id', () => {
  test('viewer 不能删除', async () => {
    const res = await kpDELETE(makeCtx({ method: 'DELETE', role: 'viewer' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_editor' });
  });

  test('editor 删除成功并保留版本快照', async () => {
    const ctx = makeCtx({ method: 'DELETE' });
    const res = await kpDELETE(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, tenant: { tenantId: 'keiei' } });
    const db = ctx.locals.runtime.env.DB as unknown as ReturnType<typeof mockDb>;
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO knowledge_point_versions'))).toBe(true);
    expect(db.calls.some((c) => c.sql.includes('DELETE FROM kp WHERE id = ?'))).toBe(true);
  });
});

describe('GET /api/kps/:id/versions', () => {
  test('读者可以查看版本历史', async () => {
    const res = await versionsGET(makeCtx({ method: 'GET', role: 'viewer' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      kp_id: 'k001',
      versions: [{
        id: 7,
        kp_id: 'k001',
        tenant_id: 'keiei',
        version: 2,
        snapshot: { id: 'k001', title: { zh: '旧标题' } },
        edited_by: 'u1',
      }],
    });
  });
});
