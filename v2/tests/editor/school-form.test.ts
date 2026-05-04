/**
 * @vitest-environment jsdom
 *
 * School editor v0.8 — form.ts 单元测试
 *
 * 覆盖：API client 错误分类（schema_invalid / key_exists / theme_not_found / forbidden / network）
 * 注：DOM 渲染 happy path 由 E2E 覆盖；这里仅测 api 错误分类（form save 行为依赖它）
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createSchool, patchSchool } from '~/lib/editor/school-api';

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
  key: 'lewin_school',
  title: { zh: 'X' },
  era: '',
  summary: { zh: '概述' },
  themeKey: 'org_change',
  tags: [],
};

describe('createSchool', () => {
  test('201 → ok', async () => {
    fetchMock.mockResolvedValue(
      mockJson(201, { ok: true, school: { key: 'lewin_school', discipline: 'keiei' } }),
    );
    const r = await createSchool(PAYLOAD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.school.key).toBe('lewin_school');
  });

  test('409 school_key_exists → category=key_exists', async () => {
    fetchMock.mockResolvedValue(mockJson(409, { ok: false, reason: 'school_key_exists' }));
    const r = await createSchool(PAYLOAD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('key_exists');
  });

  test('422 theme_not_in_tenant → category=theme_not_found', async () => {
    fetchMock.mockResolvedValue(mockJson(422, { ok: false, reason: 'theme_not_in_tenant' }));
    const r = await createSchool(PAYLOAD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('theme_not_found');
  });

  test('422 schema_invalid → category=schema_invalid + 抽 fieldPath', async () => {
    fetchMock.mockResolvedValue(
      mockJson(422, {
        ok: false,
        reason: 'schema_invalid',
        detail: [{ path: ['title', 'zh'], message: 'required' }],
      }),
    );
    const r = await createSchool(PAYLOAD);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.category).toBe('schema_invalid');
      expect(r.fieldPath).toEqual(['title', 'zh']);
    }
  });

  test('network error → category=network', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const r = await createSchool(PAYLOAD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('network');
  });
});

describe('patchSchool', () => {
  test('200 → ok', async () => {
    fetchMock.mockResolvedValue(
      mockJson(200, { ok: true, school: { key: 'lewin_school', discipline: 'keiei' } }),
    );
    const r = await patchSchool('lewin_school', {
      discipline: 'keiei',
      title: { zh: 'X2' },
    });
    expect(r.ok).toBe(true);
  });

  test('403 forbidden → category=forbidden', async () => {
    fetchMock.mockResolvedValue(mockJson(403, { ok: false, reason: 'not_editor' }));
    const r = await patchSchool('lewin_school', { discipline: 'keiei', title: { zh: 'X' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe('forbidden');
  });
});
