/**
 * v0.8.0 Stage 3 — KP API contract hard cut 验收测试
 *
 * 覆盖：
 *   1. 5 format × POST happy path (narrative / flat-list / accordion / compare / quad)
 *   2. 6 个 legacy_* / body_*_invalid 422 拒绝路径（每个 reason 至少 1 个）
 *      - legacy_top_level_format
 *      - legacy_string_body
 *      - legacy_evalcontent_field
 *      - legacy_eval_in_body
 *      - body_format_invalid
 *      - body_structure_invalid
 *   3. PATCH body.zh 整体替换 + body.ja 保留 case
 *   4. GET /api/kps/empty-body 5 format
 *   5. batch API 含 legacy reason 的混合 case（部分条 legacy 拒，其它条照样写）
 *
 * 用真 SQLite fixture，路由层端到端跑。
 */

import { describe, expect, test, beforeEach } from 'vitest';
import type { APIContext } from 'astro';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';
import { POST as kpsPOST } from '../src/pages/api/kps/index';
import { PATCH as kpPATCH } from '../src/pages/api/kps/[id]';
import { PATCH as kpsBatchPATCH } from '../src/pages/api/kps/batch';
import { GET as kpsEmptyBodyGET } from '../src/pages/api/kps/empty-body';
import type { KpBody } from '~/schemas/kp-body-structured';

interface KpResponse {
  ok: boolean;
  reason?: string;
  message?: string;
  migration_guide?: string;
  detail?: unknown;
  kp?: { id: string };
  body?: KpBody;
  results?: Array<{ id: string; ok: boolean; reason?: string; detail?: { migration_guide?: string } }>;
  summary?: { total: number; succeeded: number; failed: number };
}

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
}

function makeCtx(db: D1LikeDatabase, opts: { method: string; path: string; body?: unknown; params?: Record<string, string>; isSuperAdmin?: boolean }): APIContext {
  const url = new URL(`http://localhost${opts.path}`);
  const init: RequestInit = { method: opts.method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  return {
    request: new Request(url, init),
    url,
    params: opts.params ?? {},
    props: {},
    locals: {
      runtime: { env: { DB: db as unknown as D1Database } },
      user: { id: 'u_admin', email: 'admin@test.com', display_name: null, created_at: '', email_verified_at: null },
      isAdmin: true,
      isSuperAdmin: opts.isSuperAdmin ?? true,
      isGuest: false,
      isInviteGuest: false,
      apiTokenScopes: null,
      permissions: new Map(),
      canEdit: () => true,
      canRead: () => true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

async function readJson(res: Response): Promise<KpResponse> {
  return (await res.json()) as KpResponse;
}

const VALID_BODIES: Record<string, KpBody> = {
  narrative: { format: 'narrative', prose: 'Maslow 1943 5 层金字塔...' },
  'flat-list': {
    format: 'flat-list',
    lead: '消费者比较品牌时三种规则：',
    items: [
      { name: '线性补偿', desc: '加权求和' },
      { name: '连结', desc: '门槛过滤' },
    ],
  },
  accordion: {
    format: 'accordion',
    lead: 'Lewin 三阶段：',
    groups: [
      { title: '解冻', items: [{ name: '识别压力', desc: '...' }] },
      { title: '改变', items: [] },
    ],
  },
  compare: {
    format: 'compare',
    lead: '三大学派：',
    cols: [
      { title: '古典', keyword: '效率', desc: '机器观', type: '', theories: '', detail: '' },
      { title: '行为', keyword: '人际', desc: '人本观', type: '', theories: '', detail: '' },
    ],
  },
  quad: {
    format: 'quad',
    lead: 'BCG：',
    yAxis: { low: '低', label: '增长率', high: '高' },
    xAxis: { low: '低', label: '份额', high: '高' },
    cells: [
      { name: '问题', emoji: '❓', sub: '高增低份', detail: '决策投放' },
      { name: '明星', emoji: '⭐', sub: '高增高份', detail: '继续投' },
      { name: '瘦狗', emoji: '🐕', sub: '低增低份', detail: '剥离' },
      { name: '现金牛', emoji: '💰', sub: '低增高份', detail: '维持' },
    ],
  },
};

// ============================================================
// 1. 5 format × POST happy path
// ============================================================

describe('v0.8.0 Stage 3: 5 format × POST /api/kps happy path', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  const formatToId: Record<string, string> = {
    narrative: 'kn1',
    'flat-list': 'kfl1',
    accordion: 'kac1',
    compare: 'kcm1',
    quad: 'kqd1',
  };

  for (const [format, body] of Object.entries(VALID_BODIES)) {
    test(`POST ${format} → 201 + 双写新+旧列`, async () => {
      const id = formatToId[format];
      const res = await kpsPOST(
        makeCtx(db, {
          method: 'POST',
          path: '/api/kps?discipline=keiei',
          body: {
            id,
            title: { zh: `${format} test` },
            body: { zh: body },
            schools: ['motivation'],
          },
        }),
      );
      const data = await readJson(res);
      expect(res.status, JSON.stringify(data)).toBe(201);
      expect(data.ok).toBe(true);
      expect(data.kp).toBeDefined();

      const cols = await db
        .prepare(
          `SELECT body_zh_json, body_format, body_zh, format FROM kp WHERE id = ?`,
        )
        .bind(id)
        .first<{
          body_zh_json: string | null;
          body_format: string | null;
          body_zh: string;
          format: string;
        }>();
      expect(cols, 'KP 应被插入').toBeTruthy();
      // 新列：JSON 即结构化 KpBody
      expect(JSON.parse(cols!.body_zh_json!).format).toBe(format);
      expect(cols!.body_format).toBe(format);
      // 旧列：format + 反推 DSL
      expect(cols!.format).toBe(format);
      expect(cols!.body_zh.length, 'legacy DSL 不应空').toBeGreaterThan(0);
    });
  }

  test('POST 含 evaluations → evaluations 列写入 + ja 单独保留', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'kev1',
          title: { zh: 'evals test' },
          body: { zh: VALID_BODIES.narrative },
          evaluations: {
            zh: {
              meaning: '义内容',
              limit: '限内容',
              example: '',
              response: '',
              application: '',
              analogy: '',
            },
          },
          schools: ['motivation'],
        },
      }),
    );
    const data = await readJson(res);
    expect(res.status, JSON.stringify(data)).toBe(201);

    const cols = await db
      .prepare(`SELECT evaluations_zh_json, evaluations_ja_json FROM kp WHERE id = ?`)
      .bind('kev1')
      .first<{ evaluations_zh_json: string | null; evaluations_ja_json: string | null }>();
    expect(cols!.evaluations_zh_json).not.toBeNull();
    expect(JSON.parse(cols!.evaluations_zh_json!)).toMatchObject({ meaning: '义内容', limit: '限内容' });
    expect(cols!.evaluations_ja_json, 'ja 未提供 → null（PM 决策 v0.7.42）').toBeNull();
  });
});

// ============================================================
// 2. 6 个 legacy/structure 422 reason 路径
// ============================================================

describe('v0.8.0 Stage 3: legacy contract 6 reason 拒绝路径', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('legacy_top_level_format: 顶层 format 字段 → 422 + migration_guide URL', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'klg1',
          title: { zh: 't' },
          body: { zh: VALID_BODIES.narrative },
          format: 'narrative',
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('legacy_top_level_format');
    expect(data.migration_guide).toMatch(/migration-v0\.8\.md/);
    expect(data.message).toContain('format');
  });

  test('legacy_string_body: body.zh 是 string → 422 + migration_guide', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'klg2',
          title: { zh: 't' },
          body: { zh: 'plain string body (DSL)' },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('legacy_string_body');
    expect(data.migration_guide).toMatch(/migration-v0\.8\.md/);
  });

  test('legacy_evalcontent_field: 含 evalContent key → 422', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'klg3',
          title: { zh: 't' },
          body: { zh: VALID_BODIES.narrative },
          evalContent: { zh: { 义: 'X' } },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('legacy_evalcontent_field');
    expect(data.message).toContain('evaluations');
  });

  test('legacy_eval_in_body: body 内含 ◆评价—— 段 → 422', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'klg4',
          title: { zh: 't' },
          body: {
            zh: {
              format: 'narrative',
              prose: '正文一段 ◆意义——这是不该在 body 里的评价段',
            },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('legacy_eval_in_body');
  });

  test('body_format_invalid: body.zh.format 不在 5 枚举 → 422', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'kif1',
          title: { zh: 't' },
          body: { zh: { format: 'invalid-format-name', prose: 'x' } },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('body_format_invalid');
    expect(data.migration_guide).toMatch(/migration-v0\.8\.md/);
  });

  test('body_structure_invalid: quad cells != 4 → 422', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'kis1',
          title: { zh: 't' },
          body: {
            zh: {
              format: 'quad',
              lead: '',
              yAxis: { low: '低', label: '', high: '高' },
              xAxis: { low: '低', label: '', high: '高' },
              cells: [
                { name: 'A', emoji: '', sub: '', detail: '' },
                { name: 'B', emoji: '', sub: '', detail: '' },
                { name: 'C', emoji: '', sub: '', detail: '' },
              ], // 仅 3 个 — 应是 4
            },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('body_structure_invalid');
    expect(data.detail).toBeDefined();
  });

  test('flat-list items 空 → body_structure_invalid', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'kis2',
          title: { zh: 't' },
          body: { zh: { format: 'flat-list', lead: '', items: [] } },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('body_structure_invalid');
  });
});

// ============================================================
// 3. PATCH body.zh 整体替换 + body.ja 保留
// ============================================================

describe('v0.8.0 Stage 3: PATCH body partial-by-language merge', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    // seed KP 双语 body
    await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'kpa1',
          title: { zh: 't', ja: 't-ja' },
          body: {
            zh: { format: 'narrative', prose: 'orig zh prose' },
            ja: { format: 'narrative', prose: 'orig ja prose' },
          },
          schools: ['motivation'],
        },
      }),
    );
  });

  test('PATCH body.zh → ja 保留', async () => {
    const res = await kpPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/k_patch',
        params: { id: 'kpa1' },
        body: {
          body: { zh: { format: 'narrative', prose: 'NEW zh prose' } },
        },
      }),
    );
    expect(res.status, await res.clone().text()).toBe(200);

    const cols = await db
      .prepare('SELECT body_zh_json, body_ja_json FROM kp WHERE id = ?')
      .bind('kpa1')
      .first<{ body_zh_json: string; body_ja_json: string }>();
    expect(JSON.parse(cols!.body_zh_json)).toMatchObject({ format: 'narrative', prose: 'NEW zh prose' });
    expect(JSON.parse(cols!.body_ja_json), 'ja 应保留').toMatchObject({
      format: 'narrative',
      prose: 'orig ja prose',
    });
  });

  test('PATCH 切 format zh: narrative → flat-list 整体替换', async () => {
    const res = await kpPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/k_patch',
        params: { id: 'kpa1' },
        body: {
          body: {
            zh: {
              format: 'flat-list',
              lead: 'lead',
              items: [{ name: 'A', desc: 'a' }],
            },
          },
        },
      }),
    );
    expect(res.status).toBe(200);

    const cols = await db
      .prepare('SELECT body_zh_json, body_format, body_ja_json FROM kp WHERE id = ?')
      .bind('kpa1')
      .first<{ body_zh_json: string; body_format: string; body_ja_json: string }>();
    expect(JSON.parse(cols!.body_zh_json).format).toBe('flat-list');
    expect(cols!.body_format).toBe('flat-list');
    // ja 仍是 narrative — 单语种独立
    expect(JSON.parse(cols!.body_ja_json).format).toBe('narrative');
  });
});

// ============================================================
// 4. GET /api/kps/empty-body 5 format
// ============================================================

describe('v0.8.0 Stage 3: GET /api/kps/empty-body', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  for (const fmt of ['narrative', 'flat-list', 'accordion', 'compare', 'quad'] as const) {
    test(`format=${fmt} → 200 + 空白 KpBody 模板`, async () => {
      const res = await kpsEmptyBodyGET(
        makeCtx(db, {
          method: 'GET',
          path: `/api/kps/empty-body?format=${fmt}&discipline=keiei`,
        }),
      );
      const data = await readJson(res);
      expect(res.status, JSON.stringify(data)).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.body!.format).toBe(fmt);
    });
  }

  test('format 缺失 → 400 format_required', async () => {
    const res = await kpsEmptyBodyGET(
      makeCtx(db, { method: 'GET', path: '/api/kps/empty-body?discipline=keiei' }),
    );
    const data = await readJson(res);
    expect(res.status).toBe(400);
    expect(data.reason).toBe('format_required');
  });

  test('format 非法 → 400 format_invalid', async () => {
    const res = await kpsEmptyBodyGET(
      makeCtx(db, { method: 'GET', path: '/api/kps/empty-body?format=banana&discipline=keiei' }),
    );
    const data = await readJson(res);
    expect(res.status).toBe(400);
    expect(data.reason).toBe('format_invalid');
  });
});

// ============================================================
// 5. batch API 含 legacy reason 的混合 case
// ============================================================

describe('v0.8.0 Stage 3: batch API 混合 legacy reason', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    // seed 3 条 KP — 待 batch patch
    for (const id of ['kba1', 'kba2', 'kba3']) {
      await kpsPOST(
        makeCtx(db, {
          method: 'POST',
          path: '/api/kps?discipline=keiei',
          body: {
            id,
            title: { zh: id },
            body: { zh: VALID_BODIES.narrative },
            schools: ['motivation'],
          },
        }),
      );
    }
  });

  test('混合：1 条 legacy_top_level_format + 1 条 legacy_string_body + 1 条 valid → 单条 reason 不影响其它条', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [
            // valid
            {
              id: 'kba1',
              ifMatchVersion: 1,
              patch: { title: { zh: 'NEW b1' } },
            },
            // legacy_top_level_format
            {
              id: 'kba2',
              ifMatchVersion: 1,
              patch: { format: 'flat-list', title: { zh: 'try legacy' } },
            },
            // legacy_string_body
            {
              id: 'kba3',
              ifMatchVersion: 1,
              patch: { body: { zh: 'plain string body' } },
            },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.summary).toEqual({ total: 3, succeeded: 1, failed: 2 });

    const r1 = data.results![0];
    const r2 = data.results![1];
    const r3 = data.results![2];

    expect(r1.id).toBe('kba1');
    expect(r1.ok).toBe(true);

    expect(r2.id).toBe('kba2');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('legacy_top_level_format');
    expect(r2.detail!.migration_guide).toMatch(/migration-v0\.8\.md/);

    expect(r3.id).toBe('kba3');
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe('legacy_string_body');
    expect(r3.detail!.migration_guide).toMatch(/migration-v0\.8\.md/);
  });

  test('legacy_evalcontent_field + body_structure_invalid 在 batch 单条 reason', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [
            // legacy_evalcontent_field
            { id: 'kba1', ifMatchVersion: 1, patch: { evalContent: { zh: { 义: 'X' } } } },
            // body_structure_invalid (flat-list items 空)
            {
              id: 'kba2',
              ifMatchVersion: 1,
              patch: { body: { zh: { format: 'flat-list', lead: '', items: [] } } },
            },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.summary!.failed).toBe(2);
    expect(data.results![0].reason).toBe('legacy_evalcontent_field');
    expect(data.results![1].reason).toBe('body_structure_invalid');
  });
});
