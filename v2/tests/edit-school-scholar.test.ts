/**
 * /api/edit/school/:key 和 /api/edit/scholar/:key (v0.4.4 part 1)
 *   覆盖共享 helper（lib/edit-helpers.ts）和两套路由的 zod schema。
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { GET as schGET, PUT as schPUT, DELETE as schDEL } from '../src/pages/api/edit/school/[key]';
import { GET as scGET, PUT as scPUT, DELETE as scDEL } from '../src/pages/api/edit/scholar/[key]';
import type { APIContext } from 'astro';

function utf8Btoa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function mockDb(handler: (sql: string, binds: unknown[]) => { rows?: unknown[] } | undefined = () => ({ rows: [] })) {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) { binds = args; return stmt; },
        async first<T = unknown>() {
          const r = handler(sql, binds);
          return ((r?.rows?.[0] ?? null) as T | null);
        },
        async all<T = unknown>() {
          const r = handler(sql, binds);
          return { results: (r?.rows ?? []) as T[] };
        },
        async run() { return { success: true, meta: {} }; },
      };
      return stmt;
    },
  };
}

function makeCtx(opts: {
  paramKey: string;
  paramName: 'key';
  body?: unknown;
  method: 'GET' | 'PUT' | 'DELETE';
  env: Record<string, unknown>;
  isAdmin?: boolean;
}): APIContext {
  const url = new URL(`http://localhost/api/edit/x/${opts.paramKey}`);
  const init: RequestInit = { method: opts.method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  return {
    request: new Request(url, init),
    url,
    params: { [opts.paramName]: opts.paramKey },
    props: {},
    locals: {
      runtime: { env: opts.env },
      isAdmin: opts.isAdmin ?? true,
      user: { id: 'u1', email: 'admin@test.com', display_name: null, created_at: '', email_verified_at: null },
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

const VALID_SCHOOL = {
  key: 'change',
  discipline: 'keiei',
  title: { zh: '变革管理', en: 'Change Management', ja: '変革マネジメント' },
  era: '1947–',
  summary: { zh: '...', ja: '...' },
  themeKey: 'change',
  accent: 'classic',
  concepts: [],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
};

const VALID_SCHOLAR = {
  key: 'lewin',
  discipline: 'keiei',
  name: { zh: '勒温', en: 'Lewin', ja: 'レヴィン' },
  schools: ['change'],
  contribution: { zh: '...', ja: '...' },
  lifespan: '1890–1947',
  institution: 'MIT',
  born: '', died: '', nationality: '', flag: '', origin: '', field: '', accent: '',
  nobel: null,
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
};

const baseEnv = {
  GITHUB_PAT: 'ghp_test',
  GITHUB_REPO: 'Suli-Hu/management-study',
  DB: mockDb(() => ({ rows: [{ discipline: 'keiei' }] })),
};

describe('PUT /api/edit/school/:key', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('非 admin → 403', async () => {
    const res = await schPUT(makeCtx({
      paramKey: 'change', paramName: 'key', method: 'PUT',
      body: { json: VALID_SCHOOL, base_sha: 'x' }, env: baseEnv, isAdmin: false,
    }));
    expect(res.status).toBe(403);
  });

  test('happy path → 200 + commit_sha + commit msg 含 admin email', async () => {
    let capturedBody: any = null;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ commit: { sha: 'c1' }, content: { sha: 'b1' } }), { status: 200 });
    });
    const res = await schPUT(makeCtx({
      paramKey: 'change', paramName: 'key', method: 'PUT',
      body: { json: VALID_SCHOOL, base_sha: 'old' }, env: baseEnv,
    }));
    expect(res.status).toBe(200);
    expect(capturedBody.message).toContain('edit school/change by admin@test.com');
  });

  test('schema invalid → 422', async () => {
    const bad = { ...VALID_SCHOOL, accent: 'badcolor' };
    const res = await schPUT(makeCtx({
      paramKey: 'change', paramName: 'key', method: 'PUT',
      body: { json: bad, base_sha: 'x' }, env: baseEnv,
    }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'schema_invalid' });
  });

  test('url key 与 body key 不一致 → 400 key_mismatch', async () => {
    const res = await schPUT(makeCtx({
      paramKey: 'wrong', paramName: 'key', method: 'PUT',
      body: { json: VALID_SCHOOL, base_sha: 'x' }, env: baseEnv,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'key_mismatch' });
  });
});

describe('DELETE /api/edit/school/:key', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('happy path → 200', async () => {
    let capturedBody: any = null;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ commit: { sha: 'd1' } }), { status: 200 });
    });
    const res = await schDEL(makeCtx({
      paramKey: 'change', paramName: 'key', method: 'DELETE',
      body: { base_sha: 'x' }, env: baseEnv,
    }));
    expect(res.status).toBe(200);
    expect(capturedBody.message).toContain('delete school/change');
  });
});

describe('GET /api/edit/school/:key', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('正常返 json + base_sha', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({
        sha: 'b1', encoding: 'base64', content: utf8Btoa(JSON.stringify(VALID_SCHOOL)),
      }), { status: 200 }),
    );
    const res = await schGET(makeCtx({ paramKey: 'change', paramName: 'key', method: 'GET', env: baseEnv }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, base_sha: 'b1' });
    expect(data.json.key).toBe('change');
  });
});

describe('PUT /api/edit/scholar/:key', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('happy path → 200 + commit msg 含 admin email', async () => {
    let capturedBody: any = null;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ commit: { sha: 'c2' }, content: { sha: 'b2' } }), { status: 200 });
    });
    const res = await scPUT(makeCtx({
      paramKey: 'lewin', paramName: 'key', method: 'PUT',
      body: { json: VALID_SCHOLAR, base_sha: 'old' }, env: baseEnv,
    }));
    expect(res.status).toBe(200);
    expect(capturedBody.message).toContain('edit scholar/lewin by admin@test.com');
  });

  test('nobel: null 通过', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ commit: { sha: 'c' }, content: { sha: 'b' } }), { status: 200 }),
    );
    const res = await scPUT(makeCtx({
      paramKey: 'lewin', paramName: 'key', method: 'PUT',
      body: { json: { ...VALID_SCHOLAR, nobel: null }, base_sha: 'x' }, env: baseEnv,
    }));
    expect(res.status).toBe(200);
  });

  test('nobel: 带 year/detail 通过', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ commit: { sha: 'c' }, content: { sha: 'b' } }), { status: 200 }),
    );
    const res = await scPUT(makeCtx({
      paramKey: 'lewin', paramName: 'key', method: 'PUT',
      body: { json: { ...VALID_SCHOLAR, nobel: { year: '2002', detail: '...' } }, base_sha: 'x' },
      env: baseEnv,
    }));
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/edit/scholar/:key', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('happy path', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ commit: { sha: 'd2' } }), { status: 200 }),
    );
    const res = await scDEL(makeCtx({
      paramKey: 'lewin', paramName: 'key', method: 'DELETE',
      body: { base_sha: 'x' }, env: baseEnv,
    }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/edit/scholar/:key', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('正常返 json + base_sha', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({
        sha: 'b2', encoding: 'base64', content: utf8Btoa(JSON.stringify(VALID_SCHOLAR)),
      }), { status: 200 }),
    );
    const res = await scGET(makeCtx({ paramKey: 'lewin', paramName: 'key', method: 'GET', env: baseEnv }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.json.key).toBe('lewin');
  });
});
