/**
 * /api/admin/disciplines
 *   Stage 3 MVP: admin discipline operations are D1-first and do not
 *   require GitHub data writes.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as disciplinesGET, POST as disciplinesPOST } from '../src/pages/api/admin/disciplines/index';
import { PUT as disciplinePUT, DELETE as disciplineDELETE } from '../src/pages/api/admin/disciplines/[key]';

type CountRow = { v: number; s: number; c: number; k: number };

interface MockDbOptions {
  existingKeys?: string[];
  counts?: CountRow;
  putRow?: Record<string, unknown> | null;
}

function makeDisciplineRow(key = 'finance') {
  return {
    key,
    title_zh: '财务管理',
    title_en: 'Finance',
    title_ja: '財務',
    tagline_zh: '备注',
    tagline_ja: null,
    tags_json: '[]',
    themes_json: '[]',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    view_count: 0,
    school_count: 0,
    scholar_count: 0,
    kp_count: 0,
  };
}

function mockDb(opts: MockDbOptions = {}) {
  const existingKeys = new Set(opts.existingKeys ?? ['finance']);
  const counts = opts.counts ?? { v: 0, s: 0, c: 0, k: 0 };
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const batchCalls: Array<{ sql: string; binds: unknown[] }> = [];

  const db = {
    calls,
    batchCalls,
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
          if (sql.includes('SELECT key FROM discipline WHERE key = ?')) {
            return existingKeys.has(String(stmt.binds[0])) ? ({ key: stmt.binds[0] } as T) : null;
          }
          if (sql.includes('FROM discipline') && sql.includes('tags_json') && sql.includes('WHERE key = ?')) {
            return (opts.putRow === null ? null : makeDisciplineRow(String(stmt.binds[0]))) as T;
          }
          if (sql.includes('SELECT') && sql.includes('(SELECT COUNT(*) FROM view')) {
            return counts as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          if (sql.includes('FROM discipline d')) {
            return { results: [makeDisciplineRow('finance')] as T[] };
          }
          if (sql.includes('FROM tenant_member tm') && sql.includes('INNER JOIN tenant t')) {
            return {
              results: [
                { discipline_key: 'finance', role: 'editor', email: 'editor@example.com', display_name: 'Editor' },
                { discipline_key: 'finance', role: 'viewer', email: 'reader@example.com', display_name: null },
              ] as T[],
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
    async batch(stmts: Array<{ sql: string; binds: unknown[] }>) {
      for (const stmt of stmts) batchCalls.push({ sql: stmt.sql, binds: stmt.binds });
      return stmts.map(() => ({ success: true }));
    },
  };

  return db;
}

function makeCtx(method: string, body: unknown, db: ReturnType<typeof mockDb>, params: Record<string, string> = {}): APIContext {
  const url = new URL('http://localhost/api/admin/disciplines');
  return {
    request: new Request(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    url,
    params,
    props: {},
    locals: {
      runtime: { env: { DB: db } },
      user: { id: 'admin', email: 'owner@test.com', display_name: null, created_at: '', email_verified_at: null },
      isSuperAdmin: true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('/api/admin/disciplines', () => {
  test('GET returns editor and reader summaries for the list UI', async () => {
    const db = mockDb();
    const res = await disciplinesGET(makeCtx('GET', undefined, db));

    expect(res.status).toBe(200);
    const data = await res.json() as { disciplines: Array<{ access: { editors: unknown[]; readers: unknown[] } }> };
    expect(data.disciplines[0].access.editors).toHaveLength(1);
    expect(data.disciplines[0].access.readers).toHaveLength(1);
  });

  test('POST creates discipline and tenant in D1 without GitHub config', async () => {
    const db = mockDb({ existingKeys: [] });
    const res = await disciplinesPOST(makeCtx('POST', {
      title: { zh: '财务管理', en: 'Finance', ja: '財務' },
      tagline: { zh: '备注' },
    }, db));

    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; discipline: { key: string }; commit_sha?: string };
    expect(data).toMatchObject({ ok: true, discipline: { key: 'finance' } });
    expect(data.commit_sha).toBeUndefined();
    expect(db.batchCalls.some((c) => c.sql.includes('INSERT INTO discipline'))).toBe(true);
    expect(db.batchCalls.some((c) => c.sql.includes('INSERT INTO tenant'))).toBe(true);
  });

  test('POST rejects duplicate generated discipline key', async () => {
    const db = mockDb({ existingKeys: ['finance'] });
    const res = await disciplinesPOST(makeCtx('POST', {
      title: { zh: '财务管理', en: 'Finance' },
    }, db));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'key_taken' });
  });

  test('PUT updates discipline and tenant in D1 without GitHub config', async () => {
    const db = mockDb({ existingKeys: ['finance'] });
    const res = await disciplinePUT(makeCtx('PUT', {
      title: { zh: '公司财务', en: 'Corporate Finance', ja: '企業財務' },
      tagline: { zh: '新的备注' },
    }, db, { key: 'finance' }));

    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; commit_sha?: string };
    expect(data.ok).toBe(true);
    expect(data.commit_sha).toBeUndefined();
    expect(db.batchCalls.some((c) => c.sql.includes('UPDATE discipline SET'))).toBe(true);
    expect(db.batchCalls.some((c) => c.sql.includes('INSERT INTO tenant'))).toBe(true);
  });

  test('DELETE refuses non-empty disciplines', async () => {
    const db = mockDb({ existingKeys: ['finance'], counts: { v: 1, s: 0, c: 0, k: 0 } });
    const res = await disciplineDELETE(makeCtx('DELETE', undefined, db, { key: 'finance' }));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_empty' });
    expect(db.batchCalls).toHaveLength(0);
  });

  test('DELETE removes D1 rows for empty disciplines', async () => {
    const db = mockDb({ existingKeys: ['finance'], counts: { v: 0, s: 0, c: 0, k: 0 } });
    const res = await disciplineDELETE(makeCtx('DELETE', undefined, db, { key: 'finance' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, key: 'finance' });
    expect(db.batchCalls.map((c) => c.sql)).toEqual([
      'DELETE FROM tenant_member WHERE tenant_id = ?',
      'DELETE FROM tenant WHERE id = ?',
      'DELETE FROM discipline WHERE key = ?',
    ]);
  });
});
