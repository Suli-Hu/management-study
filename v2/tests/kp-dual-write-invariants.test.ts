/**
 * v0.8.0 Stage 1 — 双写"不变量"测试 (PM 决策对齐版)
 *
 * 现有 kp-dual-write.test.ts 只测 happy path（5 新列填上）。
 * 这套补的是 PRD §6.3 防线 1 的真正 invariants：
 *
 *   A1  format/body 错配（m178 复刻）调 createKp/patchKp/batch：
 *       PM 决策：保留 Stage 1 lossy 行为 — 写入成功，但新列被 audit 工具识别为 dirty
 *       Stage 3 hard cut 前会被 audit 拦下来逐条修
 *
 *   A2  evaluations.ja null 语义在 sync vs api-store vs batch 三路径必须一致
 *       (现有测试只测 sync — 验证三路径行为统一)
 *
 *   A3  backfill 之后再 patchKp，新列必须更新（不能只更新旧列）
 */

import { describe, expect, test, beforeEach, vi } from 'vitest';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';
import { upsertKpInD1 } from '~/lib/d1-kp-write';
import { createKpRecord, patchKpRecord } from '~/lib/kp-api-store';
import { patchKpsBatch } from '~/lib/kp-batch-store';
import { KpBody } from '~/schemas/kp-body-structured';
import { auditKpStructured } from '~/lib/kp-audit-structured';
import { POST as backfillPOST } from '~/pages/api/admin/backfill-kp-body-structured';

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
  for (const key of ['motivation']) {
    await db
      .prepare(
        `INSERT INTO school (key, discipline, title_zh, title_en, title_ja, era, summary_zh, summary_ja, theme_key, accent, tags_json, created_at, updated_at)
         VALUES (?, 'keiei', ?, null, null, '', '', null, 'org', '', '[]', '2026-01-01', '2026-01-01')`,
      )
      .bind(key, `${key}-学派`)
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

describe('A1 — format/body mismatch (m178 复刻) PM 决策：lossy 写入 + audit 工具识别', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    vi.clearAllMocks();
  });

  test('createKp: format=flat-list 但 body 是 accordion 风格 → 写入成功但新列被 audit 识别为 dirty', async () => {
    // m178 风格：format 和 body marker 不匹配
    const r = await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'km178',
        title: { zh: 'm178 复刻' },
        body: { zh: '消费者在比较品牌时<br>【① 线性补偿型】<br>desc<br>【② 连结型】<br>desc' },
        format: 'flat-list', // ← 与 body 风格不一致
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );
    // PM 决策：Stage 1 不 fail-fast，保留 backward compat
    expect(r.ok, 'PM 决策：Stage 1 lossy 写入应成功（不破坏老调用方）').toBe(true);

    const cols = await getNewCols(db, 'km178');
    expect(cols!.body_zh_json).not.toBeNull();

    // 但 KpBody.parse 应当失败（dirty data）
    const parsed = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
    expect(parsed.success, '脏 JSON 不应通过 KpBody.parse').toBe(false);

    // audit 工具能识别这条
    const audit = await auditKpStructured(db as unknown as D1Database);
    expect(audit.dirty_kps.find((d) => d.id === 'km178')).toBeTruthy();
    expect(audit.dirty_kps.find((d) => d.id === 'km178')!.langs).toContain('zh');
  });

  test('patchKp: 把已有 KP 的 format 改成不匹配 → 写入成功但 dirty', async () => {
    // 先创一个干净的 narrative KP
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'kpatch',
        title: { zh: 'orig' },
        body: { zh: 'orig narrative' },
        format: 'narrative',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );

    // patch：把 format 切到 flat-list，但 body 不动（仍是 narrative 文本）
    const r = await patchKpRecord(
      db as unknown as D1Database,
      'kpatch',
      TENANT,
      { format: 'flat-list' },
      'u_test',
    );
    expect(r.ok).toBe(true);

    const audit = await auditKpStructured(db as unknown as D1Database);
    expect(audit.dirty_kps.find((d) => d.id === 'kpatch'), 'patch 后应被 audit 识别为脏').toBeTruthy();
  });

  test('batch PATCH: 把多条 format 改成不匹配 → 全成功 + 全部进 dirty 清单', async () => {
    for (let i = 0; i < 3; i++) {
      await createKpRecord(
        db as unknown as D1Database,
        TENANT,
        {
          id: `kbatch${i}`,
          title: { zh: `t${i}` },
          body: { zh: `narrative ${i}` },
          format: 'narrative',
          year: '',
          schools: ['motivation'],
          scholars: [],
          tags: [],
        },
        'u_test',
      );
    }

    const updates = [0, 1, 2].map((i) => ({
      id: `kbatch${i}`,
      ifMatchVersion: 1,
      patch: { format: 'flat-list' as const }, // 故意制造 dirty
    }));
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: 'u_test' },
      updates,
    );
    expect(out.summary.succeeded).toBe(3);

    const audit = await auditKpStructured(db as unknown as D1Database);
    const dirtyIds = new Set(audit.dirty_kps.map((d) => d.id));
    expect(dirtyIds).toEqual(new Set(['kbatch0', 'kbatch1', 'kbatch2']));
  });

  test('audit 区分 missing_new_col vs dirty_kps（PM 看的清单语义）', async () => {
    // 1 条 happy
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'kclean',
        title: { zh: 'clean' },
        body: { zh: 'clean body' },
        format: 'narrative',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );

    // 1 条 dirty（format=flat-list 但 body 是 narrative，解析后 items=[] → zod 拒绝）
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'kdirty',
        title: { zh: 'dirty' },
        body: { zh: 'just narrative text without any markers' },
        format: 'flat-list',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );

    // 1 条 missing（手动 NULL 新列模拟 backfill 没跑 / 写入路径漏写）
    await db
      .prepare(
        `INSERT INTO kp (id, tenant_id, discipline, year, title_zh, title_en, title_ja,
                         body_zh, body_ja, tags_json, eval_content_zh_json, eval_content_ja_json,
                         format, created_by, updated_by, created_at, updated_at)
         VALUES ('kmissing', 'keiei', 'keiei', '', 't', null, null, 'x', null, '[]', '{}', '{}', 'narrative', 'u', 'u', '2026-01-01', '2026-01-01')`,
      )
      .run();

    const audit = await auditKpStructured(db as unknown as D1Database);
    expect(audit.total_kps).toBe(3);
    expect(audit.with_new_col).toBe(2);
    expect(audit.missing_new_col).toBe(1);
    expect(audit.dirty_kps.length).toBe(1);
    expect(audit.dirty_kps[0].id).toBe('kdirty');
  });
});

describe('A2 — evaluations 三路径一致性 (PM 决策: evalContent 有就抽，没就 null)', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    vi.clearAllMocks();
  });

  /**
   * BUG SURFACED — Stage 1 实现期间 4 路径未对齐：
   *
   *   场景: KP 有 body 但 evalContent 空
   *
   *   ┌──────────┬─────────────────┬─────────────────┬─────────────────┐
   *   │  路径    │  ZH (narrative) │  ZH (含◆评价)   │  JA (有 body.ja)│
   *   ├──────────┼─────────────────┼─────────────────┼─────────────────┤
   *   │ sync     │ 6字段空对象     │ 抽 body 评价    │ 6字段空对象     │
   *   │ api      │ 6字段空对象     │ 6字段空对象     │ null            │
   *   │ batch    │ 6字段空对象     │ 6字段空对象     │ null            │
   *   │ backfill │ 6字段空对象     │ 6字段空对象     │ null            │
   *   └──────────┴─────────────────┴─────────────────┴─────────────────┘
   *
   *   不一致点（A2-ja, A2-zh-extracted）:
   *     - JA: sync=空对象 vs api/batch=null
   *     - ZH 含◆评价: sync=抽 body vs api/batch=空对象
   *
   * PM 决策（含研发反馈+渲染层 evals 仍读旧列的关键事实）：
   *   4 路径统一 → evalContent 有 → 抽；没有 → null
   *   sync 的"从 body 抽"行为去掉（与 PRD §3.2.2 + backfill 一致）
   *   api/batch/backfill 的"6字段空对象字面量"换成 null
   *
   * 这两条 test.fails 暴露 bug 但不阻 CI；研发改完后翻 test。
   */

  test('A2-ja: JA 三路径一致 (sync 写空对象 vs api/batch 写 null)', async () => {
    // 路径 1: sync (走 upsertKpInD1 — sync 入口最终调的就是这个)
    await upsertKpInD1(db as unknown as D1Database, {
      id: 'ksync',
      discipline: 'keiei',
      schools: ['motivation'],
      scholars: [],
      year: '',
      title: { zh: '中', ja: '日' },
      body: { zh: 'narrative zh', ja: 'narrative ja' },
      format: 'narrative',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // 路径 2: api-first POST
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'kapi',
        title: { zh: '中', ja: '日' },
        body: { zh: 'narrative zh', ja: 'narrative ja' },
        format: 'narrative',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );

    // 路径 3: batch (先创再 batch patch)
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'kbat',
        title: { zh: '中', ja: '日' },
        body: { zh: 'orig zh', ja: 'orig ja' },
        format: 'narrative',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );
    const updates = [
      {
        id: 'kbat',
        ifMatchVersion: 1,
        patch: { body: { zh: 'narrative zh', ja: 'narrative ja' } },
      },
    ];
    await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: 'u_test' },
      updates,
    );

    const sync = await getNewCols(db, 'ksync');
    const api = await getNewCols(db, 'kapi');
    const batch = await getNewCols(db, 'kbat');

    // 都没填 evalContent.ja，但都有 ja body — 三路径必须给出同一个 evaluations_ja_json
    expect(
      sync!.evaluations_ja_json,
      `三路径不一致: sync=${sync!.evaluations_ja_json} api=${api!.evaluations_ja_json} batch=${batch!.evaluations_ja_json}`,
    ).toBe(api!.evaluations_ja_json);
    expect(api!.evaluations_ja_json).toBe(batch!.evaluations_ja_json);
    // PM 决策的最终态：都是 null
    expect(sync!.evaluations_ja_json, 'PM 决策：都为 null').toBeNull();
  });

  /**
   * A2-zh-extracted: ZH 路径在 body 含 ◆评价—— 时三路径不一致
   *
   * 当前行为（fixture: format=flat-list + body 含 ◆意义—— + evalContent.zh 空）:
   *   - sync: extractEvaluationsFromParsed → { meaning: '抽出来的义', limit: '', ... }
   *   - api/batch: 6 字段空对象字面量 { meaning: '', limit: '', ... }
   *
   * 修法后:
   *   - 4 路径都返 null（与 PRD §3.2.2 一致 — body 内不再允许 ◆评价——）
   *   - 老数据 evals 仅在 body 的 case 由 audit 工具识别 + 单独迁移
   */
  test('A2-zh-extracted: ZH 三路径一致 (sync 抽 body vs api/batch 写空对象)', async () => {
    const bodyWithEval = '◆item A——descA◆item B——descB◆意义——这是从 body 抽出来的义';

    // 路径 1: sync
    await upsertKpInD1(db as unknown as D1Database, {
      id: 'kszh',
      discipline: 'keiei',
      schools: ['motivation'],
      scholars: [],
      year: '',
      title: { zh: '中' },
      body: { zh: bodyWithEval },
      format: 'flat-list',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // 路径 2: api-first POST
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'kazh',
        title: { zh: '中' },
        body: { zh: bodyWithEval },
        format: 'flat-list',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );

    // 路径 3: batch
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'kbzh',
        title: { zh: '中' },
        body: { zh: 'orig' },
        format: 'flat-list',
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
      },
      'u_test',
    );
    const updates = [{ id: 'kbzh', ifMatchVersion: 1, patch: { body: { zh: bodyWithEval } } }];
    await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: 'u_test' },
      updates,
    );

    const sync = await getNewCols(db, 'kszh');
    const api = await getNewCols(db, 'kazh');
    const batch = await getNewCols(db, 'kbzh');

    expect(
      sync!.evaluations_zh_json,
      `三路径不一致: sync=${sync!.evaluations_zh_json} api=${api!.evaluations_zh_json} batch=${batch!.evaluations_zh_json}`,
    ).toBe(api!.evaluations_zh_json);
    expect(api!.evaluations_zh_json).toBe(batch!.evaluations_zh_json);
    // PM 决策的最终态：都为 null（不再从 body 抽 evals）
    expect(sync!.evaluations_zh_json, 'PM 决策：4 路径都为 null，body 内 ◆评价 由 audit 单独处理').toBeNull();
  });

  /**
   * A2-backfill: backfill endpoint 也要跟 4 路径一致
   *
   * 当前行为: evalContent 空 → 写 6 字段空对象（不是 null）
   * 修法后: 写 null
   */
  test('A2-backfill: backfill 写 evals 应为 null（evalContent 空时）', async () => {
    // seed 老 KP（evalContent 空）
    await db
      .prepare(
        `INSERT INTO kp (id, tenant_id, discipline, year, title_zh, title_en, title_ja,
                         body_zh, body_ja, tags_json, eval_content_zh_json, eval_content_ja_json,
                         format, created_by, updated_by, created_at, updated_at)
         VALUES ('kbf', 'keiei', 'keiei', '', 't', null, null, 'narrative', null, '[]', '{}', '{}', 'narrative', 'u', 'u', '2026-01-01', '2026-01-01')`,
      )
      .run();

    // 跑 backfill
    const { POST: backfillPOST } = await import('~/pages/api/admin/backfill-kp-body-structured');
    const ctx = {
      locals: {
        user: { id: 'u_admin' },
        isSuperAdmin: true,
        runtime: { env: { DB: db as unknown as D1Database } },
      },
      request: new Request('https://study.sususu.org/api/admin/backfill-kp-body-structured?batch=10'),
    } as unknown as Parameters<typeof backfillPOST>[0];
    await backfillPOST(ctx);

    const cols = await getNewCols(db, 'kbf');
    expect(cols!.evaluations_zh_json, 'PM 决策：evalContent 空时 backfill 写 null').toBeNull();
  });
});

describe('A3 — backfill 之后再 patch，新列必须跟着更新', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('seed 老 KP（仅旧列）→ backfill → patch → 新列更新到 patch 后内容', async () => {
    // 1. seed 一条老 KP（模拟 Stage 1 之前数据）
    await db
      .prepare(
        `INSERT INTO kp (id, tenant_id, discipline, year, title_zh, title_en, title_ja,
                         body_zh, body_ja, tags_json, eval_content_zh_json, eval_content_ja_json,
                         format, created_by, updated_by, created_at, updated_at)
         VALUES ('kold', 'keiei', 'keiei', '', 't', null, null, 'old narrative', null, '[]', '{}', '{}', 'narrative', 'u', 'u', '2026-01-01', '2026-01-01')`,
      )
      .run();

    // 2. backfill
    const ctx = {
      locals: {
        user: { id: 'u_admin' },
        isSuperAdmin: true,
        runtime: { env: { DB: db as unknown as D1Database } },
      },
      request: new Request('https://study.sususu.org/api/admin/backfill-kp-body-structured?batch=10'),
    } as unknown as Parameters<typeof backfillPOST>[0];
    await backfillPOST(ctx);

    const beforePatch = await getNewCols(db, 'kold');
    expect(beforePatch!.body_zh_json).not.toBeNull();
    const beforeParsed = JSON.parse(beforePatch!.body_zh_json!);
    expect(beforeParsed.prose).toBe('old narrative');

    // 3. patch via API
    const r = await patchKpRecord(
      db as unknown as D1Database,
      'kold',
      TENANT,
      { body: { zh: 'patched narrative' } },
      'u_test',
    );
    expect(r.ok).toBe(true);

    // 4. 新列必须跟着更新
    const afterPatch = await getNewCols(db, 'kold');
    const afterParsed = JSON.parse(afterPatch!.body_zh_json!);
    expect(afterParsed.prose, '新列必须跟 patch 走，不能仍是 old narrative').toBe('patched narrative');
  });
});
