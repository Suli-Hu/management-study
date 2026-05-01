/**
 * /api/me
 *   Token/session self-check for external agents before writing KP.
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as meGET } from '../src/pages/api/me';

function mockDb() {
  return {
    prepare() {
      const stmt = {
        bind() {
          return stmt;
        },
        async all<T = unknown>() {
          return {
            results: [
              { key: 'keiei', title_zh: '经营学', title_en: 'Management', tenant_id: 'keiei' },
              { key: 'marketing', title_zh: '市场营销学', title_en: 'Marketing', tenant_id: 'marketing' },
            ] as T[],
          };
        },
      };
      return stmt;
    },
  };
}

function makeCtx(opts: {
  user?: APIContext['locals']['user'];
  isSuperAdmin?: boolean;
  permissions?: Map<string, 'admin' | 'guest'>;
  tokenScopes?: string[] | null;
}): APIContext {
  const url = new URL('http://localhost/api/me');
  const permissions = opts.permissions ?? new Map<string, 'admin' | 'guest'>([['keiei', 'admin']]);
  const tokenScopes = opts.tokenScopes ?? null;
  const tokenAllows = (d: string) => !tokenScopes || tokenScopes.length === 0 || tokenScopes.includes(d);

  return {
    request: new Request(url),
    url,
    params: {},
    props: {},
    locals: {
      runtime: { env: { DB: mockDb() } },
      user: opts.user === undefined
        ? { id: 'u1', email: 'editor@test.com', display_name: null, created_at: '', email_verified_at: null }
        : opts.user,
      isSuperAdmin: opts.isSuperAdmin ?? false,
      isAdmin: opts.isSuperAdmin ?? false,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: tokenScopes,
      permissions,
      canRead: (d: string | undefined) => !!d && tokenAllows(d) && ((opts.isSuperAdmin ?? false) || permissions.has(d)),
      canEdit: (d: string | undefined) => !!d && tokenAllows(d) && ((opts.isSuperAdmin ?? false) || permissions.get(d) === 'admin'),
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

describe('GET /api/me', () => {
  test('未登录 → 401', async () => {
    const res = await meGET(makeCtx({ user: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_authenticated' });
  });

  test('普通 editor 只看到自己有权限的学科', async () => {
    const res = await meGET(makeCtx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      auth: { is_super_admin: false, token_scopes: null },
      disciplines: [
        { key: 'keiei', tenant_id: 'keiei', role: 'editor', can_read: true, can_edit: true },
      ],
    });
  });

  test('super-admin token scope 会收窄可见学科', async () => {
    const res = await meGET(makeCtx({
      isSuperAdmin: true,
      tokenScopes: ['marketing'],
      permissions: new Map(),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      auth: { is_super_admin: true, token_scopes: ['marketing'] },
      disciplines: [
        { key: 'marketing', role: 'super-admin', can_read: true, can_edit: true },
      ],
    });
  });
});
