/**
 * /api/new/{kp,school,scholar} (v0.4.4 part 2)
 *   覆盖 handlePost helper：admin gate / config / 422 schema / 409 key 冲突 / 201 created
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { POST as kpPOST } from '../src/pages/api/new/kp';
import { POST as schPOST } from '../src/pages/api/new/school';
import { POST as scPOST } from '../src/pages/api/new/scholar';
import type { APIContext } from 'astro';

function utf8Btoa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function makeCtx(opts: { body?: unknown; env: Record<string, unknown>; isAdmin?: boolean }): APIContext {
  const url = new URL('http://localhost/api/new/x');
  const init: RequestInit = { method: 'POST' };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  return {
    request: new Request(url, init),
    url,
    params: {},
    props: {},
    locals: {
      runtime: { env: opts.env },
      isAdmin: opts.isAdmin ?? true,
      user: { id: 'u1', email: 'admin@test.com', display_name: null, created_at: '', email_verified_at: null },
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

const baseEnv = { GITHUB_PAT: 'ghp_x', GITHUB_REPO: 'Suli-Hu/management-study' };

const NEW_KP = {
  id: 'k999',
  discipline: 'keiei',
  schools: ['change'],
  scholars: [],
  year: '2026',
  title: { zh: '测试 KP' }, // en/ja optional，省略
  body: { zh: 'test' },
  tags: [],
  format: 'narrative',
  createdAt: '2026-04-25T00:00:00.000Z', // 服务端会强制刷新
  updatedAt: '2026-04-25T00:00:00.000Z',
};

const NEW_SCHOOL = {
  key: 'new_school',
  discipline: 'keiei',
  title: { zh: '新学派' },
  era: '',
  summary: { zh: 'sum' },
  themeKey: 'change',
  accent: 'classic',
  concepts: [],
  createdAt: '2026-04-25T00:00:00.000Z',
  updatedAt: '2026-04-25T00:00:00.000Z',
};

const NEW_SCHOLAR = {
  key: 'new_scholar',
  discipline: 'keiei',
  name: { zh: '新学者' },
  schools: [],
  contribution: { zh: 'contr' },
  lifespan: '', institution: '', born: '', died: '',
  nationality: '', flag: '', origin: '', field: '', accent: '',
  nobel: null,
  createdAt: '2026-04-25T00:00:00.000Z',
  updatedAt: '2026-04-25T00:00:00.000Z',
};

describe('POST /api/new/kp', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('非 admin → 403', async () => {
    const res = await kpPOST(makeCtx({ body: { json: NEW_KP }, env: baseEnv, isAdmin: false }));
    expect(res.status).toBe(403);
  });

  test('config 缺 → 503', async () => {
    const res = await kpPOST(makeCtx({ body: { json: NEW_KP }, env: { ...baseEnv, GITHUB_PAT: undefined } }));
    expect(res.status).toBe(503);
  });

  test('schema 错 → 422', async () => {
    const bad = { ...NEW_KP, schools: [] };
    const res = await kpPOST(makeCtx({ body: { json: bad }, env: baseEnv }));
    expect(res.status).toBe(422);
  });

  test('文件已存在 → 409 sha_conflict', async () => {
    // 第一个 GET 返 200 = 已存在
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ sha: 'existing', encoding: 'base64', content: utf8Btoa('{}') }), { status: 200 }),
    );
    const res = await kpPOST(makeCtx({ body: { json: NEW_KP }, env: baseEnv }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'sha_conflict' });
  });

  test('happy path → 201 + commit msg create kp/k999 by admin email', async () => {
    let capturedMsg = '';
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      // 第一个 GET 返 404 = 不存在
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      // PUT 返 200 创建成功
      .mockImplementationOnce(async (_url, init) => {
        capturedMsg = JSON.parse(init.body).message;
        return new Response(JSON.stringify({ commit: { sha: 'c-new' }, content: { sha: 'b-new' } }), { status: 200 });
      });
    const res = await kpPOST(makeCtx({ body: { json: NEW_KP }, env: baseEnv }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, commit_sha: 'c-new', new_blob_sha: 'b-new', deploy_eta_seconds: 90 });
    expect(capturedMsg).toContain('create kp/k999 by admin@test.com');
  });
});

describe('POST /api/new/school', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('happy path → 201 + commit msg create school/...', async () => {
    let capturedMsg = '';
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockImplementationOnce(async (_url, init) => {
        capturedMsg = JSON.parse(init.body).message;
        return new Response(JSON.stringify({ commit: { sha: 'c' }, content: { sha: 'b' } }), { status: 200 });
      });
    const res = await schPOST(makeCtx({ body: { json: NEW_SCHOOL }, env: baseEnv }));
    expect(res.status).toBe(201);
    expect(capturedMsg).toContain('create school/new_school by admin@test.com');
  });
});

describe('POST /api/new/scholar', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('happy path → 201 + commit msg create scholar/...', async () => {
    let capturedMsg = '';
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockImplementationOnce(async (_url, init) => {
        capturedMsg = JSON.parse(init.body).message;
        return new Response(JSON.stringify({ commit: { sha: 'c' }, content: { sha: 'b' } }), { status: 200 });
      });
    const res = await scPOST(makeCtx({ body: { json: NEW_SCHOLAR }, env: baseEnv }));
    expect(res.status).toBe(201);
    expect(capturedMsg).toContain('create scholar/new_scholar by admin@test.com');
  });
});
