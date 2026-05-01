/**
 * /api/metadata
 *   Unified tenant-scoped metadata for agents and admin UI.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as metadataGET } from '../src/pages/api/metadata';

function mockDb(opts: { memberRole?: 'owner' | 'editor' | 'viewer' | null } = {}) {
  const memberRole = opts.memberRole === undefined ? 'viewer' : opts.memberRole;
  return {
    prepare(sql: string) {
      const stmt = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          stmt.binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          if (sql.includes('FROM tenant WHERE')) return { id: 'keiei', discipline_key: 'keiei' } as T;
          if (sql.includes('FROM tenant_member')) return (memberRole ? { role: memberRole } : null) as T;
          if (sql.includes('FROM discipline')) {
            return {
              key: 'keiei',
              title_zh: '经营学',
              title_en: 'Management',
              title_ja: null,
              tagline_zh: '管理学知识库',
              tagline_ja: null,
              tags_json: JSON.stringify([{ key: 'classic', label: { zh: '经典' }, color: '#007AFF' }]),
              themes_json: JSON.stringify([{ key: 'organization', title: { zh: '组织' }, schools: ['motivation'] }]),
            } as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          if (sql.includes('FROM school s')) {
            return { results: [{
              key: 'motivation',
              title_zh: '动机理论',
              title_en: 'Motivation Theory',
              theme_key: 'organization',
              tags_json: JSON.stringify(['classic']),
              kp_count: 12,
            }] as T[] };
          }
          if (sql.includes('FROM scholar sc')) {
            return { results: [{
              key: 'maslow',
              name_zh: '马斯洛',
              name_en: 'Abraham Maslow',
              tags_json: JSON.stringify(['classic']),
              kp_count: 3,
            }] as T[] };
          }
          if (sql.includes('FROM view')) {
            return { results: [{
              id: 'default',
              name: '默认视图',
              icon: '📚',
              is_default: 1,
              position: 0,
              groups_json: JSON.stringify([{ id: 'main', title: '主要理论', schoolIds: ['motivation'] }]),
            }] as T[] };
          }
          return { results: [] as T[] };
        },
      };
      return stmt;
    },
  };
}

function makeCtx(opts: {
  user?: APIContext['locals']['user'];
  memberRole?: 'owner' | 'editor' | 'viewer' | null;
  canRead?: boolean;
}): APIContext {
  const url = new URL('http://localhost/api/metadata?discipline=keiei');
  return {
    request: new Request(url),
    url,
    params: {},
    props: {},
    locals: {
      runtime: { env: { DB: mockDb({ memberRole: opts.memberRole }) } },
      user: opts.user === undefined
        ? { id: 'u1', email: 'viewer@test.com', display_name: null, created_at: '', email_verified_at: null }
        : opts.user,
      isSuperAdmin: false,
      isAdmin: false,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canRead: () => opts.canRead ?? true,
      canEdit: () => false,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('GET /api/metadata', () => {
  test('未登录 → 401', async () => {
    const res = await metadataGET(makeCtx({ user: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_authenticated' });
  });

  test('无 tenant 读权限 → 403', async () => {
    const res = await metadataGET(makeCtx({ memberRole: null, canRead: false }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_viewer' });
  });

  test('viewer 可以读取统一元数据', async () => {
    const res = await metadataGET(makeCtx({ memberRole: 'viewer' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      tenant: { tenantId: 'keiei', discipline: 'keiei', role: 'viewer' },
      discipline: { key: 'keiei', title: { zh: '经营学', en: 'Management' } },
      tags: [{ key: 'classic' }],
      themes: [{ key: 'organization' }],
      schools: [{ key: 'motivation', themeKey: 'organization' }],
      scholars: [{ key: 'maslow' }],
      views: [{ id: 'default', isDefault: true }],
      formats: ['narrative', 'flat-list', 'accordion', 'compare', 'quad'],
    });
  });
});
