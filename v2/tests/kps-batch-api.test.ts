/**
 * Integration test for PATCH /api/kps/batch (v0.7.35).
 *
 * 测试 store 函数 patchKpsBatch 直接 + route 层做端到端关键 case。
 * 使用 v0.7.33 引入的 better-sqlite3 真 SQLite fixture。
 *
 * 必覆盖（PRD §7）：
 *   - happy path / mixed / version_conflict / forbidden_field /
 *     school_not_in_tenant / shallow merge title-body-evalContent /
 *     数组清空 vs 不传 / dryRun 不写 / dryRun + invalid 仍返 current_version /
 *     limit 51 / empty updates / 乐观锁链路 / N+1 校验避免
 */

import { describe, expect, test, beforeEach, vi } from 'vitest';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';
import {
  patchKpsBatch,
  mergeBatchPatch,
  computeDiff,
  type BatchItemSuccess,
  type BatchItemFailure,
} from '~/lib/kp-batch-store';
import type { KpApiRecord } from '~/lib/kp-api-store';
import type { KpEvaluationsLang } from '~/schemas/kp-body-structured';

type KpEvaluationsLangShape = KpEvaluationsLang;

const TENANT = { tenantId: 'keiei', discipline: 'keiei' } as const;
const USER_ID = 'u_test';

async function seedBaseline(db: D1LikeDatabase) {
  // discipline + tenant
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

  // schools
  for (const key of ['motivation', 'change', 'leadership']) {
    await db
      .prepare(
        `INSERT INTO school (key, discipline, title_zh, title_en, title_ja, era, summary_zh, summary_ja, theme_key, accent, tags_json, created_at, updated_at)
         VALUES (?, 'keiei', ?, null, null, '', '', null, 'org', '', '[]', '2026-01-01', '2026-01-01')`,
      )
      .bind(key, `${key}-学派`)
      .run();
  }
  // scholars
  for (const key of ['maslow', 'lewin']) {
    await db
      .prepare(
        `INSERT INTO scholar (key, discipline, name_zh, name_en, name_ja, contribution_zh, institution, accent, tags_json, created_at, updated_at)
         VALUES (?, 'keiei', ?, null, null, '', '', '', '[]', '2026-01-01', '2026-01-01')`,
      )
      .bind(key, `${key}-中文`)
      .run();
  }
}

async function seedKp(
  db: D1LikeDatabase,
  id: string,
  opts: {
    title?: { zh: string; ja?: string; en?: string };
    body?: { zh: string; ja?: string };
    schools?: string[];
    scholars?: string[];
    tags?: string[];
    evalContent?: { zh?: Record<string, string>; ja?: Record<string, string> };
    version?: number; // 默认 1
  } = {},
) {
  const t = opts.title ?? { zh: `${id}-标题`, ja: `${id}-タイトル`, en: `${id}-Title` };
  const b = opts.body ?? { zh: '正文', ja: '本文' };
  const tags = opts.tags ?? [];
  const evalZh = opts.evalContent?.zh ?? {};
  const evalJa = opts.evalContent?.ja ?? {};
  const schools = opts.schools ?? ['motivation'];
  const scholars = opts.scholars ?? [];

  // v0.8.0：seed 同时填新列 — KpBody narrative + 转 evaluations 英文 key
  const bodyZhJson = JSON.stringify({ format: 'narrative', prose: b.zh });
  const bodyJaJson = b.ja ? JSON.stringify({ format: 'narrative', prose: b.ja }) : null;
  const glyphMap: Record<string, keyof KpEvaluationsLangShape> = {
    义: 'meaning', 義: 'meaning',
    限: 'limit', 限界: 'limit',
    例: 'example', 例子: 'example',
    应: 'response', 応: 'response',
    用: 'application',
    喻: 'analogy', 喩: 'analogy',
  };
  const toEvalsLang = (dict: Record<string, string>): KpEvaluationsLangShape | null => {
    if (!dict || Object.keys(dict).length === 0) return null;
    const out: KpEvaluationsLangShape = {
      meaning: '', limit: '', example: '', response: '', application: '', analogy: '',
    };
    let any = false;
    for (const [k, v] of Object.entries(dict)) {
      const key = glyphMap[k];
      if (key && v) {
        out[key] = v;
        any = true;
      }
    }
    return any ? out : null;
  };
  const evalsZhLang = toEvalsLang(evalZh);
  const evalsJaLang = toEvalsLang(evalJa);

  await db
    .prepare(
      `INSERT INTO kp (id, tenant_id, discipline, year, title_zh, title_en, title_ja, body_zh, body_ja, tags_json,
                       eval_content_zh_json, eval_content_ja_json, format, created_by, updated_by, created_at, updated_at,
                       body_zh_json, body_ja_json, evaluations_zh_json, evaluations_ja_json, body_format)
       VALUES (?, 'keiei', 'keiei', '', ?, ?, ?, ?, ?, ?, ?, ?, 'narrative', 'u_seed', 'u_seed', '2026-01-01', '2026-01-01',
               ?, ?, ?, ?, 'narrative')`,
    )
    .bind(
      id,
      t.zh,
      t.en ?? null,
      t.ja ?? null,
      b.zh,
      b.ja ?? null,
      JSON.stringify(tags),
      JSON.stringify(evalZh),
      JSON.stringify(evalJa),
      bodyZhJson,
      bodyJaJson,
      evalsZhLang ? JSON.stringify(evalsZhLang) : null,
      evalsJaLang ? JSON.stringify(evalsJaLang) : null,
    )
    .run();

  for (let i = 0; i < schools.length; i++) {
    await db
      .prepare('INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)')
      .bind(id, schools[i], 1000 + i)
      .run();
  }
  for (let i = 0; i < scholars.length; i++) {
    await db
      .prepare('INSERT INTO kp_scholar (kp_id, scholar_discipline, scholar_key, position) VALUES (?, ?, ?, ?)')
      .bind(id, 'keiei', scholars[i], 1000 + i)
      .run();
  }
  // version 快照
  const ver = opts.version ?? 1;
  await db
    .prepare(
      `INSERT INTO knowledge_point_versions (kp_id, tenant_id, version, snapshot_json, edited_by, created_at)
       VALUES (?, 'keiei', ?, '{}', 'u_seed', '2026-01-01')`,
    )
    .bind(id, ver)
    .run();
}

async function getKpRow(db: D1LikeDatabase, id: string): Promise<{ title_zh: string; title_ja: string | null; title_en: string | null; body_zh: string; body_ja: string | null; tags_json: string; eval_content_zh_json: string; eval_content_ja_json: string } | null> {
  return db
    .prepare(
      'SELECT title_zh, title_ja, title_en, body_zh, body_ja, tags_json, eval_content_zh_json, eval_content_ja_json FROM kp WHERE id = ?',
    )
    .bind(id)
    .first();
}

async function getKpScholars(db: D1LikeDatabase, id: string): Promise<string[]> {
  const rs = await db
    .prepare('SELECT scholar_key FROM kp_scholar WHERE kp_id = ? ORDER BY position')
    .bind(id)
    .all<{ scholar_key: string }>();
  return (rs.results ?? []).map((r) => r.scholar_key);
}

describe('patchKpsBatch — 真 SQLite 集成测试', () => {
  let db: D1LikeDatabase;

  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    vi.clearAllMocks();
  });

  test('happy path: 3 条 patch 全成功 + version +1', async () => {
    await seedKp(db, 'k001');
    await seedKp(db, 'k002');
    await seedKp(db, 'k003');

    const updates = [
      { id: 'k001', ifMatchVersion: 1, patch: { title: { zh: 'k001-新中文' } } },
      { id: 'k002', ifMatchVersion: 1, patch: { year: '1980' } },
      { id: 'k003', ifMatchVersion: 1, patch: { tags: ['t1', 't2'] } },
    ];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );

    expect(out.summary).toEqual({ total: 3, succeeded: 3, failed: 0 });
    for (const r of out.results) {
      expect(r.ok).toBe(true);
      if (r.ok) expect((r as BatchItemSuccess).version).toBe(2);
    }

    const k1 = await getKpRow(db, 'k001');
    expect(k1!.title_zh).toBe('k001-新中文');
  });

  test('mixed: not_found + 成功条', async () => {
    await seedKp(db, 'k010');
    const updates = [
      { id: 'k010', ifMatchVersion: 1, patch: { year: '2020' } },
      { id: 'kNOPE', ifMatchVersion: 1, patch: { year: '2021' } },
    ];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    expect(out.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(out.results[0].ok).toBe(true);
    expect(out.results[1].ok).toBe(false);
    expect((out.results[1] as BatchItemFailure).reason).toBe('kp_not_found');
  });

  test('version_conflict: ifMatchVersion 错 → 该条 conflict', async () => {
    await seedKp(db, 'k020');
    const updates = [
      { id: 'k020', ifMatchVersion: 99, patch: { year: '2020' } }, // 错
    ];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    expect(out.results[0].ok).toBe(false);
    const f = out.results[0] as BatchItemFailure;
    expect(f.reason).toBe('version_conflict');
    expect(f.current_version).toBe(1);
    expect(f.expected_version).toBe(99);
  });

  test('forbidden_field: patch 含 id → forbidden_field + 返 current_version', async () => {
    await seedKp(db, 'k030');
    const updates = [
      { id: 'k030', ifMatchVersion: 1, patch: { id: 'kHACK' } as never },
    ];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    expect(out.results[0].ok).toBe(false);
    const f = out.results[0] as BatchItemFailure;
    expect(f.reason).toBe('forbidden_field');
    expect(f.current_version).toBe(1);
  });

  test('school_not_in_tenant: 不存在的 school → 返 invalid_keys + current_version', async () => {
    await seedKp(db, 'k040');
    const updates = [
      { id: 'k040', ifMatchVersion: 1, patch: { schools: ['motivation', 'nonexistent'] } },
    ];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    expect(out.results[0].ok).toBe(false);
    const f = out.results[0] as BatchItemFailure;
    expect(f.reason).toBe('school_not_in_tenant');
    expect(f.current_version).toBe(1);
    expect((f.detail as { invalid_keys: string[] }).invalid_keys).toEqual(['nonexistent']);
  });

  test('shallow merge title: 只传 zh，ja/en 保留', async () => {
    await seedKp(db, 'k050', {
      title: { zh: '旧中文', ja: '旧日文', en: 'Old EN' },
    });
    const updates = [
      { id: 'k050', ifMatchVersion: 1, patch: { title: { zh: '新中文' } } },
    ];
    await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    const row = await getKpRow(db, 'k050');
    expect(row!.title_zh).toBe('新中文');
    expect(row!.title_ja).toBe('旧日文');     // 保留
    expect(row!.title_en).toBe('Old EN');     // 保留
  });

  test('shallow merge body: 只传 zh KpBody，ja 保留', async () => {
    await seedKp(db, 'k060', { body: { zh: '旧正文', ja: '旧本文' } });
    const updates = [
      {
        id: 'k060',
        ifMatchVersion: 1,
        patch: { body: { zh: { format: 'narrative' as const, prose: '新正文' } } },
      },
    ];
    await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    const row = await getKpRow(db, 'k060');
    expect(row!.body_zh).toBe('新正文');
    expect(row!.body_ja).toBe('旧本文'); // 保留
  });

  test('shallow merge evaluations: 只传 zh，ja 保留；zh 内部 Record 整体替换', async () => {
    await seedKp(db, 'k070', {
      evalContent: {
        zh: { 义: '旧义', 限: '旧限', 例: '旧例' },
        ja: { 義: '旧義' },
      },
    });
    const updates = [
      {
        id: 'k070',
        ifMatchVersion: 1,
        patch: {
          evaluations: {
            zh: {
              meaning: '新义',
              response: '新应',
              limit: '',
              example: '',
              application: '',
              analogy: '',
            },
          },
        },
      },
    ];
    await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    // v0.8.0：用新列（structured evaluations）做 source of truth 校验，
    // 旧 eval_content_*_json 列已是 derived shape（中文 glyph + 6 字段全填 — 不再保 1:1 旧值）
    const newCols = await db
      .prepare('SELECT evaluations_zh_json, evaluations_ja_json FROM kp WHERE id = ?')
      .bind('k070')
      .first<{ evaluations_zh_json: string | null; evaluations_ja_json: string | null }>();
    const evalZhNew = JSON.parse(newCols!.evaluations_zh_json!);
    const evalJaNew = JSON.parse(newCols!.evaluations_ja_json!);
    // zh 整体替换：原 zh.{义,限,例} 没了，只剩 patch 写的 meaning + response（其它 4 个空字段）
    expect(evalZhNew).toEqual({
      meaning: '新义', response: '新应',
      limit: '', example: '', application: '', analogy: '',
    });
    // ja 保留：seed 时把 義→meaning 映射进了新列，整体保留（zh 整体替换不影响 ja）
    expect(evalJaNew).toEqual({
      meaning: '旧義',
      limit: '', example: '', response: '', application: '', analogy: '',
    });
  });

  test('数组清空: scholars: [] 写入后 KP 真无学者', async () => {
    await seedKp(db, 'k080', { scholars: ['maslow', 'lewin'] });
    const updates = [
      { id: 'k080', ifMatchVersion: 1, patch: { scholars: [] } },
    ];
    await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    expect(await getKpScholars(db, 'k080')).toEqual([]);
  });

  test('数组保持: 不传 scholars key，原值不变', async () => {
    await seedKp(db, 'k090', { scholars: ['maslow', 'lewin'] });
    const updates = [
      { id: 'k090', ifMatchVersion: 1, patch: { year: '2020' } }, // 没传 scholars
    ];
    await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    expect(await getKpScholars(db, 'k090')).toEqual(['maslow', 'lewin']);
  });

  test('dryRun: 返 diff 但 DB 真没改', async () => {
    await seedKp(db, 'k100', { title: { zh: '原' }, body: { zh: '原 body' } });
    const updates = [
      { id: 'k100', patch: { title: { zh: '新' } } }, // dryRun 可省 ifMatchVersion
    ];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: true, tenant: TENANT, userId: USER_ID },
    );
    expect(out.results[0].ok).toBe(true);
    const s = out.results[0] as BatchItemSuccess;
    expect(s.current_version).toBe(1);
    expect(s.diff).toEqual({
      'title.zh': { before: '原', after: '新' },
    });
    // DB 验证：title_zh 仍是 '原'
    const row = await getKpRow(db, 'k100');
    expect(row!.title_zh).toBe('原');
  });

  test('dryRun + invalid (forbidden_field): 仍返 current_version', async () => {
    await seedKp(db, 'k110');
    const updates = [{ id: 'k110', patch: { id: 'kHACK' } as never }];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: true, tenant: TENANT, userId: USER_ID },
    );
    const f = out.results[0] as BatchItemFailure;
    expect(f.reason).toBe('forbidden_field');
    expect(f.current_version).toBe(1);
  });

  test('乐观锁链路: 第 1 次成功 → version +1 → 第 2 次用旧 version 必 conflict', async () => {
    await seedKp(db, 'k120');
    // 第 1 次
    const out1 = await patchKpsBatch(
      db as unknown as D1Database,
      [{ id: 'k120', ifMatchVersion: 1, patch: { year: '2020' } }],
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    expect(out1.results[0].ok).toBe(true);
    expect((out1.results[0] as BatchItemSuccess).version).toBe(2);

    // 第 2 次仍然用旧 version 1 → conflict
    const out2 = await patchKpsBatch(
      db as unknown as D1Database,
      [{ id: 'k120', ifMatchVersion: 1, patch: { year: '2021' } }],
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    const f = out2.results[0] as BatchItemFailure;
    expect(f.reason).toBe('version_conflict');
    expect(f.current_version).toBe(2);
    expect(f.expected_version).toBe(1);
  });

  test('N+1 校验避免: 30 条 patch 改 schools 总查询 schools/scholars 表只 1 次', async () => {
    for (let i = 0; i < 30; i++) await seedKp(db, `kn${i}`);

    // 拦截 db.prepare 计数
    const originalPrepare = db.prepare.bind(db);
    let schoolQueries = 0;
    let scholarQueries = 0;
    db.prepare = (sql: string) => {
      if (/SELECT key FROM school/i.test(sql)) schoolQueries++;
      if (/SELECT key FROM scholar/i.test(sql)) scholarQueries++;
      return originalPrepare(sql);
    };

    const updates = Array.from({ length: 30 }, (_, i) => ({
      id: `kn${i}`,
      ifMatchVersion: 1,
      patch: { schools: ['change'] },
    }));
    await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );

    // 只 prefetch 一次
    expect(schoolQueries).toBe(1);
    expect(scholarQueries).toBe(1);
  });

  test('ifMatchVersion 必传 (非 dryRun): 缺失返 ifMatchVersion_required', async () => {
    await seedKp(db, 'k130');
    const updates = [
      { id: 'k130', patch: { year: '2020' } }, // 没传 ifMatchVersion
    ];
    const out = await patchKpsBatch(
      db as unknown as D1Database,
      updates,
      { dryRun: false, tenant: TENANT, userId: USER_ID },
    );
    const f = out.results[0] as BatchItemFailure;
    expect(f.reason).toBe('ifMatchVersion_required');
    expect(f.current_version).toBe(1);
  });

  test('mergeBatchPatch unit: 数组 [] = 真清空，不传 = 保持', () => {
    const current: KpApiRecord = {
      id: 'x', tenant_id: 'k', discipline: 'k', year: '', title: { zh: 'T' }, body: { zh: 'B' },
      tags: ['old'], format: 'narrative', schools: ['s1'], scholars: ['sc1'],
      created_by: null, updated_by: null, created_at: '', updated_at: '',
    };
    const currentS = {
      body: { zh: { format: 'narrative' as const, prose: 'B' } },
      evaluations: {},
    };

    const cleared = mergeBatchPatch(current, currentS, { tags: [] });
    expect(cleared.legacy.tags).toEqual([]); // 空数组真清空

    const kept = mergeBatchPatch(current, currentS, { year: '2020' });
    expect(kept.legacy.tags).toEqual(['old']); // 不传 = 保持
  });

  test('computeDiff unit: title.zh 改了，title.ja 没改 → diff 只列 title.zh', () => {
    const current: KpApiRecord = {
      id: 'x', tenant_id: 'k', discipline: 'k', year: '', title: { zh: '旧', ja: '保持' }, body: { zh: 'B' },
      tags: [], format: 'narrative', schools: [], scholars: [],
      created_by: null, updated_by: null, created_at: '', updated_at: '',
    };
    const merged: KpApiRecord = { ...current, title: { zh: '新', ja: '保持' } };
    const diff = computeDiff(current, merged);
    expect(diff).toEqual({ 'title.zh': { before: '旧', after: '新' } });
  });
});
