/**
 * sync-resource integration test — 用真 SQLite (better-sqlite3) 跑全 migrations，
 * mock GitHub fetch，验证每个 resource 类型的 sync happy-path + 幂等重复执行。
 *
 * 这是会 catch 「ON CONFLICT 列集与 PRIMARY KEY 不匹配」的测试 —
 * 第一次 sync 走 INSERT 不会触发 ON CONFLICT，第二次相同 idOrKey 才进入
 * UPSERT 的 UPDATE 路径，SQLite 此时校验 conflict target 列集与 PK 列集一致。
 *
 * 在引入这个测试之前，d1-view-write.ts 的 ON CONFLICT(id) 与
 * view 表的 PRIMARY KEY (id, discipline) 错位 7 个版本无人察觉，
 * 因为 mockDb 测试只检查 SQL 字符串关键字，不真正运行 SQL。
 */

import { describe, expect, test, beforeEach, vi } from 'vitest';
import { createTestD1, type D1LikeDatabase } from './shims/d1-test-db';
import { applyAllMigrations } from './shims/apply-migrations';

vi.mock('~/lib/github', () => ({
  getFile: vi.fn(),
}));

import { syncResource } from '~/lib/sync-resource';
import { getFile } from '~/lib/github';

// fixture：每个 resource type 一份最小合法 JSON

// v0.8.10 Stage 5: body 切结构化 KpBody object，无顶层 format / evalContent。
const KP_FIXTURE = {
  id: 'k001',
  discipline: 'keiei',
  schools: ['motivation'],
  scholars: ['maslow'],
  year: '1943',
  title: { zh: '需求层次理论', ja: '欲求階層説', en: 'Hierarchy of Needs' },
  body: {
    zh: { format: 'narrative', prose: '正文内容' },
    ja: { format: 'narrative', prose: '本文' },
  },
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SCHOOL_FIXTURE = {
  key: 'motivation',
  discipline: 'keiei',
  title: { zh: '动机理论', en: 'Motivation Theory' },
  era: '20c',
  summary: { zh: '研究动机与需求的理论群。' },
  themeKey: 'organization',
  tags: [],
  concepts: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SCHOLAR_FIXTURE = {
  key: 'maslow',
  discipline: 'keiei',
  name: { zh: '马斯洛', en: 'Abraham Maslow' },
  schools: ['motivation'],
  contribution: { zh: '提出需求层次理论' },
  tags: [],
  kpsOrder: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const VIEW_FIXTURE = {
  id: 'default',
  discipline: 'keiei',
  name: '默认视图',
  jp: 'デフォルト',
  icon: '📚',
  description: '默认分组',
  flow: '',
  scope: 'public' as const,
  kind: 'manual' as const,
  isDefault: true,
  position: 0,
  groups: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const DISCIPLINE_FIXTURE = {
  key: 'keiei',
  title: { zh: '经营学', en: 'Management' },
  tagline: { zh: '管理学知识库' },
  tags: [],
  themes: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockGetFileReturns(json: unknown) {
  vi.mocked(getFile).mockResolvedValue({
    ok: true,
    data: { sha: 'abc123def', content: JSON.stringify(json) },
  });
}

async function seedDiscipline(db: D1LikeDatabase) {
  // discipline 行先种好 — view / school / scholar / kp 都引用它（FK off 也 seed，模拟 prod）
  await db
    .prepare(
      `INSERT INTO discipline (key, title_zh, title_en, title_ja, tagline_zh, tagline_ja, accent, tags_json, themes_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind('keiei', '经营学', null, null, null, null, '', '[]', '[]', '2026-01-01', '2026-01-01')
    .run();
}

describe('syncResource — 真 SQLite 集成测试', () => {
  let db: D1LikeDatabase;
  let env: { GITHUB_PAT: string; GITHUB_REPO: string; DB: D1Database };

  beforeEach(async () => {
    db = createTestD1();
    await applyAllMigrations(db);
    await seedDiscipline(db);
    env = { GITHUB_PAT: 'x', GITHUB_REPO: 'owner/repo', DB: db as unknown as D1Database };
    vi.clearAllMocks();
  });

  test('view: happy-path + 重复 sync 触发 ON CONFLICT UPDATE 路径不报错', async () => {
    mockGetFileReturns(VIEW_FIXTURE);

    const r1 = await syncResource(env, 'view', 'keiei', 'default');
    expect(r1.ok, `第一次 sync 失败: ${JSON.stringify(r1)}`).toBe(true);

    // 第二次 sync 相同 idOrKey — 走 ON CONFLICT (id, discipline) DO UPDATE。
    // 若 ON CONFLICT 列集与 PRIMARY KEY (id, discipline) 不一致，SQLite 此处直接报错。
    const r2 = await syncResource(env, 'view', 'keiei', 'default');
    expect(r2.ok, `第二次 sync (UPSERT UPDATE 路径) 失败: ${JSON.stringify(r2)}`).toBe(true);

    const row = await db
      .prepare('SELECT id, discipline, name FROM view WHERE id = ? AND discipline = ?')
      .bind('default', 'keiei')
      .first<{ id: string; discipline: string; name: string }>();
    expect(row).toEqual({ id: 'default', discipline: 'keiei', name: '默认视图' });
  });

  test('kp: happy-path + 重复 sync 走 UPSERT UPDATE 路径', async () => {
    mockGetFileReturns(KP_FIXTURE);

    const r1 = await syncResource(env, 'kp', 'keiei', 'k001');
    expect(r1.ok, `kp r1 fail: ${JSON.stringify(r1)}`).toBe(true);

    const r2 = await syncResource(env, 'kp', 'keiei', 'k001');
    expect(r2.ok, `kp r2 fail: ${JSON.stringify(r2)}`).toBe(true);

    const row = await db
      .prepare('SELECT id, title_zh FROM kp WHERE id = ?')
      .bind('k001')
      .first<{ id: string; title_zh: string }>();
    expect(row).toEqual({ id: 'k001', title_zh: '需求层次理论' });
  });

  test('school: happy-path + 重复 sync 走 UPSERT UPDATE 路径', async () => {
    mockGetFileReturns(SCHOOL_FIXTURE);

    const r1 = await syncResource(env, 'school', 'keiei', 'motivation');
    expect(r1.ok, `school r1 fail: ${JSON.stringify(r1)}`).toBe(true);

    const r2 = await syncResource(env, 'school', 'keiei', 'motivation');
    expect(r2.ok, `school r2 fail: ${JSON.stringify(r2)}`).toBe(true);

    const row = await db
      .prepare('SELECT key, title_zh FROM school WHERE key = ?')
      .bind('motivation')
      .first<{ key: string; title_zh: string }>();
    expect(row).toEqual({ key: 'motivation', title_zh: '动机理论' });
  });

  test('scholar: happy-path + 重复 sync 走 UPSERT UPDATE 路径（复合 PK）', async () => {
    mockGetFileReturns(SCHOLAR_FIXTURE);

    const r1 = await syncResource(env, 'scholar', 'keiei', 'maslow');
    expect(r1.ok, `scholar r1 fail: ${JSON.stringify(r1)}`).toBe(true);

    const r2 = await syncResource(env, 'scholar', 'keiei', 'maslow');
    expect(r2.ok, `scholar r2 fail: ${JSON.stringify(r2)}`).toBe(true);

    const row = await db
      .prepare('SELECT key, discipline, name_zh FROM scholar WHERE key = ? AND discipline = ?')
      .bind('maslow', 'keiei')
      .first<{ key: string; discipline: string; name_zh: string }>();
    expect(row).toEqual({ key: 'maslow', discipline: 'keiei', name_zh: '马斯洛' });
  });

  test('discipline: happy-path + 重复 sync 走 UPSERT UPDATE 路径', async () => {
    // discipline sync 自身 — 用一个新 key 避免与 seed 冲突
    const fix = { ...DISCIPLINE_FIXTURE, key: 'marketing', title: { zh: '市场营销学' } };
    mockGetFileReturns(fix);

    const r1 = await syncResource(env, 'discipline', 'marketing', 'marketing');
    expect(r1.ok, `discipline r1 fail: ${JSON.stringify(r1)}`).toBe(true);

    const r2 = await syncResource(env, 'discipline', 'marketing', 'marketing');
    expect(r2.ok, `discipline r2 fail: ${JSON.stringify(r2)}`).toBe(true);

    const row = await db
      .prepare('SELECT key, title_zh FROM discipline WHERE key = ?')
      .bind('marketing')
      .first<{ key: string; title_zh: string }>();
    expect(row).toEqual({ key: 'marketing', title_zh: '市场营销学' });
  });
});
