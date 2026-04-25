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
      isSuperAdmin: opts.isAdmin ?? true,
      permissions: new Map(),
      canEdit: () => opts.isAdmin ?? true,
      canRead: () => opts.isAdmin ?? true,
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
    const data = await res.json() as any;
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
    const data = await res.json() as any;
    expect(data.json.key).toBe('lewin');
  });
});

// ============================================================
// has_dependents (v0.4.18/19) — 删除时 KP 关联检查
// ============================================================

/** mockDb 按 SQL 模式分发 — 给 has_dependents / themes enrich 测试用 */
function mockDbBySql(map: { discipline?: string; kpCountSchool?: number; kpCountScholar?: number; themesJson?: string }) {
  return mockDb((sql) => {
    if (sql.includes('SELECT discipline FROM')) return { rows: [{ discipline: map.discipline ?? 'keiei' }] };
    if (sql.includes('FROM kp_school WHERE school_key')) return { rows: [{ n: map.kpCountSchool ?? 0 }] };
    if (sql.includes('FROM kp_scholar WHERE scholar_key')) return { rows: [{ n: map.kpCountScholar ?? 0 }] };
    if (sql.includes('themes_json FROM discipline')) return { rows: [{ themes_json: map.themesJson ?? '[]' }] };
    return { rows: [] };
  });
}

describe('DELETE /api/edit/school/:key — has_dependents (v0.4.18)', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('学派下还有 KP 关联 → 409 has_dependents（不调 GitHub）', async () => {
    const env = { ...baseEnv, DB: mockDbBySql({ kpCountSchool: 5 }) };
    const res = await schDEL(makeCtx({
      paramKey: 'change', paramName: 'key', method: 'DELETE',
      body: { base_sha: 'x' }, env,
    }));
    expect(res.status).toBe(409);
    const data = await res.json() as any;
    expect(data).toMatchObject({ ok: false, reason: 'has_dependents' });
    expect(data.detail).toContain('5 个 KP');
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  test('KP 关联为 0 → 走 happy path（调 GitHub DELETE）', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ commit: { sha: 'd-empty' } }), { status: 200 }),
    );
    const env = { ...baseEnv, DB: mockDbBySql({ kpCountSchool: 0 }) };
    const res = await schDEL(makeCtx({
      paramKey: 'empty_school', paramName: 'key', method: 'DELETE',
      body: { base_sha: 'x' }, env,
    }));
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/edit/scholar/:key — has_dependents (v0.4.19)', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('学者名下还有 KP 关联 → 409 has_dependents（不调 GitHub）', async () => {
    const env = { ...baseEnv, DB: mockDbBySql({ kpCountScholar: 3 }) };
    const res = await scDEL(makeCtx({
      paramKey: 'lewin', paramName: 'key', method: 'DELETE',
      body: { base_sha: 'x' }, env,
    }));
    expect(res.status).toBe(409);
    const data = await res.json() as any;
    expect(data).toMatchObject({ ok: false, reason: 'has_dependents' });
    expect(data.detail).toContain('3 个 KP');
  });

  test('KP 关联为 0 → 走 happy path', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ commit: { sha: 'd-empty-sc' } }), { status: 200 }),
    );
    const env = { ...baseEnv, DB: mockDbBySql({ kpCountScholar: 0 }) };
    const res = await scDEL(makeCtx({
      paramKey: 'orphan_scholar', paramName: 'key', method: 'DELETE',
      body: { base_sha: 'x' }, env,
    }));
    expect(res.status).toBe(200);
  });

  test('非 admin → 403（先于 has_dependents check）', async () => {
    const env = { ...baseEnv, DB: mockDbBySql({ kpCountScholar: 99 }) };
    const res = await scDEL(makeCtx({
      paramKey: 'lewin', paramName: 'key', method: 'DELETE',
      body: { base_sha: 'x' }, env, isAdmin: false,
    }));
    expect(res.status).toBe(403);
  });
});

// ============================================================
// sha_conflict (v0.4.4) — 学派/学者 PUT/DELETE 乐观锁
// ============================================================

describe('PUT /api/edit/school/:key — sha_conflict', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('GitHub 409 → 409 sha_conflict + current_sha', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response('stale', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sha: 'current-school-sha', encoding: 'base64', content: utf8Btoa('{}'),
      }), { status: 200 }));
    const res = await schPUT(makeCtx({
      paramKey: 'change', paramName: 'key', method: 'PUT',
      body: { json: VALID_SCHOOL, base_sha: 'stale' }, env: baseEnv,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'sha_conflict', current_sha: 'current-school-sha' });
  });
});

describe('PUT /api/edit/scholar/:key — sha_conflict', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('GitHub 409 → 409 sha_conflict + current_sha', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response('stale', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sha: 'current-scholar-sha', encoding: 'base64', content: utf8Btoa('{}'),
      }), { status: 200 }));
    const res = await scPUT(makeCtx({
      paramKey: 'lewin', paramName: 'key', method: 'PUT',
      body: { json: VALID_SCHOLAR, base_sha: 'stale' }, env: baseEnv,
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'sha_conflict', current_sha: 'current-scholar-sha' });
  });
});

// ============================================================
// GET enrich (v0.4.18 school / v0.4.19 scholar) — themes / kp_count
// ============================================================

describe('GET /api/edit/school/:key — enrich themes + kp_count (v0.4.18)', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('返 themes 数组 + kp_count', async () => {
    const themes = [
      { key: 'individual', title: { zh: '个体的世界' }, accent: 'ob' },
      { key: 'change', title: { zh: '变革' }, accent: 'classic' },
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({
        sha: 'b1', encoding: 'base64', content: utf8Btoa(JSON.stringify(VALID_SCHOOL)),
      }), { status: 200 }),
    );
    const env = { ...baseEnv, DB: mockDbBySql({ kpCountSchool: 12, themesJson: JSON.stringify(themes) }) };
    const res = await schGET(makeCtx({ paramKey: 'change', paramName: 'key', method: 'GET', env }));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.kp_count).toBe(12);
    expect(data.themes).toHaveLength(2);
    expect(data.themes[0].key).toBe('individual');
  });
});

describe('GET /api/edit/scholar/:key — enrich kp_count (v0.4.19)', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('返 kp_count', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({
        sha: 'b2', encoding: 'base64', content: utf8Btoa(JSON.stringify(VALID_SCHOLAR)),
      }), { status: 200 }),
    );
    const env = { ...baseEnv, DB: mockDbBySql({ kpCountScholar: 7 }) };
    const res = await scGET(makeCtx({ paramKey: 'lewin', paramName: 'key', method: 'GET', env }));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.kp_count).toBe(7);
  });
});
