/**
 * @vitest-environment jsdom
 *
 * Theme editor v0.8 — form.ts / api.ts 单元测试
 *
 * 覆盖：API client 错误分类（schema_invalid / key_exists / sha_conflict / network）
 *       URL 编码（PUT path 含 discipline + key）
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createTheme, patchTheme } from '~/lib/editor/theme-api';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createTheme', () => {
  test('201 → ok + URL = /api/new/theme', async () => {
    fetchMock.mockResolvedValue(mockJson(201, { ok: true, commit_sha: 'abc' }));
    const r = await createTheme({
      discipline: 'keiei',
      json: { key: 'org_change', title: { zh: '组织变革' }, tags: [] },
    });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/new/theme');
  });

  test('409 key_exists → category=key_exists', async () => {
    fetchMock.mockResolvedValue(mockJson(409, { ok: false, reason: 'key_exists' }));
    const r = await createTheme({
      discipline: 'keiei',
      json: { key: 'org_change', title: { zh: '组织变革' }, tags: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('key_exists');
  });

  test('422 schema_invalid → category=schema_invalid', async () => {
    fetchMock.mockResolvedValue(
      mockJson(422, {
        ok: false,
        reason: 'schema_invalid',
        detail: [{ path: ['title', 'zh'], message: 'required' }],
      }),
    );
    const r = await createTheme({
      discipline: 'keiei',
      json: { key: 'x', title: { zh: '' }, tags: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.category).toBe('schema_invalid');
      expect(r.fieldPath).toEqual(['title', 'zh']);
    }
  });
});

describe('patchTheme', () => {
  test('200 → ok + URL = /api/edit/theme/keiei/org_change', async () => {
    fetchMock.mockResolvedValue(mockJson(200, { ok: true, commit_sha: 'abc' }));
    const r = await patchTheme({
      discipline: 'keiei',
      key: 'org_change',
      title: { zh: 'X' },
    });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/edit/theme/keiei/org_change');
  });

  test('409 sha_conflict → category=sha_conflict', async () => {
    fetchMock.mockResolvedValue(mockJson(409, { ok: false, reason: 'sha_conflict' }));
    const r = await patchTheme({ discipline: 'keiei', key: 'x', title: { zh: 'X' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('sha_conflict');
  });
});
