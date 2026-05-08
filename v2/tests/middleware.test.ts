/**
 * Astro middleware regression tests.
 * Focus: browser cookie requests keep CSRF Origin protection, while Bearer token API calls work for agents.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { APIContext, MiddlewareNext } from 'astro';
import { onRequest } from '../src/middleware';
import { sha256Hex } from '../src/lib/api-token';

interface MockDbOptions {
  tokenHash?: string;
  tokenScopes?: string[];
  tenantMemberships?: Array<{ discipline_key: string; role: 'owner' | 'editor' | 'viewer' }>;
}

function mockDb(opts: MockDbOptions = {}) {
  const tokenHash = opts.tokenHash;
  const tokenScopes = opts.tokenScopes ?? ['keiei'];
  const tenantMemberships = opts.tenantMemberships ?? [{ discipline_key: 'keiei', role: 'editor' as const }];

  return {
    prepare(sql: string) {
      const stmt = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          stmt.binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          if (sql.includes('FROM api_token WHERE token_hash = ?')) {
            return tokenHash && stmt.binds[0] === tokenHash
              ? {
                  id: 't_smoke',
                  user_id: 'u1',
                  name: 'test token',
                  token_hash: tokenHash,
                  scopes_json: JSON.stringify(tokenScopes),
                  created_at: '2026-01-01T00:00:00.000Z',
                  expires_at: null,
                  last_used_at: null,
                  revoked_at: null,
                } as T
              : null as T;
          }
          if (sql.includes('FROM user WHERE id = ?')) {
            return {
              id: 'u1',
              email: 'teacher@test.com',
              display_name: null,
              created_at: '2026-01-01T00:00:00.000Z',
              email_verified_at: '2026-01-01T00:00:00.000Z',
            } as T;
          }
          if (sql.includes('SELECT 1 FROM discipline WHERE key = ?')) {
            return stmt.binds[0] === 'keiei' ? ({ 1: 1 } as T) : null as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          if (sql.includes('FROM tenant_member tm') && sql.includes('INNER JOIN tenant t')) {
            return {
              results: tenantMemberships.map((m) => ({
                discipline_key: m.discipline_key,
                role: m.role,
              })) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

function makeContext(request: Request, env: Record<string, unknown> = {}): APIContext {
  return {
    request,
    url: new URL(request.url),
    params: {},
    props: {},
    locals: {
      runtime: {
        env: {
          APP_URL: 'https://study.sususu.org',
          ADMIN_EMAILS: 'owner@test.com',
          SESSION_SECRET: 'test-secret',
          ...env,
        },
      },
    },
  } as unknown as APIContext;
}

async function runMiddleware(ctx: APIContext): Promise<Response> {
  const res = await onRequest(ctx, (async () => new Response('next')) as MiddlewareNext);
  if (!res) throw new Error('middleware did not return a Response');
  return res;
}

describe('middleware CSRF and Bearer token behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('cookie-based state-changing requests without Origin stay blocked', async () => {
    const req = new Request('https://study.sususu.org/api/kps?discipline=keiei', {
      method: 'POST',
    });
    const res = await runMiddleware(makeContext(req));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Forbidden: bad Origin');
  });

  test('Bearer token state-changing API requests do not require Origin', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);

    const rawToken = 'ms_v1_0123456789abcdef0123456789abcdef';
    const tokenHash = await sha256Hex(rawToken);
    const req = new Request('https://study.sususu.org/api/kps?discipline=keiei', {
      method: 'POST',
      headers: { authorization: `Bearer ${rawToken}` },
    });

    const ctx = makeContext(req, { DB: mockDb({ tokenHash, tokenScopes: ['keiei'] }) });
    const res = await runMiddleware(ctx);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('next');
    expect(ctx.locals.user?.email).toBe('teacher@test.com');
    expect(ctx.locals.apiTokenScopes).toEqual(['keiei']);
    expect(ctx.locals.canEdit('keiei')).toBe(true);
    expect(ctx.locals.canEdit('marketing')).toBe(false);
  });

  test('wrong Origin is still rejected for cookie-based writes', async () => {
    const req = new Request('https://study.sususu.org/api/kps?discipline=keiei', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    const res = await runMiddleware(makeContext(req));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Forbidden: bad Origin');
  });
});
