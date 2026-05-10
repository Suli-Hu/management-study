/**
 * Seed mock study_session data for dev (v0.5.1)
 *
 * 在本地 / 远程 D1 写入 ~200 条假的 study_session 数据，用于 dev 环境
 * 看学习记录三视图（日志流 / 知识点排行 / 学派段位）的真实形态。
 *
 * 用法（在 v2/ 目录下）：
 *   pnpm seed:study-log              # 默认 --local
 *   pnpm seed:study-log -- --remote  # 远程 D1（生产）
 *   pnpm seed:study-log -- --user-email=husuli0623@gmail.com
 *   pnpm seed:study-log -- --clear   # 清空当前用户已有 study_session 再插入
 *
 * 数据特征（30 天分布）：
 *   - ~200 条 session
 *   - 覆盖 keiei 学科里 ~12 个有代表性的学派（让段位榜既有 A 也有 C）
 *   - 时长分布：多数 20-90min，少量 100-150min
 *   - rating 分布：3-5 星为主，2 星少
 *   - ~70% 有 note，~30% 空 note
 *
 * 注意：脚本要求 user 表里有目标 email 的行（先登录一次创建）。
 *       不会自动创建 user，避免误操作。
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = resolve(__dirname, '..', '..');
const KP_DIR = join(V2_ROOT, 'data', 'keiei', 'kp');
const TMP_DIR = join(V2_ROOT, '.wrangler', 'seed-study-log');

const DB_NAME = process.env.D1_DATABASE_NAME ?? 'management-study-v2';

// CLI flags
const args = process.argv.slice(2);
const mode = args.includes('--remote') ? '--remote' : '--local';
const clear = args.includes('--clear');
const emailArg = args.find((a) => a.startsWith('--user-email='));
const targetEmail = emailArg ? emailArg.split('=')[1] : 'husuli0623@gmail.com';

// ============================================================
// 1. 选 ~12 个目标学派（让段位榜分布合理）
// ============================================================

/**
 * 12 个有代表性的学派 keys（覆盖 OB / SM / OT 三大类，含早期+现代）。
 * 实际 KP 主学派分布（按 schools[0] 计），合计 ~135 KP — 足够 200 mock session 抽样。
 */
const TARGET_SCHOOLS = [
  'scientific',          // 古典科学管理 (6 KPs)
  'humanrel',            // 人际关系 (5 KPs)
  'change',              // 组织变革 (16 KPs)
  'behavioral',          // 行为学派 (19 KPs)
  'decision_theory',     // 决策理论 (14 KPs)
  'contingency',         // 权变 (8 KPs)
  'leadership_theory',   // 领导理论 (14 KPs)
  'planning_s',          // 战略规划 (19 KPs)
  'rbv',                 // 资源基础 (5 KPs)
  'learning_s',          // 学习型组织 (13 KPs)
  'institutional',       // 制度学派 (5 KPs)
  'positioning_s',       // 定位学派 (5 KPs)
];

// ============================================================
// 2. 扫描 KP 文件，找属于目标学派的 KP（取 schools[0] 主学派）
// ============================================================

interface KpFileShape {
  id: string;
  discipline: string;
  schools: string[];
}

function loadKpsByMainSchool(): Map<string, string[]> {
  const byMain = new Map<string, string[]>();
  const files = readdirSync(KP_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  for (const f of files) {
    try {
      const kp = JSON.parse(readFileSync(join(KP_DIR, f), 'utf-8')) as KpFileShape;
      if (!kp.schools?.[0]) continue;
      const main = kp.schools[0];
      if (!TARGET_SCHOOLS.includes(main)) continue;
      const list = byMain.get(main) ?? [];
      list.push(kp.id);
      byMain.set(main, list);
    } catch {
      // skip malformed file
    }
  }
  return byMain;
}

// ============================================================
// 3. 生成 mock sessions
// ============================================================

const NOTES_POOL = [
  '今天看了 30 分钟，主要在理解模型的核心定义，还有点模糊；下次补案例。',
  '复习一遍，已经能复述出来了。重点是和上一节对照。',
  '卡在公式推导，明天找参考书的附录。',
  '看了过去问，发现这个点 2018 年考过简答；准备一份 200 字答案。',
  '和昨天的内容关联起来，好像通了。',
  '完全空白，第一次读这个；做了简短笔记。',
  '听了 1.5 倍速的讲解视频，配合教材读完一节。',
  '尝试默写关键概念，错了两个，订正了。',
  '',
  '',
  '',
];

interface SessionRow {
  id: string;
  user_id: string;
  discipline: string;
  kp_id: string;
  date: string;
  start_time: string;
  duration_min: number;
  rating: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 简陋 nanoid（21 chars, base62）—— seed 用够了 */
function genId(prefix = ''): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return prefix + s;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 偏向中等时长的 normal-ish 分布 */
function randDuration(): number {
  const r = Math.random();
  if (r < 0.6) return randInt(20, 60); // 多数中等
  if (r < 0.85) return randInt(60, 100); // 长时段
  if (r < 0.95) return randInt(10, 20); // 短碎片
  return randInt(100, 150); // 偶发深度
}

/** 偏向 3-5 星的 rating 分布 */
function randRating(): number | null {
  const r = Math.random();
  if (r < 0.05) return null; // 跳过自评
  if (r < 0.15) return 2;
  if (r < 0.45) return 3;
  if (r < 0.80) return 4;
  return 5;
}

function generateSessions(userId: string, kpsByMain: Map<string, string[]>): SessionRow[] {
  const rows: SessionRow[] = [];
  const today = new Date();

  // 30 天，每天 3-10 条 session
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() - dayOffset);
    const dateStr = dayDate.toISOString().slice(0, 10);

    // 模拟"周末多学" + "偶尔休息日 0 条"
    const dow = dayDate.getDay();
    const baseCount = dow === 0 || dow === 6 ? randInt(5, 10) : randInt(3, 7);
    const sessionsToday = Math.random() < 0.1 ? 0 : baseCount; // 10% 概率休息日

    for (let i = 0; i < sessionsToday; i++) {
      // 选学派（7 个 active + 5 个 lazy 的分布，让段位榜差异明显）
      const schoolIdx = Math.random() < 0.7
        ? randInt(0, 6)
        : randInt(7, TARGET_SCHOOLS.length - 1);
      const schoolKey = TARGET_SCHOOLS[schoolIdx];
      const kpsInSchool = kpsByMain.get(schoolKey);
      if (!kpsInSchool || kpsInSchool.length === 0) continue;
      const kpId = pick(kpsInSchool);

      const startHour = randInt(8, 22);
      const startMin = randInt(0, 59);
      const startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
      const createdAt = new Date(dayDate);
      createdAt.setHours(startHour, startMin, 0, 0);

      rows.push({
        id: genId('ss_'),
        user_id: userId,
        discipline: 'keiei',
        kp_id: kpId,
        date: dateStr,
        start_time: startTime,
        duration_min: randDuration(),
        rating: randRating(),
        note: pick(NOTES_POOL) || null,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      });
    }

    if (rows.length > 220) break; // 200 ± 20
  }

  return rows;
}

// ============================================================
// 4. D1 IO（spawnSync wrangler）
// ============================================================

function runWranglerSql(sql: string): { stdout: string; status: number } {
  // 写到临时文件比 --command 更安全（避免 shell 转义）
  mkdirSync(TMP_DIR, { recursive: true });
  const tmpFile = join(TMP_DIR, `q-${Date.now()}.sql`);
  writeFileSync(tmpFile, sql);
  try {
    const res = spawnSync(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'execute', DB_NAME, mode, '--json', `--file=${tmpFile}`],
      { cwd: V2_ROOT, encoding: 'utf-8' },
    );
    return { stdout: res.stdout ?? '', status: res.status ?? 1 };
  } finally {
    try { rmSync(tmpFile); } catch { /* ignore */ }
  }
}

function lookupUserId(email: string): string {
  const escaped = email.replace(/'/g, "''");
  const { stdout, status } = runWranglerSql(
    `SELECT id FROM user WHERE email = '${escaped}' LIMIT 1;`,
  );
  if (status !== 0) {
    console.error(stdout);
    throw new Error(`Failed to query user table (mode=${mode}). Has migration applied?`);
  }
  // wrangler --json 输出格式：[{ results: [...], success: true, ...}]
  const parsed = JSON.parse(stdout);
  const results = parsed?.[0]?.results ?? [];
  if (results.length === 0) {
    throw new Error(
      `User not found: ${email}. Log in once via the app (${mode === '--remote' ? 'production' : 'local dev'}) to create the user row, then retry.`,
    );
  }
  return results[0].id as string;
}

function clearExistingSessions(userId: string): number {
  const { stdout, status } = runWranglerSql(
    `DELETE FROM study_session WHERE user_id = '${userId}';`,
  );
  if (status !== 0) {
    console.error(stdout);
    throw new Error('Failed to clear existing study_session rows');
  }
  const parsed = JSON.parse(stdout);
  return parsed?.[0]?.meta?.changes ?? 0;
}

function insertSessions(rows: SessionRow[]): number {
  // 拆 50 条一批 INSERT，避免单语句过长
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch
      .map((r) => {
        const note = r.note === null ? 'NULL' : `'${r.note.replace(/'/g, "''")}'`;
        const rating = r.rating === null ? 'NULL' : String(r.rating);
        return `('${r.id}','${r.user_id}','${r.discipline}','${r.kp_id}',NULL,'${r.date}','${r.start_time}',${r.duration_min},${rating},${note},'${r.created_at}','${r.updated_at}')`;
      })
      .join(',\n  ');
    const sql = `INSERT INTO study_session
  (id, user_id, discipline, kp_id, school_key, date, start_time, duration_min, rating, note, created_at, updated_at)
VALUES
  ${values};`;
    const { stdout, status } = runWranglerSql(sql);
    if (status !== 0) {
      console.error(stdout);
      throw new Error(`INSERT batch failed at row ${i}`);
    }
    inserted += batch.length;
    process.stdout.write(`  inserted ${inserted}/${rows.length}\r`);
  }
  process.stdout.write('\n');
  return inserted;
}

// ============================================================
// 5. main
// ============================================================

function main() {
  console.log(`=== seed-study-log (mode=${mode}, email=${targetEmail}) ===`);

  const kpsByMain = loadKpsByMainSchool();
  const totalKps = [...kpsByMain.values()].reduce((s, l) => s + l.length, 0);
  console.log(`Loaded ${totalKps} KPs across ${kpsByMain.size} target schools:`);
  for (const [school, kps] of kpsByMain) {
    console.log(`  ${school.padEnd(22)} ${kps.length} KPs`);
  }

  if (kpsByMain.size === 0) {
    console.error('No KPs found for target schools. Are you in v2/ root?');
    process.exit(1);
  }

  const userId = lookupUserId(targetEmail);
  console.log(`User: ${targetEmail} → ${userId}`);

  if (clear) {
    const removed = clearExistingSessions(userId);
    console.log(`Cleared ${removed} existing study_session rows`);
  }

  const rows = generateSessions(userId, kpsByMain);
  console.log(`Generated ${rows.length} mock sessions across 30 days`);

  const inserted = insertSessions(rows);
  console.log(`✓ Inserted ${inserted} study_session rows into ${DB_NAME} (${mode})`);
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
