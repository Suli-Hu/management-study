/**
 * v0.8.0 Stage 1 — 双写完整性 + backfill 测试
 *
 * 验证：
 *   1. 所有 D1 写入路径（sync / API-first POST/PATCH / batch）都同时写新 5 列
 *   2. 写入后新列内容能被 KpBody schema 解析（不是脏 JSON）
 *   3. backfill admin endpoint 正确把存量旧列数据填到新列（idempotent）
 */

import { describe, expect, test, beforeEach, vi } from 'vitest';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';
import { syncResource } from '~/lib/sync-resource';
import { createKpRecord, patchKpRecord } from '~/lib/kp-api-store';
import { patchKpsBatch } from '~/lib/kp-batch-store';
import { KpBody, KpEvaluationsLang } from '~/schemas/kp-body-structured';
import { POST as backfillPOST } from '~/pages/api/admin/backfill-kp-body-structured';

vi.mock('~/lib/github', () => ({ getFile: vi.fn() }));
import { getFile } from '~/lib/github';

interface BackfillResponse {
  ok: boolean;
  processed: number;
  remaining: number;
  errors: Array<{ id: string; reason: string; detail?: string }>;
}

async function readBackfill(res: Response): Promise<BackfillResponse> {
  return (await res.json()) as BackfillResponse;
}

const TENANT = { tenantId: 'keiei', discipline: 'keiei' } as const;

async function seedBaseline(db: D1LikeDatabase) {
  await db
    .prepare(
      `INSERT INTO discipline (key, title_zh, title_en, title_ja, tagline_zh, tagline_ja, accent, tags_json, themes_json, created_at, updated_at)
       VALUES ('keiei', '经营学', null, null, null, null, '', '[]', '[]', '2026-01-01', '2026-01-01')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO tenant (id, discipline_key, title_zh, title_en, title_ja, created_at, updated_at)
       VALUES ('keiei', 'keiei', '经营学', null, null, '2026-01-01', '2026-01-01')`,
    )
    .run();
  for (const key of ['motivation', 'change']) {
    await db
      .prepare(
        `INSERT INTO school (key, discipline, title_zh, title_en, title_ja, era, summary_zh, summary_ja, theme_key, accent, tags_json, created_at, updated_at)
         VALUES (?, 'keiei', ?, null, null, '', '', null, 'org', '', '[]', '2026-01-01', '2026-01-01')`,
      )
      .bind(key, `${key}-学派`)
      .run();
  }
  for (const key of ['maslow']) {
    await db
      .prepare(
        `INSERT INTO scholar (key, discipline, name_zh, name_en, name_ja, contribution_zh, lifespan, institution, accent, tags_json, created_at, updated_at)
         VALUES (?, 'keiei', ?, null, null, '', '', '', '', '[]', '2026-01-01', '2026-01-01')`,
      )
      .bind(key, `${key}-中文`)
      .run();
  }
}

async function getNewCols(db: D1LikeDatabase, id: string) {
  return db
    .prepare(
      `SELECT body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json, body_format
       FROM kp WHERE id = ?`,
    )
    .bind(id)
    .first<{
      body_zh_json: string | null;
      body_ja_json: string | null;
      evaluations_zh_json: string | null;
      evaluations_ja_json: string | null;
      body_format: string | null;
    }>();
}

describe('v0.8.0 Stage 1 — 双写完整性', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    vi.clearAllMocks();
  });

  test('sync 路径写入：5 个新列都填上，且能被 KpBody parse', async () => {
    vi.mocked(getFile).mockResolvedValue({
      ok: true,
      data: {
        sha: 'abc',
        content: JSON.stringify({
          id: 'k001',
          discipline: 'keiei',
          schools: ['motivation'],
          scholars: [],
          year: '1943',
          title: { zh: '需求层次', ja: '欲求階層' },
          body: { zh: '导语：◆类型1——desc1◆类型2——desc2', ja: '導語：◆type1——desc1' },
          format: 'flat-list',
          tags: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      },
    });
    const env = { GITHUB_PAT: 'x', GITHUB_REPO: 'x', DB: db as unknown as D1Database };
    const r = await syncResource(env, 'kp', 'keiei', 'k001');
    expect(r.ok).toBe(true);

    const cols = await getNewCols(db, 'k001');
    expect(cols).toBeTruthy();
    expect(cols!.body_format).toBe('flat-list');

    // 5 新列都不为 null（body_ja 存在 → ja evaluations 也写一份哪怕空）
    expect(cols!.body_zh_json).not.toBeNull();
    expect(cols!.body_ja_json).not.toBeNull();
    expect(cols!.evaluations_zh_json).not.toBeNull();
    expect(cols!.evaluations_ja_json).not.toBeNull();
    // ja evaluations 是全空 6 字段（input 没给 evalContent.ja）
    const evalJa = JSON.parse(cols!.evaluations_ja_json!);
    expect(evalJa).toEqual({
      meaning: '', limit: '', example: '', response: '', application: '', analogy: '',
    });

    // body_zh_json 能被 KpBody schema 解析
    const parsedBody = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
    expect(parsedBody.success, JSON.stringify(parsedBody)).toBe(true);

    // evaluations_zh_json 能被 KpEvaluationsLang schema 解析
    const parsedEval = KpEvaluationsLang.safeParse(JSON.parse(cols!.evaluations_zh_json!));
    expect(parsedEval.success).toBe(true);
  });

  test('API-first POST /api/kps 写入：5 新列填上', async () => {
    const r = await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'k010',
        title: { zh: '测试 KP' },
        body: { zh: '正文 body' },
        format: 'narrative',
        year: '2026',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );
    expect(r.ok).toBe(true);

    const cols = await getNewCols(db, 'k010');
    expect(cols!.body_zh_json).not.toBeNull();
    expect(cols!.body_format).toBe('narrative');

    const parsedBody = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
    expect(parsedBody.success).toBe(true);
    if (parsedBody.success && parsedBody.data.format === 'narrative') {
      expect(parsedBody.data.prose).toBe('正文 body');
    }
  });

  test('API-first PATCH /api/kps/:id 写入：新列也更新', async () => {
    // 先 create
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'k020',
        title: { zh: 'orig' },
        body: { zh: 'orig body' },
        format: 'narrative',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );

    // patch
    const r = await patchKpRecord(
      db as unknown as D1Database,
      'k020',
      TENANT,
      { body: { zh: 'patched body' } },
      'u_test',
    );
    expect(r.ok).toBe(true);

    const cols = await getNewCols(db, 'k020');
    expect(cols!.body_zh_json).not.toBeNull();
    const parsedBody = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
    expect(parsedBody.success).toBe(true);
    if (parsedBody.success && parsedBody.data.format === 'narrative') {
      expect(parsedBody.data.prose).toBe('patched body');
    }
  });

  test('batch PATCH /api/kps/batch 写入：新列也更新', async () => {
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'k030',
        title: { zh: 'orig' },
        body: { zh: 'orig' },
        format: 'narrative',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );

    const updates = [
      { id: 'k030', ifMatchVersion: 1, patch: { body: { zh: 'batch patched' } } },
    ];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: 'u_test' },
      updates,
    );
    expect(out.results[0].ok).toBe(true);

    const cols = await getNewCols(db, 'k030');
    const parsedBody = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
    expect(parsedBody.success).toBe(true);
    if (parsedBody.success && parsedBody.data.format === 'narrative') {
      expect(parsedBody.data.prose).toBe('batch patched');
    }
  });
});

describe('v0.8.0 Stage 1 — backfill endpoint', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  function makeContext(db: D1LikeDatabase, opts: { isSuperAdmin?: boolean } = {}) {
    return {
      locals: {
        user: { id: 'u_admin' },
        isSuperAdmin: opts.isSuperAdmin ?? true,
        runtime: { env: { DB: db as unknown as D1Database } },
      },
      request: new Request('https://study.sususu.org/api/admin/backfill-kp-body-structured?batch=10'),
    } as unknown as Parameters<typeof backfillPOST>[0];
  }

  /** 模拟 Stage 1 之前的旧 KP 行：只有旧列，新列全 NULL */
  async function seedOldKpRow(db: D1LikeDatabase, id: string, format: string, body: string) {
    await db
      .prepare(
        `INSERT INTO kp (id, tenant_id, discipline, year, title_zh, title_en, title_ja,
                         body_zh, body_ja, tags_json, eval_content_zh_json, eval_content_ja_json,
                         format, created_by, updated_by, created_at, updated_at)
         VALUES (?, 'keiei', 'keiei', '', ?, null, null, ?, null, '[]', '{}', '{}', ?, 'u_seed', 'u_seed', '2026-01-01', '2026-01-01')`,
      )
      .bind(id, `${id}-标题`, body, format)
      .run();
  }

  test('happy path：seed 5 个未填 KP，调 backfill 全部填上', async () => {
    for (let i = 0; i < 5; i++) {
      await seedOldKpRow(db, `k${100 + i}`, 'narrative', `正文 ${i}`);
    }

    const ctx = makeContext(db);
    const res = await backfillPOST(ctx);
    const body = await readBackfill(res);
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(5);
    expect(body.remaining).toBe(0);
    expect(body.errors).toEqual([]);

    // 验证所有 5 个新列都填了
    for (let i = 0; i < 5; i++) {
      const cols = await getNewCols(db, `k${100 + i}`);
      expect(cols!.body_zh_json).not.toBeNull();
      expect(cols!.body_format).toBe('narrative');
      const parsed = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
      expect(parsed.success).toBe(true);
      if (parsed.success && parsed.data.format === 'narrative') {
        expect(parsed.data.prose).toBe(`正文 ${i}`);
      }
    }
  });

  test('idempotent：重复跑不会改已填的 KP', async () => {
    await seedOldKpRow(db, 'k200', 'narrative', '正文');

    // 第一次跑
    const res1 = await backfillPOST(makeContext(db));
    const body1 = await readBackfill(res1);
    expect(body1.processed).toBe(1);
    expect(body1.remaining).toBe(0);

    // 第二次跑：没有新的 KP 要填
    const res2 = await backfillPOST(makeContext(db));
    const body2 = await readBackfill(res2);
    expect(body2.processed).toBe(0);
    expect(body2.remaining).toBe(0);
  });

  test('分批：seed 25 个，batch=10，调 3 次完成', async () => {
    for (let i = 0; i < 25; i++) {
      await seedOldKpRow(db, `k${300 + i}`, 'narrative', `t ${i}`);
    }

    const r1 = await readBackfill(await backfillPOST(makeContext(db)));
    expect(r1.processed).toBe(10);
    expect(r1.remaining).toBe(15);

    const r2 = await readBackfill(await backfillPOST(makeContext(db)));
    expect(r2.processed).toBe(10);
    expect(r2.remaining).toBe(5);

    const r3 = await readBackfill(await backfillPOST(makeContext(db)));
    expect(r3.processed).toBe(5);
    expect(r3.remaining).toBe(0);
  });

  test('flat-list KP backfill 后 body_zh_json 含正确 items', async () => {
    await seedOldKpRow(db, 'k400', 'flat-list', '导语：◆item 1——desc 1◆item 2——desc 2');

    await backfillPOST(makeContext(db));
    const cols = await getNewCols(db, 'k400');
    const parsed = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.format === 'flat-list') {
      expect(parsed.data.lead).toBe('导语');
      expect(parsed.data.items).toEqual([
        { name: 'item 1', desc: 'desc 1' },
        { name: 'item 2', desc: 'desc 2' },
      ]);
    }
  });

  test('非 super-admin 调用：返 403', async () => {
    await seedOldKpRow(db, 'k500', 'narrative', 'x');
    const ctx = makeContext(db, { isSuperAdmin: false });
    const res = await backfillPOST(ctx);
    expect(res.status).toBe(403);
  });
});
