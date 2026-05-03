/**
 * v0.8.0 Stage 1+ — 双写漂移检测测试 (PRD §6.3 防线 2)
 *
 * PM 决策：
 *   - Stage 1 当 backfill 验收门禁（一次性跑，不接 cron）
 *   - Stage 4 才接定时任务
 *
 * 这套测试验证 lib/kp-drift-check.ts 的核心判断逻辑：
 *   C1  正常双写后 sample → 0 drift（happy）
 *   C2  故意 mutate 一条新列 → 漂移被检测出（red team）
 *   C3  evaluations drift 单独识别
 */

import { describe, expect, test, beforeEach } from 'vitest';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';
import { createKpRecord } from '~/lib/kp-api-store';
import { checkKpDrift } from '~/lib/kp-drift-check';

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
  await db
    .prepare(
      `INSERT INTO school (key, discipline, title_zh, title_en, title_ja, era, summary_zh, summary_ja, theme_key, accent, tags_json, created_at, updated_at)
       VALUES ('motivation', 'keiei', 'mot', null, null, '', '', null, 'org', '', '[]', '2026-01-01', '2026-01-01')`,
    )
    .run();
}

async function createCleanKp(db: D1LikeDatabase, id: string, body: string, format: string = 'narrative') {
  // v0.8.0：测试用旧 DSL 字符串表达 body，内部转新结构化 KpBody
  const { parseBody } = await import('~/lib/body-parser');
  const { parsedToStructured } = await import('~/lib/kp-body-helpers');
  const parsed = parseBody(body, format as Parameters<typeof parseBody>[1]);
  const structured = parsedToStructured(parsed);

  await createKpRecord(
    db as unknown as D1Database,
    TENANT,
    {
      id,
      title: { zh: id },
      body: { zh: structured },
      year: '',
      schools: ['motivation'],
      scholars: [],
      tags: [],
    },
    'u_test',
  );
}

describe('C1 — 正常双写后 0 drift', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('seed 5 条 narrative，全双写一致 → drifts=[]', async () => {
    for (let i = 0; i < 5; i++) {
      await createCleanKp(db, `kn${i}`, `narrative body ${i}`);
    }

    const report = await checkKpDrift(db as unknown as D1Database, 100);
    expect(report.sampled).toBe(5);
    expect(report.drifts, JSON.stringify(report.drifts)).toEqual([]);
    expect(report.skipped).toBe(0);
  });

  test('flat-list 双写一致 → 0 drift', async () => {
    await createCleanKp(db, 'kfl1', '导语<br>◆item A——desc A◆item B——desc B', 'flat-list');
    await createCleanKp(db, 'kfl2', '◆x——y◆z——w', 'flat-list');

    const report = await checkKpDrift(db as unknown as D1Database, 100);
    expect(report.drifts).toEqual([]);
  });

  test('混合 5 format 共 5 条 → 0 drift', async () => {
    await createCleanKp(db, 'mn', 'narrative', 'narrative');
    await createCleanKp(db, 'mfl', '◆a——b◆c——d', 'flat-list');
    await createCleanKp(
      db,
      'mac',
      '导语<br>【G1】<br>①n1——d1<br>②n2——d2',
      'accordion',
    );
    await createCleanKp(
      db,
      'mcm',
      '导语<compare>X|经济人|定义||Y|社会人|定义</compare>',
      'compare',
    );
    await createCleanKp(
      db,
      'mqd',
      '导语<quad>y,x||A|⭐|s|d||B|❓|s|d||C|🐕|s|d||D|💰|s|d</quad>',
      'quad',
    );

    const report = await checkKpDrift(db as unknown as D1Database, 100);
    expect(report.sampled).toBe(5);
    expect(report.drifts, JSON.stringify(report.drifts)).toEqual([]);
  });
});

describe('C2 — 红队：故意 mutate 一条新列 → drift 被检测', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('双写一条 → 直接改 body_zh_json 字段值 → 检测到 body_zh drift', async () => {
    await createCleanKp(db, 'kmut', 'orig narrative');

    // mutate：把新列改成不一样的值（模拟双写漂移）
    await db
      .prepare("UPDATE kp SET body_zh_json = ? WHERE id = ?")
      .bind(JSON.stringify({ format: 'narrative', prose: 'TAMPERED' }), 'kmut')
      .run();

    const report = await checkKpDrift(db as unknown as D1Database, 100);
    expect(report.drifts.length).toBe(1);
    expect(report.drifts[0].id).toBe('kmut');
    expect(report.drifts[0].field).toBe('body_zh');
    expect(report.drifts[0].detail).toContain('TAMPERED');
    expect(report.drifts[0].detail).toContain('orig narrative');
  });

  test('5 条全干净 + 1 条 mutate → 只 1 条进 drift 清单', async () => {
    for (let i = 0; i < 5; i++) {
      await createCleanKp(db, `kg${i}`, `clean ${i}`);
    }
    await createCleanKp(db, 'kbad', 'will be tampered');

    await db
      .prepare("UPDATE kp SET body_zh_json = ? WHERE id = ?")
      .bind(JSON.stringify({ format: 'narrative', prose: 'X' }), 'kbad')
      .run();

    const report = await checkKpDrift(db as unknown as D1Database, 100);
    expect(report.drifts.length).toBe(1);
    expect(report.drifts[0].id).toBe('kbad');
  });

  test('object key 顺序不影响 — {a:1,b:2} vs {b:2,a:1} 应视为相等', async () => {
    await createCleanKp(db, 'kord', '导语<br>◆name——desc', 'flat-list');

    // 取出当前新列，重排 key 顺序后写回
    const cur = await db
      .prepare('SELECT body_zh_json FROM kp WHERE id = ?')
      .bind('kord')
      .first<{ body_zh_json: string }>();
    const obj = JSON.parse(cur!.body_zh_json) as { format: string; lead: string; items: unknown[] };
    // 重写：key 顺序反过来
    const reordered = JSON.stringify({ items: obj.items, lead: obj.lead, format: obj.format });
    await db
      .prepare("UPDATE kp SET body_zh_json = ? WHERE id = ?")
      .bind(reordered, 'kord')
      .run();

    const report = await checkKpDrift(db as unknown as D1Database, 100);
    expect(report.drifts, 'key 顺序差异不应算 drift').toEqual([]);
  });
});

describe('C3 — evaluations drift 单独识别', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('evaluations_zh_json 与 eval_content_zh_json 不一致 → drift 字段=evaluations_zh', async () => {
    await createKpRecord(
      db as unknown as D1Database,
      TENANT,
      {
        id: 'kev',
        title: { zh: 'kev' },
        body: { zh: { format: 'narrative', prose: 'narrative' } },
        year: '',
        schools: ['motivation'],
        scholars: [],
        tags: [],
        evaluations: {
          zh: {
            meaning: 'orig meaning',
            limit: '',
            example: '',
            response: '',
            application: '',
            analogy: '',
          },
        },
      },
      'u_test',
    );

    // mutate evaluations_zh_json
    await db
      .prepare("UPDATE kp SET evaluations_zh_json = ? WHERE id = ?")
      .bind(
        JSON.stringify({
          meaning: 'TAMPERED',
          limit: '',
          example: '',
          response: '',
          application: '',
          analogy: '',
        }),
        'kev',
      )
      .run();

    const report = await checkKpDrift(db as unknown as D1Database, 100);
    const evalDrift = report.drifts.find((d) => d.field === 'evaluations_zh');
    expect(evalDrift, '应识别 evaluations_zh drift').toBeTruthy();
    expect(evalDrift!.id).toBe('kev');
  });
});
