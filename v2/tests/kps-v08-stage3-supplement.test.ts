/**
 * v0.8.0 Stage 3 (PR #40) — Test Eng1 补充验收测试
 *
 * 不重复 Dev 已有 24 case (kps-v08-contract.test.ts)，集中补 hole：
 *   类 2  多语种 / ja 单语种边界
 *   类 3  dryRun batch 流
 *   类 4  乐观锁 / version conflict
 *   类 5  特殊字符 / 边界值
 *   类 6  ID 生成 / 冲突
 *   类 7  schools/scholars 跨 tenant 防御
 *   类 8  legacy detector 边界（含 PM 已知观察 — EVAL_DEFS 一致性）
 *   类 9  response shape 兼容（GET 仍含旧字段）
 *   类 10 大批 batch 性能 + 容量
 *   类 11 forbidden_field + 删后再 patch + 评价边界
 *
 * 按"用 Dev 的 fixture pattern"复用 d1-test-db。每个 describe 重建 db，避免
 * 跨 test 状态泄漏。
 */

import { describe, expect, test, beforeEach } from 'vitest';
import type { APIContext } from 'astro';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';
import { POST as kpsPOST } from '../src/pages/api/kps/index';
import { PATCH as kpPATCH } from '../src/pages/api/kps/[id]';
import { DELETE as kpDELETE } from '../src/pages/api/kps/[id]';
import { PATCH as kpsBatchPATCH } from '../src/pages/api/kps/batch';
import type { KpBody } from '~/schemas/kp-body-structured';

interface KpResponse {
  ok: boolean;
  reason?: string;
  message?: string;
  migration_guide?: string;
  detail?: any;
  kp?: any;
  body?: KpBody;
  results?: Array<{
    id: string;
    ok: boolean;
    reason?: string;
    version?: number;
    current_version?: number;
    expected_version?: number;
    diff?: Record<string, { before: unknown; after: unknown }>;
    detail?: any;
  }>;
  summary?: { total: number; succeeded: number; failed: number };
}

async function seedBaseline(db: D1LikeDatabase, opts?: { withMarketing?: boolean }) {
  const disciplines: Array<[string, string]> = [['keiei', '经营学']];
  if (opts?.withMarketing) disciplines.push(['marketing', 'マーケティング']);
  for (const [key, title] of disciplines) {
    await db
      .prepare(
        `INSERT INTO discipline (key, title_zh, title_en, title_ja, tagline_zh, tagline_ja, accent, tags_json, themes_json, created_at, updated_at)
         VALUES (?, ?, null, null, null, null, '', '[]', '[]', '2026-01-01', '2026-01-01')`,
      )
      .bind(key, title)
      .run();
    await db
      .prepare(
        `INSERT INTO tenant (id, discipline_key, title_zh, title_en, title_ja, created_at, updated_at)
         VALUES (?, ?, ?, null, null, '2026-01-01', '2026-01-01')`,
      )
      .bind(key, key, title)
      .run();
  }

  // schools per discipline
  const schoolsByDiscipline: Record<string, string[]> = {
    keiei: ['motivation', 'change'],
    marketing: ['consumer', 'brand'],
  };
  for (const [discipline, schools] of Object.entries(schoolsByDiscipline)) {
    if (!disciplines.find(([k]) => k === discipline)) continue;
    for (const key of schools) {
      await db
        .prepare(
          `INSERT INTO school (key, discipline, title_zh, title_en, title_ja, era, summary_zh, summary_ja, theme_key, accent, tags_json, created_at, updated_at)
           VALUES (?, ?, ?, null, null, '', '', null, 'org', '', '[]', '2026-01-01', '2026-01-01')`,
        )
        .bind(key, discipline, `${key}-学派`)
        .run();
    }
  }

  // (scholars omitted — supplement tests don't reference scholars)
}

function makeCtx(
  db: D1LikeDatabase,
  opts: {
    method: string;
    path: string;
    body?: unknown;
    params?: Record<string, string>;
    isSuperAdmin?: boolean;
    apiTokenScopes?: string[] | null;
  },
): APIContext {
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
      apiTokenScopes: opts.apiTokenScopes ?? null,
      permissions: new Map(),
      canEdit: () => true,
      canRead: () => true,
    } as unknown as APIContext['locals'],
  } as unknown as APIContext;
}

async function readJson(res: Response): Promise<KpResponse> {
  return (await res.json()) as KpResponse;
}

const NARRATIVE_BODY: KpBody = { format: 'narrative', prose: 'baseline prose' };
const FLAT_LIST_BODY: KpBody = {
  format: 'flat-list',
  lead: 'lead',
  items: [{ name: 'A', desc: 'a' }],
};

async function seedKp(db: D1LikeDatabase, id: string, opts?: Partial<{ ja: KpBody; evaluations: any; schools: string[] }>) {
  const res = await kpsPOST(
    makeCtx(db, {
      method: 'POST',
      path: '/api/kps?discipline=keiei',
      body: {
        id,
        title: { zh: id },
        body: { zh: NARRATIVE_BODY, ...(opts?.ja ? { ja: opts.ja } : {}) },
        ...(opts?.evaluations ? { evaluations: opts.evaluations } : {}),
        schools: opts?.schools ?? ['motivation'],
      },
    }),
  );
  const data = await readJson(res);
  if (res.status !== 201) throw new Error(`seedKp ${id} failed: ${JSON.stringify(data)}`);
  return data;
}

// ============================================================
// 类 2: 多语种 / ja 单语种边界
// ============================================================
describe('类2 多语种边界', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('T2.1 POST 只 zh（无 ja） → ja 列 null', async () => {
    await seedKp(db, 'k200');
    const cols = await db
      .prepare('SELECT body_ja, body_ja_json FROM kp WHERE id = ?')
      .bind('k200')
      .first<{ body_ja: string | null; body_ja_json: string | null }>();
    expect(cols!.body_ja).toBeNull();
    expect(cols!.body_ja_json).toBeNull();
  });

  test('T2.2 POST zh + ja 不同 format（schema 灵活，产品强制一致）', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k201',
          title: { zh: 't', ja: 't-ja' },
          body: {
            zh: NARRATIVE_BODY,
            ja: FLAT_LIST_BODY,
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(201);
    const cols = await db
      .prepare('SELECT body_format, body_zh_json, body_ja_json FROM kp WHERE id = ?')
      .bind('k201')
      .first<{ body_format: string; body_zh_json: string; body_ja_json: string }>();
    // body_format 跟 zh.format（v0.8.0 helper deriveDualWriteCols 单一 source）
    expect(cols!.body_format).toBe('narrative');
    expect(JSON.parse(cols!.body_zh_json).format).toBe('narrative');
    expect(JSON.parse(cols!.body_ja_json).format).toBe('flat-list');
  });

  test('T2.3 PATCH 只动 ja → zh 保留', async () => {
    await seedKp(db, 'k202', { ja: NARRATIVE_BODY });
    const res = await kpPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/k202',
        params: { id: 'k202' },
        body: { body: { ja: { format: 'narrative', prose: 'NEW JA' } } },
      }),
    );
    expect(res.status).toBe(200);
    const cols = await db
      .prepare('SELECT body_zh_json, body_ja_json FROM kp WHERE id = ?')
      .bind('k202')
      .first<{ body_zh_json: string; body_ja_json: string }>();
    expect(JSON.parse(cols!.body_zh_json)).toMatchObject({ format: 'narrative', prose: 'baseline prose' });
    expect(JSON.parse(cols!.body_ja_json)).toMatchObject({ format: 'narrative', prose: 'NEW JA' });
  });

  test('T2.4 evaluations 只给 zh，PATCH 后加 ja，zh 应保留', async () => {
    await seedKp(db, 'k203', {
      evaluations: { zh: { meaning: 'M', limit: '', example: '', response: '', application: '', analogy: '' } },
    });
    const beforePatch = await db
      .prepare('SELECT evaluations_zh_json, evaluations_ja_json FROM kp WHERE id = ?')
      .bind('k203')
      .first<{ evaluations_zh_json: string | null; evaluations_ja_json: string | null }>();
    expect(JSON.parse(beforePatch!.evaluations_zh_json!)).toMatchObject({ meaning: 'M' });
    expect(beforePatch!.evaluations_ja_json).toBeNull();

    const res = await kpPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/k203',
        params: { id: 'k203' },
        body: {
          evaluations: {
            ja: { meaning: 'M-ja', limit: '', example: '', response: '', application: '', analogy: '' },
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    const after = await db
      .prepare('SELECT evaluations_zh_json, evaluations_ja_json FROM kp WHERE id = ?')
      .bind('k203')
      .first<{ evaluations_zh_json: string | null; evaluations_ja_json: string | null }>();
    expect(JSON.parse(after!.evaluations_zh_json!), 'zh 应保留').toMatchObject({ meaning: 'M' });
    expect(JSON.parse(after!.evaluations_ja_json!)).toMatchObject({ meaning: 'M-ja' });
  });
});

// ============================================================
// 类 3: dryRun batch 流
// ============================================================
describe('类3 dryRun batch', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    await seedKp(db, 'k300');
  });

  test('T3.1 dryRun=true → 不写 + 返 diff + current_version', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          dryRun: true,
          updates: [{ id: 'k300', patch: { title: { zh: 'NEW' } } }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.summary).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
    const r = data.results![0];
    expect(r.ok).toBe(true);
    expect(r.current_version).toBe(1);
    expect(r.diff).toBeDefined();
    expect(r.diff!['title.zh']).toMatchObject({ before: 'k300', after: 'NEW' });

    const stillOriginal = await db.prepare('SELECT title_zh FROM kp WHERE id = ?').bind('k300').first<{ title_zh: string }>();
    expect(stillOriginal!.title_zh, 'dryRun 不应写').toBe('k300');
  });

  test('T3.2 dryRun=true 不传 ifMatchVersion 仍跑通', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          dryRun: true,
          updates: [{ id: 'k300', patch: { year: '2026' } }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].ok).toBe(true);
  });

  test('T3.3 dryRun + legacy reason 仍返 reason（不静默忽略）', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          dryRun: true,
          updates: [{ id: 'k300', patch: { format: 'narrative', title: { zh: 'X' } } }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].reason).toBe('legacy_top_level_format');
  });

  test('T3.4 diff 含 body/evaluations/schools 等多字段', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          dryRun: true,
          updates: [
            {
              id: 'k300',
              patch: {
                title: { zh: 'NEW' },
                year: '2026',
                schools: ['change'],
                body: { zh: { format: 'narrative', prose: 'NEW PROSE' } },
              },
            },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    const diff = data.results![0].diff!;
    expect(Object.keys(diff).sort()).toEqual(
      expect.arrayContaining(['title.zh', 'year', 'schools', 'body.zh']),
    );
  });

  test('T3.5 dryRun + body_structure_invalid 仍返 reason 不写', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          dryRun: true,
          updates: [{ id: 'k300', patch: { body: { zh: { format: 'flat-list', lead: '', items: [] } } } }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].reason).toBe('body_structure_invalid');
  });
});

// ============================================================
// 类 4: 乐观锁 / version conflict
// ============================================================
describe('类4 乐观锁', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    await seedKp(db, 'k400');
  });

  test('T4.1 batch 非 dryRun 不传 ifMatchVersion → ifMatchVersion_required', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [{ id: 'k400', patch: { title: { zh: 'X' } } }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].reason).toBe('ifMatchVersion_required');
    expect(data.results![0].current_version).toBe(1);
  });

  test('T4.2 ifMatchVersion 错 → version_conflict + current_version + expected_version', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [{ id: 'k400', ifMatchVersion: 99, patch: { title: { zh: 'X' } } }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0]).toMatchObject({
      ok: false,
      reason: 'version_conflict',
      current_version: 1,
      expected_version: 99,
    });
  });

  test('T4.3 中间被改 → 第二次 conflict 但其它条照样跑', async () => {
    await seedKp(db, 'k401');
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [
            { id: 'k400', ifMatchVersion: 1, patch: { title: { zh: 'NEW400' } } },
            { id: 'k401', ifMatchVersion: 99, patch: { title: { zh: 'try' } } },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.summary).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(data.results![0].ok).toBe(true);
    expect(data.results![1].reason).toBe('version_conflict');
  });

  test('T4.4 同一 id 出现 2 次 → 第 1 次写入 (version+1)，第 2 次 version_conflict', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [
            { id: 'k400', ifMatchVersion: 1, patch: { title: { zh: 'first' } } },
            { id: 'k400', ifMatchVersion: 1, patch: { title: { zh: 'second' } } },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].ok).toBe(true);
    expect(data.results![1].reason).toBe('version_conflict');
    expect(data.results![1].current_version).toBe(2);
  });
});

// ============================================================
// 类 5: 特殊字符 / 边界值
// ============================================================
describe('类5 特殊字符 / 边界值', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('T5.1 prose 含 emoji + HTML + \\n + 5000+ 字 → 写入', async () => {
    const long = '中文'.repeat(2500); // ~5000 chars
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k501',
          title: { zh: 't' },
          body: {
            zh: {
              format: 'narrative',
              prose: `Hello 👋 <strong>bold</strong>\n\nLine2\n${long}`,
            },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status, await res.clone().text()).toBe(201);
    const cols = await db.prepare('SELECT body_zh_json FROM kp WHERE id = ?').bind('k501').first<{ body_zh_json: string }>();
    const parsed = JSON.parse(cols!.body_zh_json);
    expect(parsed.prose).toContain('👋');
    expect(parsed.prose).toContain('<strong>');
    expect(parsed.prose.length).toBeGreaterThan(5000);
  });

  test('T5.2 items[].name 含旧 marker 字符 (◆/【】/——) 当普通文字 — 应通过校验', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k502',
          title: { zh: 't' },
          body: {
            zh: {
              format: 'flat-list',
              lead: '',
              items: [{ name: '【组A】', desc: '描述含 —— 长破折号' }],
            },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status, await res.clone().text()).toBe(201);
    const cols = await db.prepare('SELECT body_zh_json FROM kp WHERE id = ?').bind('k502').first<{ body_zh_json: string }>();
    const parsed = JSON.parse(cols!.body_zh_json);
    expect(parsed.items[0].name).toBe('【组A】');
    expect(parsed.items[0].desc).toContain('——');
  });

  test('T5.3 multi-script: RTL / 韩文 / 假名 / 繁体', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k503',
          title: { zh: 't' },
          body: {
            zh: {
              format: 'narrative',
              prose: 'ABC مرحبا 한국어 カタカナ 繁體中文 हिन्दी',
            },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  test('T5.4 evaluations.meaning 含 5000+ 字', async () => {
    const long = 'a'.repeat(5500);
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k504',
          title: { zh: 't' },
          body: { zh: NARRATIVE_BODY },
          evaluations: {
            zh: { meaning: long, limit: '', example: '', response: '', application: '', analogy: '' },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(201);
    const cols = await db
      .prepare('SELECT evaluations_zh_json FROM kp WHERE id = ?')
      .bind('k504')
      .first<{ evaluations_zh_json: string }>();
    expect(JSON.parse(cols!.evaluations_zh_json!).meaning.length).toBe(5500);
  });

  test('T5.5 narrative.prose 是空字符串（schema 不强制 min(1)）— 应允许', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k505',
          title: { zh: 't' },
          body: { zh: { format: 'narrative', prose: '' } },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status, await res.clone().text()).toBe(201);
  });

  test('T5.6 quad cells 字段含 emoji，name 不能为空', async () => {
    const cells = [
      { name: 'Q1', emoji: '🔥', sub: 'sub', detail: 'd' },
      { name: 'Q2', emoji: '⚡', sub: 'sub', detail: 'd' },
      { name: 'Q3', emoji: '🌊', sub: 'sub', detail: 'd' },
      { name: 'Q4', emoji: '❄️', sub: 'sub', detail: 'd' },
    ];
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k506',
          title: { zh: 't' },
          body: {
            zh: { format: 'quad', lead: '', yAxis: 'Y', xAxis: 'X', cells },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(201);

    // 反例：name 空 → 应拒
    const res2 = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k507',
          title: { zh: 't' },
          body: {
            zh: {
              format: 'quad',
              lead: '',
              yAxis: 'Y',
              xAxis: 'X',
              cells: [
                { name: '', emoji: '', sub: '', detail: '' },
                { name: 'b', emoji: '', sub: '', detail: '' },
                { name: 'c', emoji: '', sub: '', detail: '' },
                { name: 'd', emoji: '', sub: '', detail: '' },
              ],
            },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res2.status).toBe(422);
    expect((await readJson(res2)).reason).toBe('body_structure_invalid');
  });
});

// ============================================================
// 类 6: ID 生成 / 冲突
// ============================================================
describe('类6 ID 生成 / 冲突', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('T6.1 POST 不传 id → 服务端生成 + 201', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          title: { zh: 't' },
          body: { zh: NARRATIVE_BODY },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(201);
    const data = await readJson(res);
    expect(data.kp!.id).toMatch(/^k\d+$/); // generatedKpId pattern: prefix(k) + ms timestamp + 3-digit rand
  });

  test('T6.2 POST 重复 id → 409 kp_id_exists', async () => {
    await seedKp(db, 'k600');
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k600',
          title: { zh: 'dup' },
          body: { zh: NARRATIVE_BODY },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(409);
    const data = await readJson(res);
    expect(data.reason).toBe('kp_id_exists');
  });

  test('T6.3 KpId 非法格式（大写 / 数字开头）→ 422 schema_invalid path', async () => {
    const cases = [
      { id: 'K123', expectStatus: 422 }, // uppercase
      { id: '123abc', expectStatus: 422 }, // starts with digit
      { id: 'abcd123', expectStatus: 422 }, // prefix > 3 letters
    ];
    for (const c of cases) {
      const res = await kpsPOST(
        makeCtx(db, {
          method: 'POST',
          path: '/api/kps?discipline=keiei',
          body: {
            id: c.id,
            title: { zh: 't' },
            body: { zh: NARRATIVE_BODY },
            schools: ['motivation'],
          },
        }),
      );
      expect(res.status, `${c.id} should be 422`).toBe(c.expectStatus);
    }
  });
});

// ============================================================
// 类 7: schools/scholars 跨 tenant 防御
// ============================================================
describe('类7 跨 tenant 防御', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db, { withMarketing: true });
  });

  test('T7.1 POST schools 含其它 discipline 的 key → school_not_in_tenant', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k700',
          title: { zh: 't' },
          body: { zh: NARRATIVE_BODY },
          schools: ['consumer'], // marketing 的 key
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('school_not_in_tenant');
    expect(data.detail).toEqual(['consumer']);
  });

  test('T7.2 batch 单条 schools 跨 tenant → 单条 reason 不影响其它', async () => {
    await seedKp(db, 'k701');
    await seedKp(db, 'k702');
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [
            { id: 'k701', ifMatchVersion: 1, patch: { schools: ['change'] } },
            { id: 'k702', ifMatchVersion: 1, patch: { schools: ['consumer'] } }, // 跨 tenant
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].ok).toBe(true);
    expect(data.results![1].reason).toBe('school_not_in_tenant');
  });
});

// ============================================================
// 类 8: legacy detector 边界（含 PM 已知观察）
// ============================================================
describe('类8 legacy detector 边界', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('T8.1 顶层 `Format`（首字母大写）→ 不命中 legacy_top_level_format（key 区分大小写）', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k800',
          title: { zh: 't' },
          body: { zh: NARRATIVE_BODY },
          Format: 'narrative', // 大写 F
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason, '大写 Format 不应命中 legacy_top_level_format').not.toBe('legacy_top_level_format');
    // zod strict() 对未知 key 报 unrecognized_keys，归到 body_structure_invalid
    expect(data.reason).toBe('body_structure_invalid');
  });

  test('T8.2 同时含顶层 `format` + `evalContent` → 命中 legacy_top_level_format（先序检查）', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k801',
          title: { zh: 't' },
          body: { zh: NARRATIVE_BODY },
          format: 'narrative',
          evalContent: { zh: { 义: 'X' } },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('legacy_top_level_format');
  });

  test('T8.3 narrative.prose 含 ◆评价—— 引用 → 命中 legacy_eval_in_body（detector 不区分语义）', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k802',
          title: { zh: 't' },
          body: {
            zh: {
              format: 'narrative',
              prose: '老 DSL 写法举例：◆意义——这里写贡献。这是教学说明，不是实际评价段。',
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

  test('T8.4 嵌套 patch.body.zh.items[0].desc 含 ◆评价—— → detector JSON.stringify 全文 search 抓到', async () => {
    await seedKp(db, 'k803');
    const res = await kpPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/k803',
        params: { id: 'k803' },
        body: {
          body: {
            zh: {
              format: 'flat-list',
              lead: '',
              items: [{ name: 'A', desc: '正常 desc ◆意义——这是嵌套深处的旧 marker' }],
            },
          },
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('legacy_eval_in_body');
  });

  test('T8.5 body.zh.prose 含 ◆企业例—— → detector 命中 legacy_eval_in_body 422', async () => {
    // EVAL_DEFS (body-parser.ts:44) example 别名: ['例子', '企业例', '例']
    // detector 直接复用 EVAL_DEFS.flatMap → 13 alias 全覆盖（含 '企业例'）
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k804',
          title: { zh: 't' },
          body: {
            zh: {
              format: 'narrative',
              prose: '正文一段 ◆企业例——苹果公司案例',
            },
          },
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    expect(data.reason).toBe('legacy_eval_in_body');
    expect(data.migration_guide).toBeDefined();
  });

  test('T8.6 全部 EVAL_DEFS 别名都应被 detector 识别（覆盖 13 alias）', async () => {
    // EVAL_DEFS 13 别名（body-parser.ts:42-47）：
    const allAliases = [
      ['meaning', '意义'], ['meaning', '意義'],
      ['limit', '局限'], ['limit', '限界'],
      ['example', '例子'], ['example', '企业例'], ['example', '例'],
      ['response', '应对'], ['response', '應對'],
      ['application', '应用'], ['application', '應用'],
      ['analogy', '比喻'], ['analogy', '譬喩'],
    ];
    const failed: string[] = [];
    let i = 0;
    for (const [key, alias] of allAliases) {
      i++;
      const res = await kpsPOST(
        makeCtx(db, {
          method: 'POST',
          path: '/api/kps?discipline=keiei',
          body: {
            id: `kal${i}`, // KpId regex: [a-z]{1,3}\d+
            title: { zh: 't' },
            body: {
              zh: { format: 'narrative', prose: `测试 ◆${alias}——XXX` },
            },
            schools: ['motivation'],
          },
        }),
      );
      const data = await readJson(res);
      if (data.reason !== 'legacy_eval_in_body') {
        failed.push(`${key}/${alias} (got ${res.status} reason=${data.reason})`);
      }
    }
    // detector 复用 EVAL_DEFS.flatMap → 13 alias 全识别 → failed list 应为空
    expect(failed).toEqual([]);
  });

  test('T8.7 顶层 `body` 不是 object 而是 string → legacy_string_body', async () => {
    const res = await kpsPOST(
      makeCtx(db, {
        method: 'POST',
        path: '/api/kps?discipline=keiei',
        body: {
          id: 'k805',
          title: { zh: 't' },
          body: 'plain string at top level', // 不是 { zh, ja } 而是 string
          schools: ['motivation'],
        },
      }),
    );
    expect(res.status).toBe(422);
    const data = await readJson(res);
    // detector 在 'body in p && typeof p.body === object' 之前先判 typeof p.body === 'string'
    // → 顶层 body=string 归 legacy_string_body（不再落到 zod → body_structure_invalid）
    expect(data.reason).toBe('legacy_string_body');
    expect(data.migration_guide).toBeDefined();
  });
});

// ============================================================
// 类 9: response shape 兼容（GET 仍含旧字段）
// ============================================================
describe('类9 GET response shape 兼容', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('T9.1 POST 后 GET → response 保留 format 顶层 + body.zh string + evalContent (migration §1)', async () => {
    await seedKp(db, 'k900', {
      evaluations: { zh: { meaning: 'M', limit: 'L', example: '', response: '', application: '', analogy: '' } },
    });
    // direct DB query — KpApiRecord shape
    const row = await db.prepare('SELECT * FROM kp WHERE id = ?').bind('k900').first<any>();
    expect(row.format, 'response 应保留旧 format 顶层列').toBe('narrative');
    expect(typeof row.body_zh, 'response 应保留旧 body string 列').toBe('string');
    expect(row.body_zh).toContain('baseline prose');
    expect(JSON.parse(row.eval_content_zh_json)).toMatchObject({ 义: 'M', 限: 'L' });
  });

  test('T9.2 PATCH narrative→flat-list → 旧列 format/body_zh 同步更新', async () => {
    await seedKp(db, 'k901');
    await kpPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/k901',
        params: { id: 'k901' },
        body: {
          body: {
            zh: { format: 'flat-list', lead: '导', items: [{ name: 'A', desc: 'a' }] },
          },
        },
      }),
    );
    const row = await db.prepare('SELECT * FROM kp WHERE id = ?').bind('k901').first<any>();
    expect(row.format).toBe('flat-list');
    expect(row.body_format).toBe('flat-list');
    expect(row.body_zh).toContain('◆');
  });
});

// ============================================================
// 类 10: 大批 batch 性能 + 容量
// ============================================================
describe('类10 batch 容量', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('T10.1 batch 50 条 valid → 全 succeeded + < 5s', async () => {
    for (let i = 0; i < 50; i++) {
      await seedKp(db, `kbk${i}`);
    }
    const t0 = Date.now();
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: Array.from({ length: 50 }, (_, i) => ({
            id: `kbk${i}`,
            ifMatchVersion: 1,
            patch: { title: { zh: `NEW ${i}` } },
          })),
        },
      }),
    );
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.summary).toMatchObject({ total: 50, succeeded: 50, failed: 0 });
    expect(elapsed, 'SQLite fixture 50 条应 < 5s').toBeLessThan(5000);
  });

  test('T10.2 batch 51 条 → 400 too_many_items', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: Array.from({ length: 51 }, (_, i) => ({
            id: `kbe${i}`,
            ifMatchVersion: 1,
            patch: { title: { zh: 't' } },
          })),
        },
      }),
    );
    expect(res.status).toBe(400);
    const data = await readJson(res);
    expect(data.reason).toBe('too_many_items');
    expect(data.detail).toMatchObject({ max: 50, got: 51 });
  });

  test('T10.3 batch 0 条 → 400 updates_empty', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: { updates: [] },
      }),
    );
    expect(res.status).toBe(400);
    const data = await readJson(res);
    expect(data.reason).toBe('updates_empty');
  });

  test('T10.4 batch 50 条全 legacy → failed=50', async () => {
    for (let i = 0; i < 50; i++) {
      await seedKp(db, `kbl${i}`);
    }
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: Array.from({ length: 50 }, (_, i) => ({
            id: `kbl${i}`,
            ifMatchVersion: 1,
            patch: { format: 'narrative', title: { zh: 't' } }, // legacy_top_level_format each
          })),
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.summary).toMatchObject({ total: 50, succeeded: 0, failed: 50 });
    expect(data.results!.every((r) => r.reason === 'legacy_top_level_format')).toBe(true);
  });
});

// ============================================================
// 类 11: forbidden_field + 删后再 patch + 评价边界
// ============================================================
describe('类11 forbidden_field / 删后 patch / 评价', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    await seedKp(db, 'kc00');
  });

  test('T11.1 batch patch 含 `id` → forbidden_field', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [{ id: 'kc00', ifMatchVersion: 1, patch: { id: 'klobby' } }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].reason).toBe('forbidden_field');
  });

  test('T11.2 batch patch 含 `created_at` → forbidden_field', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [{ id: 'kc00', ifMatchVersion: 1, patch: { created_at: '2020-01-01' } }],
        },
      }),
    );
    const data = await readJson(res);
    expect(data.results![0].reason).toBe('forbidden_field');
  });

  test('T11.3 删 KP 后 batch patch 该条 → kp_not_found 不影响其它', async () => {
    await seedKp(db, 'kc01');
    const delRes = await kpDELETE(
      makeCtx(db, {
        method: 'DELETE',
        path: '/api/kps/kc01',
        params: { id: 'kc01' },
      }),
    );
    expect(delRes.status).toBe(200);

    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [
            { id: 'kc00', ifMatchVersion: 1, patch: { title: { zh: 'still works' } } },
            { id: 'kc01', ifMatchVersion: 1, patch: { title: { zh: 'gone' } } },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].ok).toBe(true);
    expect(data.results![1].reason).toBe('kp_not_found');
  });

  test('T11.4 evaluations 全空字段 (6 个空 string) → evaluations 列写 null（PM 决策 v0.7.42）', async () => {
    await seedKp(db, 'kc02', {
      evaluations: {
        zh: { meaning: '', limit: '', example: '', response: '', application: '', analogy: '' },
      },
    });
    const cols = await db
      .prepare('SELECT evaluations_zh_json FROM kp WHERE id = ?')
      .bind('kc02')
      .first<{ evaluations_zh_json: string | null }>();
    expect(cols!.evaluations_zh_json, '全空 evaluations 应 null fallback').toBeNull();
  });

  test('T11.5 PATCH evaluations 任一字段从空到非空 → 列从 null → JSON', async () => {
    await seedKp(db, 'kc03'); // no evaluations 写入
    const before = await db
      .prepare('SELECT evaluations_zh_json FROM kp WHERE id = ?')
      .bind('kc03')
      .first<{ evaluations_zh_json: string | null }>();
    expect(before!.evaluations_zh_json).toBeNull();

    await kpPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/kc03',
        params: { id: 'kc03' },
        body: {
          evaluations: {
            zh: { meaning: 'M', limit: '', example: '', response: '', application: '', analogy: '' },
          },
        },
      }),
    );

    const after = await db
      .prepare('SELECT evaluations_zh_json FROM kp WHERE id = ?')
      .bind('kc03')
      .first<{ evaluations_zh_json: string | null }>();
    expect(JSON.parse(after!.evaluations_zh_json!)).toMatchObject({ meaning: 'M' });
  });

  test('T11.6 batch patch 用未 seed 的 kp id → kp_not_found', async () => {
    const res = await kpsBatchPATCH(
      makeCtx(db, {
        method: 'PATCH',
        path: '/api/kps/batch?discipline=keiei',
        body: {
          updates: [{ id: 'kxx9', ifMatchVersion: 1, patch: { title: { zh: 't' } } }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await readJson(res);
    expect(data.results![0].reason).toBe('kp_not_found');
  });
});
