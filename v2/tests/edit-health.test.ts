/**
 * /api/edit/health integration tests (v0.4.1)
 *   admin 自检 endpoint：验证 GITHUB_PAT 配置 + GitHub API 可达 + Contents 权限。
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { GET as healthGET } from '../src/pages/api/edit/health';
import type { APIContext } from 'astro';

function makeCtx(env: Record<string, unknown>, isAdmin = true): APIContext {
  const url = new URL('http://localhost/api/edit/health');
  return {
    request: new Request(url, { method: 'GET' }),
    url,
    params: {},
    props: {},
    locals: { runtime: { env }, isAdmin } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('GET /api/edit/health', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('非 admin → 403 + reason=not_admin', async () => {
    const res = await healthGET(makeCtx({}, false));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_admin' });
  });

  test('PAT 缺失 → 503 + reason=pat_missing', async () => {
    const res = await healthGET(makeCtx({ GITHUB_REPO: 'x/y' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'pat_missing' });
  });

  test('REPO 缺失 → 503 + reason=repo_missing', async () => {
    const res = await healthGET(makeCtx({ GITHUB_PAT: 'ghp_xxx' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'repo_missing' });
  });

  test('GitHub 401 → 502 + reason=pat_invalid', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    );
    const res = await healthGET(makeCtx({ GITHUB_PAT: 'bad', GITHUB_REPO: 'x/y' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'pat_invalid' });
  });

  test('GitHub 404 → 502 + reason=repo_unreachable', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    const res = await healthGET(makeCtx({ GITHUB_PAT: 'good', GITHUB_REPO: 'no/such-repo' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'repo_unreachable' });
  });

  test('contents HEAD 403 → 502 + reason=contents_unreadable', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'mgmt' }), {
          status: 200,
          headers: { 'x-ratelimit-remaining': '4999' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const res = await healthGET(makeCtx({ GITHUB_PAT: 'good', GITHUB_REPO: 'x/y' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'contents_unreadable' });
  });

  test('全绿 → 200 + ok=true + rate_limit_remaining', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'mgmt' }), {
          status: 200,
          headers: { 'x-ratelimit-remaining': '4321' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const res = await healthGET(makeCtx({ GITHUB_PAT: 'good', GITHUB_REPO: 'x/y' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, repo: 'x/y', rate_limit_remaining: 4321 });
  });
});
