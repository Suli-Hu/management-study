/**
 * /api/edit/kp/:id integration tests (v0.4.2)
 *   PUT 路由：admin gate / config / 422 schema / id_mismatch / 409 sha_conflict / 200 happy path
 *   GET 路由：admin gate / 404 not in D1 / 200 with json + base_sha
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

// btoa 不能直接吃中文 → 先 utf-8 encode
function utf8Btoa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
import { PUT as kpPUT, GET as kpGET, DELETE as kpDELETE } from '../src/pages/api/edit/kp/[id]';
import type { APIContext } from 'astro';

interface MockHandler {
  (sql: string, binds: unknown[]): { rows?: unknown[]; meta?: { success: boolean; changes?: number } } | undefined;
}

function mockDb(handler: MockHandler = () => ({ rows: [], meta: { success: true } })) {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          const r = handler(sql, binds);
          return ((r?.rows?.[0] ?? null) as T | null);
        },
        async all<T = unknown>() {
          const r = handler(sql, binds);
          return { results: (r?.rows ?? []) as T[] };
        },
        async run() {
          const r = handler(sql, binds);
          return { success: r?.meta?.success ?? true, meta: r?.meta ?? {} };
        },
      };
      return stmt;
    },
  };
}

function makeCtx(opts: {
  id: string;
  body?: unknown;
  method: 'PUT' | 'GET';
  env: Record<string, unknown>;
  isAdmin?: boolean;
  user?: { email: string };
}): APIContext {
  const url = new URL(`http://localhost/api/edit/kp/${opts.id}`);
  const init: RequestInit = { method: opts.method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  return {
    request: new Request(url, init),
    url,
    params: { id: opts.id },
    props: {},
    locals: {
      runtime: { env: opts.env },
      isAdmin: opts.isAdmin ?? true,
      user: opts.user ?? { id: 'u1', email: 'admin@test.com', display_name: null, created_at: '', email_verified_at: null },
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

const VALID_KP = {
  id: 'k001',
  discipline: 'keiei',
  schools: ['scientific'],
  scholars: ['taylor'],
  year: '1911',
  title: { zh: '科学管理法', en: 'Scientific Management', ja: '科学的管理法' },
  body: { zh: '泰勒...', ja: 'テイラー...' },
  tags: [],
  format: 'flat-list',
  createdAt: '2026-04-24T02:21:59.847Z',
  updatedAt: '2026-04-24T02:21:59.847Z',
};

const baseEnv = {
  GITHUB_PAT: 'ghp_test',
  GITHUB_REPO: 'Suli-Hu/management-study',
  DB: mockDb(),
};

describe('PUT /api/edit/kp/:id', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('非 admin → 403', async () => {
    const res = await kpPUT(makeCtx({
      id: 'k001', method: 'PUT', body: { json: VALID_KP, base_sha: 'abc' },
      env: baseEnv, isAdmin: false,
    }));
    expect(res.status).toBe(403);
  });

  test('GITHUB_PAT 缺 → 503 config_missing', async () => {
    const res = await kpPUT(makeCtx({
      id: 'k001', method: 'PUT', body: { json: VALID_KP, base_sha: 'abc' },
      env: { ...baseEnv, GITHUB_PAT: undefined },
    }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'config_missing' });
  });

  test('body 不带 json 或 base_sha → 400', async () => {
    const res = await kpPUT(makeCtx({
      id: 'k001', method: 'PUT', body: { json: VALID_KP }, env: baseEnv,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'bad_request' });
  });

  test('schema 不过 → 422 schema_invalid', async () => {
    const bad = { ...VALID_KP, schools: [] }; // KP 至少 1 学派
    const res = await kpPUT(makeCtx({
      id: 'k001', method: 'PUT', body: { json: bad, base_sha: 'abc' }, env: baseEnv,
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  test('url id 与 body id 不一致 → 400 id_mismatch', async () => {
    const res = await kpPUT(makeCtx({
      id: 'k999', method: 'PUT', body: { json: VALID_KP, base_sha: 'abc' }, env: baseEnv,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'id_mismatch' });
  });

  test('happy path → 200 + commit_sha + commit message 带 admin email', async () => {
    let putBody: any = null;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url, init) => {
      putBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        commit: { sha: 'commit-abc' },
        content: { sha: 'blob-new' },
      }), { status: 200 });
    });
    const res = await kpPUT(makeCtx({
      id: 'k001', method: 'PUT', body: { json: VALID_KP, base_sha: 'old-blob' }, env: baseEnv,
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toMatchObject({ ok: true, commit_sha: 'commit-abc', new_blob_sha: 'blob-new', deploy_eta_seconds: 90 });
    expect(putBody.message).toContain('edit kp/k001 by admin@test.com');
    expect(putBody.sha).toBe('old-blob');
    expect(putBody.branch).toBe('main');
  });

  test('GitHub 409 / 422 → 409 sha_conflict + current_sha', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      // PUT 返 422 (典型的 sha 不匹配)
      .mockResolvedValueOnce(new Response('sha mismatch', { status: 422 }))
      // 后续 GET 拿当前 sha
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sha: 'current-blob',
        encoding: 'base64',
        content: btoa('{"id":"k001"}'),
      }), { status: 200 }));

    const res = await kpPUT(makeCtx({
      id: 'k001', method: 'PUT', body: { json: VALID_KP, base_sha: 'stale-blob' }, env: baseEnv,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'sha_conflict', current_sha: 'current-blob' });
  });

  test('updatedAt 服务端会强制刷为 now（前端伪造无效）', async () => {
    let putContentB64 = '';
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_, init) => {
      const body = JSON.parse(init.body);
      putContentB64 = body.content;
      return new Response(JSON.stringify({ commit: { sha: 'c' }, content: { sha: 'b' } }), { status: 200 });
    });
    const fakeFuture = '2099-12-31T00:00:00.000Z';
    await kpPUT(makeCtx({
      id: 'k001', method: 'PUT',
      body: { json: { ...VALID_KP, updatedAt: fakeFuture }, base_sha: 'x' },
      env: baseEnv,
    }));
    const decoded = JSON.parse(atob(putContentB64));
    expect(decoded.updatedAt).not.toBe(fakeFuture);
    expect(new Date(decoded.updatedAt).getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});

describe('GET /api/edit/kp/:id', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('非 admin → 403', async () => {
    const res = await kpGET(makeCtx({ id: 'k001', method: 'GET', env: baseEnv, isAdmin: false }));
    expect(res.status).toBe(403);
  });

  test('D1 找不到 → 404', async () => {
    const env = { ...baseEnv, DB: mockDb(() => ({ rows: [] })) };
    const res = await kpGET(makeCtx({ id: 'k001', method: 'GET', env }));
    expect(res.status).toBe(404);
  });

  test('正常返回 json + base_sha', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({
        sha: 'blob-1',
        encoding: 'base64',
        content: utf8Btoa(JSON.stringify(VALID_KP)),
      }), { status: 200 }),
    );
    const env = { ...baseEnv, DB: mockDb(() => ({ rows: [{ discipline: 'keiei' }] })) };
    const res = await kpGET(makeCtx({ id: 'k001', method: 'GET', env }));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toMatchObject({ ok: true, base_sha: 'blob-1' });
    expect(data.json.id).toBe('k001');
  });
});

describe('DELETE /api/edit/kp/:id', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('非 admin → 403', async () => {
    const res = await kpDELETE(makeCtx({
      id: 'k001', method: 'PUT', body: { base_sha: 'x' }, env: baseEnv, isAdmin: false,
    }));
    expect(res.status).toBe(403);
  });

  test('config 缺 → 503', async () => {
    const res = await kpDELETE(makeCtx({
      id: 'k001', method: 'PUT', body: { base_sha: 'x' },
      env: { ...baseEnv, GITHUB_PAT: undefined },
    }));
    expect(res.status).toBe(503);
  });

  test('base_sha 缺 → 400', async () => {
    const res = await kpDELETE(makeCtx({
      id: 'k001', method: 'PUT', body: {}, env: baseEnv,
    }));
    expect(res.status).toBe(400);
  });

  test('D1 找不到 → 404', async () => {
    const env = { ...baseEnv, DB: mockDb(() => ({ rows: [] })) };
    const res = await kpDELETE(makeCtx({
      id: 'k001', method: 'PUT', body: { base_sha: 'x' }, env,
    }));
    expect(res.status).toBe(404);
  });

  test('happy path → 200 + commit message 含 admin email + delete', async () => {
    let capturedMethod = '';
    let capturedBody: any = null;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url, init) => {
      capturedMethod = init.method;
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ commit: { sha: 'del-commit' } }), { status: 200 });
    });
    const env = { ...baseEnv, DB: mockDb(() => ({ rows: [{ discipline: 'keiei' }] })) };
    const res = await kpDELETE(makeCtx({
      id: 'k001', method: 'PUT', body: { base_sha: 'old-blob' }, env,
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, commit_sha: 'del-commit', deploy_eta_seconds: 90 });
    expect(capturedMethod).toBe('DELETE');
    expect(capturedBody.message).toContain('delete kp/k001 by admin@test.com');
    expect(capturedBody.sha).toBe('old-blob');
  });

  test('GitHub 409 → 409 sha_conflict + current_sha', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response('stale', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sha: 'cur-blob',
        encoding: 'base64',
        content: utf8Btoa('{}'),
      }), { status: 200 }));
    const env = { ...baseEnv, DB: mockDb(() => ({ rows: [{ discipline: 'keiei' }] })) };
    const res = await kpDELETE(makeCtx({
      id: 'k001', method: 'PUT', body: { base_sha: 'stale' }, env,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'sha_conflict', current_sha: 'cur-blob' });
  });
});
