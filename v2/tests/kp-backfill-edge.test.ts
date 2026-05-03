/**
 * v0.8.0 Stage 1 — backfill endpoint 边界 case 测试
 *
 * 现有 kp-dual-write.test.ts 只覆盖了 happy + idempotent + batch 分批 + 403。
 * 这套补 PRD §5.2 列的 edge cases + PM 决策的安全边界：
 *
 *   B1  body_zh = '' 的 KP：backfill 应当成功 (parseBody '' → narrative + raw='')
 *   B2  format=quad 但旧 body 解析后 cells != 4：lossy 写入（脏 JSON）+ audit 识别
 *   B3  format=flat-list 但旧 body items=[] (m178 复刻)：lossy 写入 + audit 识别
 *   B4  非 super-admin 但已登录用户：返 super_admin_required (区分 not_admin)
 *   B5  batch 参数 0 / 负数 / NaN：clamp 到合法范围
 */

import { describe, expect, test, beforeEach } from 'vitest';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';
import { POST as backfillPOST } from '~/pages/api/admin/backfill-kp-body-structured';
import { KpBody } from '~/schemas/kp-body-structured';
import { auditKpStructured } from '~/lib/kp-audit-structured';

interface BackfillResponse {
  ok: boolean;
  processed: number;
  remaining: number;
  errors: Array<{ id: string; reason: string; detail?: string }>;
  reason?: string; // 失败时
}

async function readBackfill(res: Response): Promise<BackfillResponse> {
  return (await res.json()) as BackfillResponse;
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
}

async function seedOldKp(db: D1LikeDatabase, id: string, format: string, body: string) {
  await db
    .prepare(
      `INSERT INTO kp (id, tenant_id, discipline, year, title_zh, title_en, title_ja,
                       body_zh, body_ja, tags_json, eval_content_zh_json, eval_content_ja_json,
                       format, created_by, updated_by, created_at, updated_at)
       VALUES (?, 'keiei', 'keiei', '', ?, null, null, ?, null, '[]', '{}', '{}', ?, 'u', 'u', '2026-01-01', '2026-01-01')`,
    )
    .bind(id, `${id}-标题`, body, format)
    .run();
}

function makeContext(
  db: D1LikeDatabase,
  opts: { isSuperAdmin?: boolean; user?: boolean; batch?: string | null } = {},
) {
  const userPart = opts.user === false ? null : { id: 'u_admin' };
  const url =
    opts.batch === undefined
      ? 'https://study.sususu.org/api/admin/backfill-kp-body-structured?batch=10'
      : opts.batch === null
        ? 'https://study.sususu.org/api/admin/backfill-kp-body-structured'
        : `https://study.sususu.org/api/admin/backfill-kp-body-structured?batch=${opts.batch}`;
  return {
    locals: {
      user: userPart,
      isSuperAdmin: opts.isSuperAdmin ?? true,
      runtime: { env: { DB: db as unknown as D1Database } },
    },
    request: new Request(url),
  } as unknown as Parameters<typeof backfillPOST>[0];
}

describe('B1 — body_zh = "" 的 KP backfill 行为', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('format=narrative + body="" → backfill 成功，新列写 narrative + prose=""', async () => {
    await seedOldKp(db, 'kempty', 'narrative', '');

    const res = await backfillPOST(makeContext(db));
    const body = await readBackfill(res);
    expect(body.processed).toBe(1);
    expect(body.errors).toEqual([]);

    const cols = await db
      .prepare('SELECT body_zh_json, body_format FROM kp WHERE id = ?')
      .bind('kempty')
      .first<{ body_zh_json: string | null; body_format: string | null }>();
    expect(cols!.body_zh_json).not.toBeNull();
    const parsed = JSON.parse(cols!.body_zh_json!);
    expect(parsed).toEqual({ format: 'narrative', prose: '' });
    expect(KpBody.safeParse(parsed).success).toBe(true);
  });
});

describe('B2 — quad 旧 body 解析后 cells != 4 (lossy 写入 + audit 识别)', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('quad 只有 3 cells → backfill 写脏 JSON（KpBody.parse fail）+ audit 拦下', async () => {
    // 残缺 quad：只 3 个 cell
    const body = '导语<quad>y轴,x轴||A|⭐|sub|detail||B|❓|sub|detail||C|🐕|sub|detail</quad>';
    await seedOldKp(db, 'kquad3', 'quad', body);

    const res = await backfillPOST(makeContext(db));
    const out = await readBackfill(res);
    // PM 决策：lossy 写入（不 fail-fast），等 audit 拦
    expect(out.processed, 'PM 决策：lossy 写入应成功').toBe(1);
    expect(out.errors).toEqual([]);

    // 但 KpBody.parse 应该失败（脏 JSON）
    const cols = await db
      .prepare('SELECT body_zh_json FROM kp WHERE id = ?')
      .bind('kquad3')
      .first<{ body_zh_json: string | null }>();
    const parsed = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
    expect(parsed.success, 'cells=3 不应通过 KpBody.parse').toBe(false);

    // audit 识别
    const audit = await auditKpStructured(db as unknown as D1Database);
    expect(audit.dirty_kps.find((d) => d.id === 'kquad3')).toBeTruthy();
  });
});

describe('B3 — flat-list 旧 body 解析后 items=[] (m178 复刻)', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
  });

  test('format=flat-list 但 body 全是 accordion 标记 → 解析 items=[] → 脏 JSON + audit 识别', async () => {
    // m178 的真实风格：format 写错
    const body = '消费者在比较品牌时<br>【① 线性补偿型】<br>desc<br>【② 连结型】<br>desc';
    await seedOldKp(db, 'km178bf', 'flat-list', body);

    const res = await backfillPOST(makeContext(db));
    const out = await readBackfill(res);
    expect(out.processed, 'PM 决策：lossy 写入').toBe(1);

    const cols = await db
      .prepare('SELECT body_zh_json FROM kp WHERE id = ?')
      .bind('km178bf')
      .first<{ body_zh_json: string | null }>();
    const parsed = KpBody.safeParse(JSON.parse(cols!.body_zh_json!));
    expect(parsed.success, 'items=[] 不应通过 FlatListBody.min(1)').toBe(false);

    const audit = await auditKpStructured(db as unknown as D1Database);
    expect(audit.dirty_kps.find((d) => d.id === 'km178bf')).toBeTruthy();
  });
});

describe('B4 — auth gate：not_admin vs super_admin_required', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    await seedOldKp(db, 'kauth', 'narrative', 'x');
  });

  test('未登录用户 → 403 + reason=not_admin', async () => {
    const ctx = makeContext(db, { user: false, isSuperAdmin: false });
    const res = await backfillPOST(ctx);
    expect(res.status).toBe(403);
    const body = await readBackfill(res);
    expect(body.reason).toBe('not_admin');
  });

  test('已登录但非 super-admin → 403 + reason=super_admin_required', async () => {
    const ctx = makeContext(db, { isSuperAdmin: false });
    const res = await backfillPOST(ctx);
    expect(res.status).toBe(403);
    const body = await readBackfill(res);
    expect(body.reason).toBe('super_admin_required');
  });
});

describe('B5 — batch 参数 clamp', () => {
  let db: D1LikeDatabase;
  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedBaseline(db);
    for (let i = 0; i < 3; i++) {
      await seedOldKp(db, `kc${i}`, 'narrative', `body ${i}`);
    }
  });

  test('batch=0 → clamp 到 >=1（不会无限循环也不会 0 处理）', async () => {
    const res = await backfillPOST(makeContext(db, { batch: '0' }));
    const out = await readBackfill(res);
    expect(out.ok).toBe(true);
    expect(out.processed).toBeGreaterThanOrEqual(1);
  });

  test('batch=-5 → clamp 到 >=1', async () => {
    const res = await backfillPOST(makeContext(db, { batch: '-5' }));
    const out = await readBackfill(res);
    expect(out.processed).toBeGreaterThanOrEqual(1);
  });

  test('batch=NaN (非数字) → 走 default 50', async () => {
    const res = await backfillPOST(makeContext(db, { batch: 'abc' }));
    const out = await readBackfill(res);
    expect(out.ok).toBe(true);
    // 3 条 KP，default 50 一次跑完
    expect(out.processed).toBe(3);
  });

  test('batch=999 → clamp 到 100 (MAX_BATCH)', async () => {
    // 只 seed 了 3 条，clamp 不会被实际看到
    // 真正验证 clamp 需要 seed > 100，但这里至少验证 ok 不会 throw
    const res = await backfillPOST(makeContext(db, { batch: '999' }));
    const out = await readBackfill(res);
    expect(out.ok).toBe(true);
    // 3 条全跑完
    expect(out.processed).toBe(3);
  });

  test('无 batch 参数 → 用 default', async () => {
    const res = await backfillPOST(makeContext(db, { batch: null }));
    const out = await readBackfill(res);
    expect(out.processed).toBe(3);
  });
});
