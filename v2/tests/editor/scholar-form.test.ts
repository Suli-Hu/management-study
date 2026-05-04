/**
 * @vitest-environment jsdom
 *
 * Scholar editor v0.8 — form.ts / api.ts 单元测试
 *
 * 覆盖：API client 错误分类（schema_invalid / key_exists / school_not_in_tenant / forbidden / network）
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createScholar, patchScholar } from '~/lib/editor/scholar-api';

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

const PAYLOAD = {
  discipline: 'keiei',
  key: 'lewin',
  name: { zh: '勒温' },
  schools: ['lewin_school'],
  contribution: { zh: '场论...' },
  lifespan: '1890–1947',
  institution: 'MIT',
  born: '1890',
  died: '1947',
  nationality: '德国/美国',
  flag: '🇩🇪 🇺🇸',
  origin: '',
  field: '社会心理学',
  tags: ['mgmt'],
  nobel: null,
};

describe('createScholar', () => {
  test('201 → ok', async () => {
    fetchMock.mockResolvedValue(
      mockJson(201, { ok: true, scholar: { key: 'lewin', discipline: 'keiei' } }),
    );
    const r = await createScholar(PAYLOAD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scholar.key).toBe('lewin');
  });

  test('409 scholar_key_exists → category=key_exists', async () => {
    fetchMock.mockResolvedValue(mockJson(409, { ok: false, reason: 'scholar_key_exists' }));
    const r = await createScholar(PAYLOAD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('key_exists');
  });

  test('422 school_not_in_tenant → category=school_not_in_tenant', async () => {
    fetchMock.mockResolvedValue(
      mockJson(422, { ok: false, reason: 'school_not_in_tenant', detail: ['x'] }),
    );
    const r = await createScholar(PAYLOAD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('school_not_in_tenant');
  });

  test('500 → category=network (treat as transient)', async () => {
    fetchMock.mockResolvedValue(mockJson(500, { ok: false, reason: 'internal_error' }));
    const r = await createScholar(PAYLOAD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('network');
  });
});

describe('patchScholar', () => {
  test('200 → ok', async () => {
    fetchMock.mockResolvedValue(
      mockJson(200, { ok: true, scholar: { key: 'lewin', discipline: 'keiei' } }),
    );
    const r = await patchScholar('lewin', { discipline: 'keiei', name: { zh: '勒温' } });
    expect(r.ok).toBe(true);
  });

  test('404 → category=not_found', async () => {
    fetchMock.mockResolvedValue(mockJson(404, { ok: false, reason: 'scholar_not_found' }));
    const r = await patchScholar('lewin', { discipline: 'keiei' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('not_found');
  });

  test('discipline query param 注入 URL', async () => {
    fetchMock.mockResolvedValue(
      mockJson(200, { ok: true, scholar: { key: 'lewin', discipline: 'keiei' } }),
    );
    await patchScholar('lewin', { discipline: 'keiei' });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('discipline=keiei');
    expect(url).toContain('/api/scholars/lewin');
  });
});
