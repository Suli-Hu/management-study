/**
 * Decoupling baseline tests (GitHub ↔ D1 separation)
 *
 * Purpose:
 * - Lock in current behavior so we can measure progress step-by-step.
 * - Highlight which admin edits still require GitHub env (GITHUB_PAT/GITHUB_REPO).
 * - Ensure already D1-only endpoints keep working when GitHub env is absent.
 *
 * When we finish decoupling, several expectations in this file should be updated:
 * - /api/new/theme should no longer require GitHub env
 * - PUT /api/edit/discipline/:disc/tags should no longer require GitHub env (D1-only)
 * - POST /api/edit/reorder/themes-order should no longer require GitHub env (D1-only)
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';

import { POST as newThemePOST } from '../src/pages/api/new/theme';
import { PUT as editThemePUT } from '../src/pages/api/edit/theme/[discipline]/[key]';
import { POST as themesOrderPOST } from '../src/pages/api/edit/reorder/themes-order';
import { POST as disciplineSchoolsPOST } from '../src/pages/api/edit/reorder/discipline-schools';
import { PUT as tagsBulkPUT, POST as tagsPOST, GET as tagsGET } from '../src/pages/api/edit/discipline/[discipline]/tags/index';

function makeCtx(opts: {
  path: string;
  method: string;
  body?: unknown;
  params?: Record<string, string>;
  env?: Record<string, unknown>;
  user?: APIContext['locals']['user'];
  canEdit?: boolean;
}): APIContext {
  const url = new URL(`http://localhost${opts.path}`);
  return {
    request: new Request(url, {
      method: opts.method,
      headers: opts.body ? { 'content-type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }),
    url,
    params: opts.params ?? {},
    props: {},
    locals: {
      runtime: { env: { DB: makeDbStub(), ...(opts.env ?? {}) } },
      user: opts.user === undefined
        ? { id: 'u1', email: 'editor@test.com', display_name: null, created_at: '', email_verified_at: null }
        : opts.user,
      isSuperAdmin: false,
      isAdmin: false,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canRead: () => true,
      canEdit: () => opts.canEdit ?? true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

/**
 * Minimal D1 stub for routes that only need prepare().bind().first()/run()/all()/batch().
 * Individual tests can inspect calls if needed.
 */
function makeDbStub() {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    calls,
    prepare(sql: string) {
      const stmt = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          stmt.binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          // discipline-schools reads discipline.themes_json
          if (sql.includes('SELECT themes_json FROM discipline')) {
            return {
              themes_json: JSON.stringify([
                { key: 't1', title: { zh: 'T1' }, tags: [], schools: ['s1', 's2'] },
                { key: 't2', title: { zh: 'T2' }, tags: [], schools: ['s3'] },
              ]),
            } as T;
          }
          // tags GET reads discipline.tags_json
          if (sql.includes('SELECT tags_json FROM discipline')) {
            return { tags_json: JSON.stringify([{ key: 't_a', label: { zh: 'A' }, color: '#007AFF' }]) } as T;
          }
          if (sql.includes('SELECT COUNT(*) as n FROM school WHERE discipline = ? AND theme_key = ?')) {
            return { n: 0 } as T;
          }
          // discipline-schools: look up school discipline
          if (sql.includes('SELECT discipline FROM school WHERE key = ?')) {
            return { discipline: 'keiei' } as T;
          }
          // scholar/theme/kp queries not needed in this baseline
          return null as T;
        },
        async all<T = unknown>() {
          calls.push({ sql, binds: stmt.binds });
          // tags ref_count aggregation query (json_each + GROUP BY)
          if (sql.includes('json_each') && sql.includes('GROUP BY k')) {
            return { results: [] as T[] };
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
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      // naive: just call each run() to record calls
      // eslint-disable-next-line no-restricted-syntax
      for (const s of stmts) await s.run();
    },
  };
}

describe('Decouple baseline: endpoints that still require GitHub env', () => {
  test('POST /api/new/theme without GitHub env → 201 (D1-only)', async () => {
    const res = await newThemePOST(makeCtx({
      path: '/api/new/theme',
      method: 'POST',
      body: { discipline: 'keiei', json: { title: { zh: '新主题' }, tags: [] } },
      env: { DB: makeDbStub() }, // no GITHUB_PAT/REPO
    }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, source: 'd1' });
  });

  test('PUT /api/edit/theme/:discipline/:key without GitHub env → 200 (D1-only)', async () => {
    const res = await editThemePUT(makeCtx({
      path: '/api/edit/theme/keiei/t1',
      method: 'PUT',
      params: { discipline: 'keiei', key: 't1' },
      body: { title: { zh: '改名' } },
      env: { DB: makeDbStub() },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, source: 'd1' });
  });

  test('POST /api/edit/reorder/themes-order without GitHub env → 200 (D1-only)', async () => {
    const res = await themesOrderPOST(makeCtx({
      path: '/api/edit/reorder/themes-order',
      method: 'POST',
      body: { discipline: 'keiei', themeKeys: ['t2', 't1'] },
      env: { DB: makeDbStub() },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, d1_updated: true });
  });

  test('PUT /api/edit/discipline/:disc/tags without GitHub env → 200 (D1-only)', async () => {
    const res = await tagsBulkPUT(makeCtx({
      path: '/api/edit/discipline/keiei/tags',
      method: 'PUT',
      params: { discipline: 'keiei' },
      body: { tags: [{ key: 't_a', label: { zh: 'A' }, color: '#007AFF' }], base_sha: 'deadbeef' },
      env: { DB: makeDbStub() },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, source: 'd1' });
  });
});

describe('Decouple baseline: endpoints that should work without GitHub env (D1-only)', () => {
  test('POST /api/edit/reorder/discipline-schools works without GitHub env → 200', async () => {
    const ctx = makeCtx({
      path: '/api/edit/reorder/discipline-schools',
      method: 'POST',
      body: {
        discipline: 'keiei',
        themesSchools: {
          t1: ['s2', 's1'],
          t2: ['s3'],
        },
      },
      env: { DB: makeDbStub() },
    });
    const res = await disciplineSchoolsPOST(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, d1_updated: true });
  });

  test('GET /api/edit/discipline/:disc/tags prefers D1 even without GitHub env → 200', async () => {
    const res = await tagsGET(makeCtx({
      path: '/api/edit/discipline/keiei/tags',
      method: 'GET',
      params: { discipline: 'keiei' },
      env: { DB: makeDbStub() },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, source: 'd1' });
  });

  test('POST /api/edit/discipline/:disc/tags (create single tag) works without GitHub env → 201', async () => {
    const res = await tagsPOST(makeCtx({
      path: '/api/edit/discipline/keiei/tags',
      method: 'POST',
      params: { discipline: 'keiei' },
      body: { label: { zh: '新标签' }, color: '#34C759' },
      env: { DB: makeDbStub() },
    }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, source: 'd1' });
  });
});

