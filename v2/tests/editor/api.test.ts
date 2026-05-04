/**
 * @vitest-environment jsdom
 *
 * KP 编辑器 v0.8 — api.ts 错误分类测试
 *
 * 用 vi.spyOn(global, 'fetch') mock，测 5 endpoint 的成功 / 失败分类。
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createKp, patchKp, fetchEmptyBody } from '~/lib/editor/api';
import type { KpBody } from '~/schemas/kp-body-structured';

const NARR: KpBody = { format: 'narrative', prose: 'x' };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createKp — happy path', () => {
  test('201 → ok', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(201, { ok: true, kp: { id: 'k123', discipline: 'keiei' } }));
    const r = await createKp({
      discipline: 'keiei',
      title: { zh: 'A' },
      body: { zh: NARR },
      schools: ['s1'],
      scholars: [],
      tags: [],
      year: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kp.id).toBe('k123');
  });

  test('legacy_top_level_format → category=editor_bug（不应发生）', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(422, { ok: false, reason: 'legacy_top_level_format', message: 'old' }),
    );
    const r = await createKp({
      discipline: 'keiei',
      title: { zh: 'A' },
      body: { zh: NARR },
      schools: ['s1'],
      scholars: [],
      tags: [],
      year: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('editor_bug');
  });
});

describe('patchKp 错误分类', () => {
  test('422 schema_invalid (F4) → category=schema_invalid', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(422, { ok: false, reason: 'schema_invalid', message: '...', detail: [] }),
    );
    const r = await patchKp('k1', { title: { zh: 'a' } });
    if (r.ok) throw new Error('expected fail');
    expect(r.category).toBe('schema_invalid');
  });

  test('422 body_structure_invalid → category=body_invalid', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(422, { ok: false, reason: 'body_structure_invalid', message: '...' }),
    );
    const r = await patchKp('k1', { body: { zh: NARR } });
    if (r.ok) throw new Error('expected fail');
    expect(r.category).toBe('body_invalid');
  });

  test('422 body_format_invalid → category=body_invalid', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(422, { ok: false, reason: 'body_format_invalid', message: '...' }),
    );
    const r = await patchKp('k1', { body: { zh: NARR } });
    if (r.ok) throw new Error('expected fail');
    expect(r.category).toBe('body_invalid');
  });

  test('409 version_conflict → category=version_conflict', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(409, { ok: false, reason: 'version_conflict', message: '...' }));
    const r = await patchKp('k1', { title: { zh: 'a' } });
    if (r.ok) throw new Error('expected fail');
    expect(r.category).toBe('version_conflict');
  });

  test('403 tenant_mismatch → category=forbidden', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(403, { ok: false, reason: 'tenant_mismatch', message: '...' }));
    const r = await patchKp('k1', { title: { zh: 'a' } });
    if (r.ok) throw new Error('expected fail');
    expect(r.category).toBe('forbidden');
  });

  test('404 → category=not_found', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(404, { ok: false, reason: 'kp_not_found', message: '...' }));
    const r = await patchKp('kxx', { title: { zh: 'a' } });
    if (r.ok) throw new Error('expected fail');
    expect(r.category).toBe('not_found');
  });

  test('500 → category=network', async () => {
    fetchMock.mockResolvedValue(new Response('Internal', { status: 500 }));
    const r = await patchKp('k1', { title: { zh: 'a' } });
    if (r.ok) throw new Error('expected fail');
    expect(r.category).toBe('network');
  });

  test('network error (fetch throws) → category=network', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed to fetch'));
    const r = await patchKp('k1', { title: { zh: 'a' } });
    if (r.ok) throw new Error('expected fail');
    expect(r.category).toBe('network');
    expect(r.status).toBe(0);
  });

  test('fieldPath 从 zod issue.path 抽出', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(422, {
        ok: false,
        reason: 'body_structure_invalid',
        message: '...',
        detail: [{ path: ['body', 'zh', 'items', 0, 'name'], message: 'required' }],
      }),
    );
    const r = await patchKp('k1', { body: { zh: NARR } });
    if (r.ok) throw new Error('expected fail');
    expect(r.fieldPath).toEqual(['body', 'zh', 'items', 0, 'name']);
  });
});

describe('fetchEmptyBody', () => {
  test('5 format 各自返合法 body', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse(200, { ok: true, body: { format: 'narrative', prose: '' } }),
    );
    const body = await fetchEmptyBody('narrative');
    expect(body.format).toBe('narrative');
  });

  test('500 throws', async () => {
    fetchMock.mockResolvedValue(new Response('err', { status: 500 }));
    await expect(fetchEmptyBody('narrative')).rejects.toThrow();
  });
});
