/**
 * tags ref counting should be JSON-accurate (no substring LIKE false-positives)
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { GET as tagsGET } from '../src/pages/api/edit/discipline/[discipline]/tags/index';

function makeCtx(db: unknown): APIContext {
  const url = new URL('http://localhost/api/edit/discipline/keiei/tags');
  return {
    request: new Request(url, { method: 'GET' }),
    url,
    params: { discipline: 'keiei' },
    props: {},
    locals: {
      runtime: { env: { DB: db } },
      user: { id: 'u1', email: 'editor@test.com', display_name: null, created_at: '', email_verified_at: null },
      isSuperAdmin: false,
      isAdmin: false,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canRead: () => true,
      canEdit: () => true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

function makeDbStub() {
  return {
    prepare(sql: string) {
      const stmt = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          stmt.binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          if (sql.includes('SELECT tags_json FROM discipline')) {
            // Library contains two keys where one is a prefix of the other
            return {
              tags_json: JSON.stringify([
                { key: 't_abc', label: { zh: 'ABC' }, color: '#007AFF' },
                { key: 't_abc1', label: { zh: 'ABC1' }, color: '#34C759' },
              ]),
            } as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          // This is the aggregated json_each query from countAllRefs()
          if (sql.includes('json_each') && sql.includes('GROUP BY k')) {
            // Only t_abc1 is referenced in entities; t_abc should stay 0.
            return { results: [{ k: 't_abc1', n: 3 }] as T[] };
          }
          return { results: [] as T[] };
        },
      };
      return stmt;
    },
  };
}

describe('GET /api/edit/discipline/:discipline/tags ref_counts accuracy', () => {
  test('prefix keys should not cause false ref matches', async () => {
    const res = await tagsGET(makeCtx(makeDbStub()));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.ref_counts).toMatchObject({
      t_abc: 0,
      t_abc1: 3,
    });
  });
});

