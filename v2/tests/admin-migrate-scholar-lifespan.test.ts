/**
 * v0.8.9 Stage 4.6 Q1=B: POST /api/admin/migrate-scholar-lifespan 单元测试
 */

import { describe, expect, test } from 'vitest';
import type { APIContext } from 'astro';
import { POST as migratePOST } from '../src/pages/api/admin/migrate-scholar-lifespan';

interface ScholarFixture {
  key: string;
  discipline: string;
  lifespan: string | null;
  born: string | null;
  died: string | null;
}

function makeMockDb(rows: ScholarFixture[]) {
  const updates: Array<{ key: string; discipline: string; born: string; died: string }> = [];
  return {
    updates,
    rows,
    prepare(sql: string) {
      const stmt: {
        sql: string;
        binds: unknown[];
        bind: (...args: unknown[]) => typeof stmt;
        all: <T>() => Promise<{ results: T[] }>;
        first: <T>() => Promise<T | null>;
      } = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          stmt.binds = args;
          return stmt;
        },
        async all<T>() {
          if (sql.startsWith('SELECT key, discipline, lifespan')) {
            return { results: rows as unknown as T[] };
          }
          return { results: [] as T[] };
        },
        async first<T>() {
          return null as T | null;
        },
      };
      return stmt;
    },
    async batch(stmts: Array<{ sql: string; binds: unknown[] }>) {
      for (const s of stmts) {
        if (s.sql.startsWith('UPDATE scholar SET born = ?')) {
          const [born, died, discipline, key] = s.binds as [string, string, string, string];
          updates.push({ key, discipline, born, died });
        }
      }
      return [];
    },
  };
}

function makeCtx(opts: {
  isSuperAdmin?: boolean;
  user?: APIContext['locals']['user'] | null;
  rows?: ScholarFixture[];
  dryRun?: boolean;
}): { ctx: APIContext; db: ReturnType<typeof makeMockDb> } {
  const url = new URL(`http://localhost/api/admin/migrate-scholar-lifespan${opts.dryRun ? '?dry_run=1' : ''}`);
  const db = makeMockDb(opts.rows ?? []);
  const ctx = {
    request: new Request(url, { method: 'POST' }),
    url,
    params: {},
    props: {},
    locals: {
      runtime: { env: { DB: db } },
      user: opts.user === undefined
        ? { id: 'u1', email: 'admin@test', display_name: null, created_at: '', email_verified_at: null }
        : opts.user,
      isSuperAdmin: opts.isSuperAdmin ?? true,
      isAdmin: true,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canRead: () => true,
      canEdit: () => true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
  return { ctx, db };
}

describe('POST /api/admin/migrate-scholar-lifespan', () => {
  test('未登录 → 403', async () => {
    const { ctx } = makeCtx({ user: null });
    const res = await migratePOST(ctx);
    expect(res.status).toBe(403);
  });

  test('非 super-admin → 403', async () => {
    const { ctx } = makeCtx({ isSuperAdmin: false });
    const res = await migratePOST(ctx);
    expect(res.status).toBe(403);
  });

  test('en-dash 范围 1908–1970 拆 born=1908 died=1970', async () => {
    const { ctx, db } = makeCtx({
      rows: [{ key: 'maslow', discipline: 'keiei', lifespan: '1908–1970', born: '', died: '' }],
    });
    const res = await migratePOST(ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { succeeded: number; dirty: unknown[] };
    expect(body.succeeded).toBe(1);
    expect(body.dirty).toEqual([]);
    expect(db.updates).toEqual([
      { key: 'maslow', discipline: 'keiei', born: '1908', died: '1970' },
    ]);
  });

  test('多种分隔符都识别', async () => {
    const { ctx, db } = makeCtx({
      rows: [
        { key: 'a', discipline: 'keiei', lifespan: '1900-2000', born: null, died: null },
        { key: 'b', discipline: 'keiei', lifespan: '1900—2000', born: null, died: null },
        { key: 'c', discipline: 'keiei', lifespan: '1900~2000', born: null, died: null },
        { key: 'd', discipline: 'keiei', lifespan: '1900〜2000', born: null, died: null },
      ],
    });
    const res = await migratePOST(ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { succeeded: number; dirty: unknown[] };
    expect(body.succeeded).toBe(4);
    expect(db.updates).toHaveLength(4);
  });

  test('单段不可解析 → dirty list with reason=single_segment', async () => {
    const { ctx, db } = makeCtx({
      rows: [{ key: 'lewin', discipline: 'keiei', lifespan: '1890', born: '', died: '' }],
    });
    const res = await migratePOST(ctx);
    const body = await res.json() as { succeeded: number; dirty: Array<{ key: string; reason: string }> };
    expect(body.succeeded).toBe(0);
    expect(body.dirty).toEqual([
      { key: 'lewin', discipline: 'keiei', lifespan_raw: '1890', reason: 'single_segment' },
    ]);
    expect(db.updates).toEqual([]);
  });

  test('born/died 已填 → 跳过不覆盖', async () => {
    const { ctx, db } = makeCtx({
      rows: [{ key: 'x', discipline: 'keiei', lifespan: '1900–2000', born: '1850', died: '1920' }],
    });
    const res = await migratePOST(ctx);
    const body = await res.json() as { skipped_already_filled: number; succeeded: number };
    expect(body.skipped_already_filled).toBe(1);
    expect(body.succeeded).toBe(0);
    expect(db.updates).toEqual([]);
  });

  test('born 已填 / died 空 → 仅补 died', async () => {
    const { ctx, db } = makeCtx({
      rows: [{ key: 'x', discipline: 'keiei', lifespan: '1900–2000', born: '1850', died: '' }],
    });
    const res = await migratePOST(ctx);
    const body = await res.json() as { succeeded: number };
    expect(body.succeeded).toBe(1);
    expect(db.updates).toEqual([
      { key: 'x', discipline: 'keiei', born: '1850', died: '2000' },
    ]);
  });

  test('lifespan 空 → skipped_empty', async () => {
    const { ctx } = makeCtx({
      rows: [
        { key: 'x', discipline: 'keiei', lifespan: '', born: null, died: null },
        { key: 'y', discipline: 'keiei', lifespan: null, born: null, died: null },
      ],
    });
    const res = await migratePOST(ctx);
    const body = await res.json() as { skipped_empty: number };
    expect(body.skipped_empty).toBe(2);
  });

  test('dry_run=1 → 不写 D1', async () => {
    const { ctx, db } = makeCtx({
      rows: [{ key: 'maslow', discipline: 'keiei', lifespan: '1908–1970', born: '', died: '' }],
      dryRun: true,
    });
    const res = await migratePOST(ctx);
    const body = await res.json() as { dry_run: boolean; succeeded: number };
    expect(body.dry_run).toBe(true);
    expect(body.succeeded).toBe(1);
    expect(db.updates).toEqual([]); // 没真写
  });
});
