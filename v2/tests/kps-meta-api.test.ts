/**
 * /api/kps/meta
 *   Reference options for agents before creating KP records.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as metaGET } from '../src/pages/api/kps/meta';

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
          if (sql.includes('SELECT tags_json FROM discipline')) {
            return { tags_json: JSON.stringify([{ key: 'classic', label: { zh: '经典' }, color: '#007AFF' }]) } as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          if (sql.includes('FROM school s')) {
            return {
              results: [{
                key: 'motivation',
                title_zh: '动机理论',
                title_en: 'Motivation Theory',
                tags_json: JSON.stringify(['classic']),
                kp_count: 12,
              }] as T[],
            };
          }
          if (sql.includes('FROM scholar sc')) {
            return {
              results: [{
                key: 'maslow',
                name_zh: '马斯洛',
                name_en: 'Abraham Maslow',
                tags_json: JSON.stringify(['classic']),
                kp_count: 3,
              }] as T[],
            };
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
  canEdit?: boolean;
}): APIContext {
  const url = new URL('http://localhost/api/kps/meta?discipline=keiei');
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
      canEdit: () => opts.canEdit ?? false,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('GET /api/kps/meta', () => {
  test('未登录 → 401', async () => {
    const res = await metaGET(makeCtx({ user: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_authenticated' });
  });

  test('无 tenant 读权限 → 403', async () => {
    const res = await metaGET(makeCtx({ memberRole: null, canRead: false }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_viewer' });
  });

  test('viewer 可以读取写入前选项', async () => {
    const res = await metaGET(makeCtx({ memberRole: 'viewer' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      tenant: { tenantId: 'keiei', discipline: 'keiei', role: 'viewer' },
      formats: ['narrative', 'flat-list', 'accordion', 'compare', 'quad'],
      tags: [{ key: 'classic' }],
      schools: [{ key: 'motivation', title: { zh: '动机理论', en: 'Motivation Theory' }, tags: ['classic'], kp_count: 12 }],
      scholars: [{ key: 'maslow', name: { zh: '马斯洛', en: 'Abraham Maslow' }, tags: ['classic'], kp_count: 3 }],
    });
  });
});
