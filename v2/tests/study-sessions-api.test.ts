/**
 * Study sessions API integration tests (v0.5.2 / v0.7.12)
 *
 * 覆盖：
 *   - 必须登录（401 not_authenticated）
 *   - POST/PUT zod 校验（duration / date / start_time / rating 边界）
 *   - KP 存在 + discipline 匹配校验
 *   - IDOR 防御（user_id 联合 WHERE，别人 session 读改不到）
 *   - GET list 的 discipline / from / to / limit 过滤
 *   - PATCH 不允许改 discipline
 *   - DELETE 二次 DELETE 返回 404
 */

import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { GET as listGET, POST as createPOST } from '../src/pages/api/study-sessions/index';
import { GET as detailGET, PUT as detailPUT, DELETE as detailDELETE } from '../src/pages/api/study-sessions/[id]';

// ============================================================
// mock D1 — 简易内存表（vs 之前 mock callback handler，这里直接模拟数据状态更直观）
// ============================================================

interface SessionTableRow {
  id: string;
  user_id: string;
  discipline: string;
  kp_id: string | null;
  school_key: string | null;
  date: string;
  start_time: string;
  duration_min: number;
  rating: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function mockDb(opts: {
  sessions?: SessionTableRow[];
  kps?: Array<{ id: string; discipline: string }>;
  schools?: Array<{ key: string; discipline: string }>;
} = {}) {
  const sessions = [...(opts.sessions ?? [])];
  const kps = opts.kps ?? [];
  const schools = opts.schools ?? [];
  const calls: Array<{ sql: string; binds: unknown[] }> = [];

  const db = {
    sessions,
    calls,
    prepare(sql: string) {
      const stmt = {
        sql,
        binds: [] as unknown[],
        bind(...args: unknown[]) { stmt.binds = args; return stmt; },
        async first<T = unknown>(): Promise<T | null> {
          calls.push({ sql, binds: stmt.binds });
          // SELECT discipline FROM kp WHERE id = ?
          if (/^SELECT discipline FROM kp WHERE id/.test(sql)) {
            const kp = kps.find((k) => k.id === stmt.binds[0]);
            return (kp ?? null) as T | null;
          }
          if (/^SELECT discipline FROM school WHERE key/.test(sql)) {
            const sch = schools.find((s) => s.key === stmt.binds[0]);
            return (sch ?? null) as T | null;
          }
          // SELECT * FROM study_session WHERE id = ? AND user_id = ?
          if (/SELECT \* FROM study_session WHERE id = \? AND user_id = \?/.test(sql)) {
            const s = sessions.find((r) => r.id === stmt.binds[0] && r.user_id === stmt.binds[1]);
            return (s ?? null) as T | null;
          }
          return null;
        },
        async all<T = unknown>(): Promise<{ results: T[] }> {
          calls.push({ sql, binds: stmt.binds });
          if (/SELECT \* FROM study_session/.test(sql)) {
            // 复制 list 端的 binds 解析（user_id 必有，余下按 sql 顺序）
            const userId = stmt.binds[0];
            let bindIdx = 1;
            let filterDiscipline: string | undefined;
            let filterFrom: string | undefined;
            let filterTo: string | undefined;
            if (sql.includes('discipline = ?')) filterDiscipline = stmt.binds[bindIdx++] as string;
            if (sql.includes('date >= ?')) filterFrom = stmt.binds[bindIdx++] as string;
            if (sql.includes('date <= ?')) filterTo = stmt.binds[bindIdx++] as string;
            const limit = stmt.binds[bindIdx++] as number;
            const offset = stmt.binds[bindIdx++] as number;

            const filtered = sessions
              .filter((r) => r.user_id === userId)
              .filter((r) => !filterDiscipline || r.discipline === filterDiscipline)
              .filter((r) => !filterFrom || r.date >= filterFrom)
              .filter((r) => !filterTo || r.date <= filterTo)
              .sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                if (a.start_time !== b.start_time) return b.start_time.localeCompare(a.start_time);
                return b.id.localeCompare(a.id);
              })
              .slice(offset, offset + limit);
            return { results: filtered as T[] };
          }
          return { results: [] };
        },
        async run() {
          calls.push({ sql, binds: stmt.binds });
          // INSERT INTO study_session ...
          if (/^INSERT INTO study_session/.test(sql)) {
            const [id, user_id, discipline, kp_id, school_key, date, start_time, duration_min, rating, note, created_at, updated_at] = stmt.binds;
            sessions.push({
              id: id as string, user_id: user_id as string, discipline: discipline as string,
              kp_id: kp_id as string | null,
              school_key: school_key as string | null,
              date: date as string, start_time: start_time as string,
              duration_min: duration_min as number,
              rating: rating as number | null, note: note as string | null,
              created_at: created_at as string, updated_at: updated_at as string,
            });
            return { success: true, meta: { changes: 1 } };
          }
          // UPDATE study_session SET ... WHERE id = ? AND user_id = ?
          if (/UPDATE study_session SET/.test(sql)) {
            // last 2 binds are id, user_id
            const id = stmt.binds[stmt.binds.length - 2];
            const user_id = stmt.binds[stmt.binds.length - 1];
            const target = sessions.find((r) => r.id === id && r.user_id === user_id);
            if (target) {
              // parse SET clauses
              const setMatch = sql.match(/SET (.+?) WHERE/s)?.[1] ?? '';
              const cols = setMatch.split(',').map((s) => s.trim().replace(/\s*=\s*\?$/, ''));
              cols.forEach((col, i) => {
                (target as unknown as Record<string, unknown>)[col] = stmt.binds[i];
              });
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }
          // DELETE FROM study_session WHERE id = ? AND user_id = ?
          if (/DELETE FROM study_session WHERE id = \? AND user_id = \?/.test(sql)) {
            const id = stmt.binds[0];
            const user_id = stmt.binds[1];
            const idx = sessions.findIndex((r) => r.id === id && r.user_id === user_id);
            if (idx >= 0) {
              sessions.splice(idx, 1);
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return stmt;
    },
    async batch(_stmts: unknown[]) { return []; },
    async exec(_sql: string) { return { count: 0, duration: 0 }; },
  };
  return db;
}

function makeCtx(
  request: Request,
  db: ReturnType<typeof mockDb>,
  user: { id: string; email: string } | null = { id: 'u_me', email: 'me@b.com' },
  params: Record<string, string> = {},
): APIContext {
  const url = new URL(request.url);
  return {
    request,
    url,
    params,
    props: {},
    locals: {
      runtime: { env: { DB: db } },
      user,
    } as unknown as APIContext['locals'],
    redirect: () => new Response(null, { status: 302 }),
    cookies: {} as unknown as APIContext['cookies'],
    clientAddress: '127.0.0.1',
    site: undefined,
    generator: 'test',
    preferredLocale: undefined,
    preferredLocaleList: undefined,
    currentLocale: undefined,
    routePattern: '',
    originPathname: url.pathname,
    isPrerendered: false,
    getActionResult: () => undefined,
    callAction: () => Promise.resolve(undefined) as never,
    rewrite: () => Promise.resolve(new Response()) as never,
  } as unknown as APIContext;
}

function jsonReq(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let originalError: typeof console.error;
beforeEach(() => { originalError = console.error; console.error = () => {}; });
afterEach(() => { console.error = originalError; });

const VALID_INPUT = {
  discipline: 'keiei',
  school_key: 'school_keiei_a',
  date: '2026-05-02',
  start_time: '14:30',
  duration_min: 30,
  rating: 4,
  note: 'first session',
};

const VALID_KP_INPUT = {
  discipline: 'keiei',
  kp_id: 'k001',
  date: '2026-05-02',
  start_time: '14:30',
  duration_min: 30,
  rating: 4,
  note: 'kp session',
};

const KEIEI_KPS = [{ id: 'k001', discipline: 'keiei' }, { id: 'k002', discipline: 'keiei' }];
const KEIEI_SCHOOLS = [{ key: 'school_keiei_a', discipline: 'keiei' }, { key: 'school_keiei_b', discipline: 'keiei' }];

// ============================================================
// auth gate
// ============================================================

describe('Study sessions API — auth gate', () => {
  test('GET 未登录 → 401', async () => {
    const res = await listGET(makeCtx(new Request('http://localhost/api/study-sessions'), mockDb(), null));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'not_authenticated' });
  });

  test('POST 未登录 → 401', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', VALID_INPUT), mockDb(), null));
    expect(res.status).toBe(401);
  });

  test('detail GET 未登录 → 401', async () => {
    const res = await detailGET(makeCtx(new Request('http://localhost/api/study-sessions/x'), mockDb(), null, { id: 'x' }));
    expect(res.status).toBe(401);
  });

  test('detail PUT 未登录 → 401', async () => {
    const res = await detailPUT(makeCtx(jsonReq('http://localhost/api/study-sessions/x', { rating: 5 }, 'PUT'), mockDb(), null, { id: 'x' }));
    expect(res.status).toBe(401);
  });

  test('detail DELETE 未登录 → 401', async () => {
    const res = await detailDELETE(makeCtx(new Request('http://localhost/api/study-sessions/x', { method: 'DELETE' }), mockDb(), null, { id: 'x' }));
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST /api/study-sessions
// ============================================================

describe('POST /api/study-sessions — create', () => {
  test('合法（学派）→ 200 + session 写入', async () => {
    const db = mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS });
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', VALID_INPUT), db));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; session: { id: string; user_id: string; school_key: string | null; kp_id: string | null } };
    expect(body.ok).toBe(true);
    expect(body.session.user_id).toBe('u_me');
    expect(body.session.school_key).toBe('school_keiei_a');
    expect(body.session.kp_id).toBeNull();
    expect(db.sessions).toHaveLength(1);
    expect(body.session.id).toMatch(/^ss_/);
  });

  test('合法（kp_id 兼容）→ 200', async () => {
    const db = mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS });
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', VALID_KP_INPUT), db));
    expect(res.status).toBe(200);
    const body = await res.json() as { session: { kp_id: string | null; school_key: string | null } };
    expect(body.session.kp_id).toBe('k001');
    expect(body.session.school_key).toBeNull();
  });

  test('非法 JSON → 400 bad_request', async () => {
    const req = new Request('http://localhost/api/study-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{{not json}}',
    });
    const res = await createPOST(makeCtx(req, mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: 'bad_request' });
  });

  test('duration_min = 0 → invalid_input', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, duration_min: 0 }), mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(400);
    expect((await res.json() as { reason: string }).reason).toBe('invalid_input');
  });

  test('duration_min = 601 → invalid_input', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, duration_min: 601 }), mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(400);
  });

  test('rating = 6 → invalid_input', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, rating: 6 }), mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(400);
  });

  test('rating = null → 接受', async () => {
    const db = mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS });
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, rating: null }), db));
    expect(res.status).toBe(200);
    expect(db.sessions[0].rating).toBeNull();
  });

  test('date 格式不对 → invalid_input', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, date: '2026/05/02' }), mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(400);
  });

  test('start_time 格式不对 → invalid_input', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, start_time: '14h30' }), mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(400);
  });

  test('额外字段（strict）→ invalid_input', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, foo: 'bar' }), mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(400);
  });

  test('kp_id 不存在 → 404 kp_not_found', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_KP_INPUT, kp_id: 'k_missing' }), mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'kp_not_found' });
  });

  test('kp_id 在别的 discipline → 400 kp_discipline_mismatch', async () => {
    const res = await createPOST(makeCtx(
      jsonReq('http://localhost/api/study-sessions', { ...VALID_KP_INPUT, kp_id: 'm001' }),
      mockDb({ kps: [...KEIEI_KPS, { id: 'm001', discipline: 'marketing' }], schools: KEIEI_SCHOOLS }),
    ));
    expect(res.status).toBe(400);
    const body = await res.json() as { reason: string; detail: string };
    expect(body.reason).toBe('kp_discipline_mismatch');
    expect(body.detail).toContain('marketing');
  });

  test('school_key 不存在 → 404 school_not_found', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, school_key: 'ghost_school' }), mockDb({ schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'school_not_found' });
  });

  test('同时 kp_id + school_key → invalid_input', async () => {
    const res = await createPOST(makeCtx(jsonReq('http://localhost/api/study-sessions', { ...VALID_INPUT, kp_id: 'k001' }), mockDb({ kps: KEIEI_KPS, schools: KEIEI_SCHOOLS })));
    expect(res.status).toBe(400);
  });
});

// ============================================================
// GET /api/study-sessions — list
// ============================================================

describe('GET /api/study-sessions — list', () => {
  function seedSessions(): SessionTableRow[] {
    return [
      { id: 'ss_a', user_id: 'u_me', discipline: 'keiei', kp_id: 'k001', school_key: null, date: '2026-05-02', start_time: '10:00', duration_min: 30, rating: 4, note: null, created_at: '', updated_at: '' },
      { id: 'ss_b', user_id: 'u_me', discipline: 'keiei', kp_id: 'k002', school_key: null, date: '2026-05-01', start_time: '14:00', duration_min: 60, rating: 5, note: null, created_at: '', updated_at: '' },
      { id: 'ss_c', user_id: 'u_me', discipline: 'marketing', kp_id: 'm001', school_key: null, date: '2026-05-02', start_time: '08:00', duration_min: 20, rating: 3, note: null, created_at: '', updated_at: '' },
      { id: 'ss_other', user_id: 'u_other', discipline: 'keiei', kp_id: 'k001', school_key: null, date: '2026-05-02', start_time: '20:00', duration_min: 90, rating: null, note: null, created_at: '', updated_at: '' },
    ];
  }

  test('列出该 user 全部 + 排序 date DESC, start_time DESC', async () => {
    const db = mockDb({ sessions: seedSessions() });
    const res = await listGET(makeCtx(new Request('http://localhost/api/study-sessions'), db));
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: Array<{ id: string; user_id: string }> };
    expect(body.sessions.map((s) => s.id)).toEqual(['ss_a', 'ss_c', 'ss_b']);
    // 不含 ss_other
    expect(body.sessions.every((s) => s.user_id === 'u_me')).toBe(true);
  });

  test('discipline=keiei 过滤', async () => {
    const db = mockDb({ sessions: seedSessions() });
    const res = await listGET(makeCtx(new Request('http://localhost/api/study-sessions?discipline=keiei'), db));
    const body = await res.json() as { sessions: Array<{ id: string }> };
    expect(body.sessions.map((s) => s.id)).toEqual(['ss_a', 'ss_b']);
  });

  test('from / to 日期范围', async () => {
    const db = mockDb({ sessions: seedSessions() });
    const res = await listGET(makeCtx(new Request('http://localhost/api/study-sessions?from=2026-05-02&to=2026-05-02'), db));
    const body = await res.json() as { sessions: Array<{ id: string }> };
    expect(body.sessions.map((s) => s.id)).toEqual(['ss_a', 'ss_c']);
  });

  test('limit 起作用', async () => {
    const db = mockDb({ sessions: seedSessions() });
    const res = await listGET(makeCtx(new Request('http://localhost/api/study-sessions?limit=2'), db));
    const body = await res.json() as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(2);
  });
});

// ============================================================
// detail GET / PUT / DELETE
// ============================================================

describe('Study session detail endpoints', () => {
  function seed(): SessionTableRow {
    return {
      id: 'ss_a', user_id: 'u_me', discipline: 'keiei', kp_id: 'k001', school_key: null,
      date: '2026-05-02', start_time: '10:00', duration_min: 30, rating: 4, note: 'orig',
      created_at: '', updated_at: '',
    };
  }

  test('GET 自己的 → 200', async () => {
    const db = mockDb({ sessions: [seed()] });
    const res = await detailGET(makeCtx(new Request('http://localhost/api/study-sessions/ss_a'), db, undefined, { id: 'ss_a' }));
    expect(res.status).toBe(200);
  });

  test('GET 别人的 → 404（IDOR 防护）', async () => {
    const other = { ...seed(), id: 'ss_other', user_id: 'u_other' };
    const db = mockDb({ sessions: [other] });
    const res = await detailGET(makeCtx(new Request('http://localhost/api/study-sessions/ss_other'), db, undefined, { id: 'ss_other' }));
    expect(res.status).toBe(404);
  });

  test('PUT 改 rating → 200 + 更新落库', async () => {
    const db = mockDb({ sessions: [seed()] });
    const res = await detailPUT(makeCtx(jsonReq('http://localhost/api/study-sessions/ss_a', { rating: 5 }, 'PUT'), db, undefined, { id: 'ss_a' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { session: { rating: number } };
    expect(body.session.rating).toBe(5);
    expect(db.sessions[0].rating).toBe(5);
  });

  test('PUT 空 patch → invalid_input', async () => {
    const db = mockDb({ sessions: [seed()] });
    const res = await detailPUT(makeCtx(jsonReq('http://localhost/api/study-sessions/ss_a', {}, 'PUT'), db, undefined, { id: 'ss_a' }));
    expect(res.status).toBe(400);
  });

  test('PUT 含 discipline → invalid_input（strict 拒绝额外字段）', async () => {
    const db = mockDb({ sessions: [seed()] });
    const res = await detailPUT(makeCtx(jsonReq('http://localhost/api/study-sessions/ss_a', { discipline: 'marketing' }, 'PUT'), db, undefined, { id: 'ss_a' }));
    expect(res.status).toBe(400);
  });

  test('PUT 改 kp_id 到不存在的 → 404 kp_not_found', async () => {
    const db = mockDb({ sessions: [seed()], kps: [{ id: 'k001', discipline: 'keiei' }] });
    const res = await detailPUT(makeCtx(jsonReq('http://localhost/api/study-sessions/ss_a', { kp_id: 'k_ghost' }, 'PUT'), db, undefined, { id: 'ss_a' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'kp_not_found' });
  });

  test('PUT 改 kp_id 到别 discipline → 400 kp_discipline_mismatch', async () => {
    const db = mockDb({
      sessions: [seed()],
      kps: [{ id: 'k001', discipline: 'keiei' }, { id: 'm001', discipline: 'marketing' }],
    });
    const res = await detailPUT(makeCtx(jsonReq('http://localhost/api/study-sessions/ss_a', { kp_id: 'm001' }, 'PUT'), db, undefined, { id: 'ss_a' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: 'kp_discipline_mismatch' });
  });

  test('PUT 别人的 → 404（IDOR）', async () => {
    const other = { ...seed(), id: 'ss_other', user_id: 'u_other' };
    const db = mockDb({ sessions: [other] });
    const res = await detailPUT(makeCtx(jsonReq('http://localhost/api/study-sessions/ss_other', { rating: 5 }, 'PUT'), db, undefined, { id: 'ss_other' }));
    expect(res.status).toBe(404);
    // 没改到
    expect(db.sessions[0].rating).toBe(4);
  });

  test('DELETE 自己的 → 200', async () => {
    const db = mockDb({ sessions: [seed()] });
    const res = await detailDELETE(makeCtx(new Request('http://localhost/api/study-sessions/ss_a', { method: 'DELETE' }), db, undefined, { id: 'ss_a' }));
    expect(res.status).toBe(200);
    expect(db.sessions).toHaveLength(0);
  });

  test('DELETE 二次 → 404', async () => {
    const db = mockDb({ sessions: [] });
    const res = await detailDELETE(makeCtx(new Request('http://localhost/api/study-sessions/ss_a', { method: 'DELETE' }), db, undefined, { id: 'ss_a' }));
    expect(res.status).toBe(404);
  });

  test('DELETE 别人的 → 404（IDOR）', async () => {
    const other = { ...seed(), id: 'ss_other', user_id: 'u_other' };
    const db = mockDb({ sessions: [other] });
    const res = await detailDELETE(makeCtx(new Request('http://localhost/api/study-sessions/ss_other', { method: 'DELETE' }), db, undefined, { id: 'ss_other' }));
    expect(res.status).toBe(404);
    // 别人 session 没被删
    expect(db.sessions).toHaveLength(1);
  });
});
