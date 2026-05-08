/**
 * /api/edit/health integration tests (v0.4.1)
 *   admin 自检 endpoint：验证 D1 binding + schema 可读。
 */

import { describe, expect, test } from 'vitest';
import { GET as healthGET } from '../src/pages/api/edit/health';
import type { APIContext } from 'astro';

function makeDb(opts: { throw?: string; count?: number } = {}) {
  return {
    prepare(sql: string) {
      const stmt = {
        async first<T = unknown>() {
          if (!sql.includes('SELECT COUNT(*) as n FROM discipline')) {
            throw new Error(`unexpected sql: ${sql}`);
          }
          if (opts.throw) throw new Error(opts.throw);
          return { n: opts.count ?? 2 } as T;
        },
      };
      return stmt;
    },
  };
}

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
  test('非 admin → 403 + reason=not_admin', async () => {
    const res = await healthGET(makeCtx({}, false));
    expect(res.status).toBe(403);
    expect(res.headers.get('x-ms-docs')).toBeTruthy();
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_admin', docs: res.headers.get('x-ms-docs') });
  });

  test('DB 缺失 → 503 + reason=config_missing', async () => {
    const res = await healthGET(makeCtx({}));
    expect(res.status).toBe(503);
    expect(res.headers.get('x-ms-docs')).toBeTruthy();
    expect(await res.json()).toMatchObject({ ok: false, reason: 'config_missing', docs: res.headers.get('x-ms-docs') });
  });

  test('discipline 表存在且可读 → 200 + ok=true + discipline_count', async () => {
    const res = await healthGET(makeCtx({ DB: makeDb({ count: 3 }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: 'd1', discipline_count: 3 });
  });

  test('D1 报 no such table → 500 + reason=db_corrupt', async () => {
    const res = await healthGET(makeCtx({ DB: makeDb({ throw: 'no such table: discipline' }) }));
    expect(res.status).toBe(500);
    expect(res.headers.get('x-ms-docs')).toBeTruthy();
    expect(await res.json()).toMatchObject({ ok: false, reason: 'db_corrupt', docs: res.headers.get('x-ms-docs') });
  });

  test('D1 其它异常 → 502 + reason=db_unreachable', async () => {
    const res = await healthGET(makeCtx({ DB: makeDb({ throw: 'network timeout' }) }));
    expect(res.status).toBe(502);
    expect(res.headers.get('x-ms-docs')).toBeTruthy();
    expect(await res.json()).toMatchObject({ ok: false, reason: 'db_unreachable', docs: res.headers.get('x-ms-docs') });
  });
});
