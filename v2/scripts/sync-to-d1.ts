/**
 * data/ JSON 文件 → D1 SQL 同步脚本
 *
 * 输出一个 SQL 文件（默认 .wrangler/sync.sql），随后用：
 *   wrangler d1 execute management-study-v2 --remote --file=.wrangler/sync.sql
 * 由 GitHub Actions 跑（见 .github/workflows/deploy-v2.yml）。
 *
 * 策略：wipe-and-reload（删全表 + 重新 INSERT）
 *   - 优点：简单、永远是最终一致；删除的 KP 自动消失
 *   - 缺点：每次 sync 时间 = O(N)。513 KP ~500ms，能接受
 *   - 增量优化（按 updated_at diff）留到 KP 涨到 5000+ 时再做
 *
 * 用法（本地干跑生成 SQL 但不执行）：
 *   pnpm sync:d1
 *   cat .wrangler/sync.sql  # 检查输出
 *
 * 用法（CI 实际同步）：
 *   pnpm sync:d1 && wrangler d1 execute management-study-v2 --remote --file=.wrangler/sync.sql
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Kp, School, Scholar, Discipline, type Kp as KpT, type School as SchoolT, type Scholar as ScholarT, type Discipline as DisciplineT } from '../src/schemas/index.js';

// ============================================================
// 路径
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = resolve(__dirname, '..');
const DATA_ROOT = join(V2_ROOT, 'data');
const OUT_SQL = process.env.SYNC_OUT ?? join(V2_ROOT, '.wrangler', 'sync.sql');
const COMMIT_SHA = process.env.GITHUB_SHA ?? 'local-dev';

// ============================================================
// 1. Load + validate
// ============================================================

console.log('→ Loading data/ JSON files...');

const disciplines: DisciplineT[] = [];
const schools: SchoolT[] = [];
const scholars: ScholarT[] = [];
const kps: KpT[] = [];

if (!existsSync(DATA_ROOT)) {
  console.error(`✗ data/ not found at ${DATA_ROOT}. Run pnpm migrate:from-v1 first.`);
  process.exit(1);
}

for (const discKey of readdirSync(DATA_ROOT)) {
  const discDir = join(DATA_ROOT, discKey);
  if (!statSync(discDir).isDirectory()) continue;

  // discipline.json
  const discFile = join(discDir, 'discipline.json');
  if (!existsSync(discFile)) {
    console.warn(`  ! ${discKey}/ has no discipline.json, skipping`);
    continue;
  }
  const disc = Discipline.parse(JSON.parse(readFileSync(discFile, 'utf-8')));
  disciplines.push(disc);

  // schools/
  const schDir = join(discDir, 'schools');
  if (existsSync(schDir)) {
    for (const f of readdirSync(schDir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const sch = School.parse(JSON.parse(readFileSync(join(schDir, f), 'utf-8')));
      schools.push(sch);
    }
  }

  // scholars/
  const scDir = join(discDir, 'scholars');
  if (existsSync(scDir)) {
    for (const f of readdirSync(scDir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const sc = Scholar.parse(JSON.parse(readFileSync(join(scDir, f), 'utf-8')));
      scholars.push(sc);
    }
  }

  // kp/
  const kpDir = join(discDir, 'kp');
  if (existsSync(kpDir)) {
    for (const f of readdirSync(kpDir)) {
      if (!f.endsWith('.json') || f.startsWith('_') || f.includes('.example.')) continue;
      const kp = Kp.parse(JSON.parse(readFileSync(join(kpDir, f), 'utf-8')));
      kps.push(kp);
    }
  }
}

console.log(`  ✓ ${disciplines.length} disciplines / ${schools.length} schools / ${scholars.length} scholars / ${kps.length} KPs`);

// ============================================================
// 2. Cross-reference 校验（防 dangling reference）
// ============================================================

console.log('→ Cross-reference check...');

const schoolKeys = new Set(schools.map((s) => s.key));
const scholarKeys = new Set(scholars.map((s) => s.key));
const kpIds = new Set(kps.map((k) => k.id));

const errors: string[] = [];

for (const kp of kps) {
  for (const sk of kp.schools) {
    if (!schoolKeys.has(sk)) errors.push(`KP ${kp.id} references missing school "${sk}"`);
  }
  for (const sc of kp.scholars) {
    if (!scholarKeys.has(sc)) errors.push(`KP ${kp.id} references missing scholar "${sc}"`);
  }
}
for (const school of schools) {
  for (const cid of school.concepts) {
    if (!kpIds.has(cid)) errors.push(`School ${school.key}.concepts references missing KP "${cid}"`);
  }
}
for (const scholar of scholars) {
  for (const sk of scholar.schools) {
    if (!schoolKeys.has(sk)) errors.push(`Scholar ${scholar.key}.schools references missing school "${sk}"`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} cross-ref errors:`);
  for (const e of errors.slice(0, 20)) console.error(`    ${e}`);
  if (errors.length > 20) console.error(`    ... and ${errors.length - 20} more`);
  process.exit(1);
}
console.log('  ✓ all cross-refs valid');

// ============================================================
// 3. 生成 SQL
// ============================================================

console.log('→ Generating SQL...');

/** SQL 字符串字面量转义：替换 ' → '' */
function q(v: string | undefined | null): string {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** 安全 JSON 字符串 → SQL literal */
function jq(obj: unknown): string {
  return q(JSON.stringify(obj));
}

const sqlLines: string[] = [];

// 头部：D1 不支持 SQL BEGIN TRANSACTION（要用 JS state.storage.transaction()）。
// wrangler d1 execute --file 会把所有 statement 包成一个 batch atomic 提交，所以
// 不需要显式 transaction。foreign_keys 也是默认 OFF（SQLite default）。
sqlLines.push('-- Auto-generated by scripts/sync-to-d1.ts. DO NOT EDIT.');
sqlLines.push(`-- Source commit: ${COMMIT_SHA}`);
sqlLines.push(`-- Generated at: ${new Date().toISOString()}`);
sqlLines.push('');

// Wipe — 顺序：先关联表 + FTS，后基础表（外键安全）
sqlLines.push('-- Wipe content tables (user/session/etc untouched)');
sqlLines.push('DELETE FROM kp_fts;');
sqlLines.push('DELETE FROM kp_school;');
sqlLines.push('DELETE FROM kp_scholar;');
sqlLines.push('DELETE FROM scholar_school;');
sqlLines.push('DELETE FROM kp;');
sqlLines.push('DELETE FROM scholar;');
sqlLines.push('DELETE FROM school;');
sqlLines.push('DELETE FROM discipline;');
sqlLines.push('');

// === Disciplines ===
sqlLines.push('-- Disciplines');
for (const d of disciplines) {
  sqlLines.push(
    `INSERT INTO discipline (key, title_zh, title_en, title_ja, tagline_zh, tagline_ja, accent, themes_json, created_at, updated_at) VALUES (` +
    `${q(d.key)}, ${q(d.title.zh)}, ${q(d.title.en)}, ${q(d.title.ja)}, ` +
    `${q(d.tagline?.zh)}, ${q(d.tagline?.ja)}, ${q(d.accent)}, ${jq(d.themes)}, ` +
    `${q(d.createdAt)}, ${q(d.updatedAt)});`
  );
}
sqlLines.push('');

// === Schools ===
sqlLines.push('-- Schools');
for (const s of schools) {
  sqlLines.push(
    `INSERT INTO school (key, discipline, title_zh, title_en, title_ja, era, summary_zh, summary_ja, theme_key, accent, created_at, updated_at) VALUES (` +
    `${q(s.key)}, ${q(s.discipline)}, ${q(s.title.zh)}, ${q(s.title.en)}, ${q(s.title.ja)}, ` +
    `${q(s.era)}, ${q(s.summary.zh)}, ${q(s.summary.ja)}, ${q(s.themeKey)}, ${q(s.accent)}, ` +
    `${q(s.createdAt)}, ${q(s.updatedAt)});`
  );
}
sqlLines.push('');

// === Scholars ===
sqlLines.push('-- Scholars');
for (const sc of scholars) {
  sqlLines.push(
    `INSERT INTO scholar (key, discipline, name_zh, name_en, name_ja, contribution_zh, contribution_ja, lifespan, institution, nobel_year, nobel_detail, created_at, updated_at) VALUES (` +
    `${q(sc.key)}, ${q(sc.discipline)}, ${q(sc.name.zh)}, ${q(sc.name.en)}, ${q(sc.name.ja)}, ` +
    `${q(sc.contribution.zh)}, ${q(sc.contribution.ja)}, ${q(sc.lifespan)}, ${q(sc.institution)}, ` +
    `${q(sc.nobel?.year)}, ${q(sc.nobel?.detail)}, ${q(sc.createdAt)}, ${q(sc.updatedAt)});`
  );
}
sqlLines.push('');

// === Scholar ↔ School ===
sqlLines.push('-- scholar_school');
for (const sc of scholars) {
  sc.schools.forEach((sk, i) => {
    if (!schoolKeys.has(sk)) return;
    sqlLines.push(`INSERT INTO scholar_school (scholar_key, school_key, position) VALUES (${q(sc.key)}, ${q(sk)}, ${i});`);
  });
}
sqlLines.push('');

// === KPs ===
sqlLines.push('-- KPs');
for (const k of kps) {
  sqlLines.push(
    `INSERT INTO kp (id, discipline, year, title_zh, title_en, title_ja, body_zh, body_ja, tags_json, format, created_at, updated_at) VALUES (` +
    `${q(k.id)}, ${q(k.discipline)}, ${q(k.year)}, ${q(k.title.zh)}, ${q(k.title.en)}, ${q(k.title.ja)}, ` +
    `${q(k.body.zh)}, ${q(k.body.ja)}, ${jq(k.tags)}, ${q(k.format)}, ${q(k.createdAt)}, ${q(k.updatedAt)});`
  );
}
sqlLines.push('');

// === KP ↔ School（用 school.concepts 顺序优先；fallback 到 KP.schools 顺序） ===
sqlLines.push('-- kp_school');
const kpSchoolEmitted = new Set<string>();
for (const school of schools) {
  school.concepts.forEach((kpId, position) => {
    if (!kpIds.has(kpId)) return;
    const k = `${kpId}|${school.key}`;
    if (kpSchoolEmitted.has(k)) return;
    kpSchoolEmitted.add(k);
    sqlLines.push(`INSERT INTO kp_school (kp_id, school_key, position) VALUES (${q(kpId)}, ${q(school.key)}, ${position});`);
  });
}
// Fallback：KP.schools 里的学派但 school.concepts 没列的（v1 数据偶有不同步）
for (const kp of kps) {
  kp.schools.forEach((sk, i) => {
    if (!schoolKeys.has(sk)) return;
    const k = `${kp.id}|${sk}`;
    if (kpSchoolEmitted.has(k)) return;
    kpSchoolEmitted.add(k);
    sqlLines.push(`INSERT INTO kp_school (kp_id, school_key, position) VALUES (${q(kp.id)}, ${q(sk)}, ${1000 + i});`);
  });
}
sqlLines.push('');

// === KP ↔ Scholar ===
sqlLines.push('-- kp_scholar');
for (const kp of kps) {
  kp.scholars.forEach((scKey, i) => {
    if (!scholarKeys.has(scKey)) return;
    sqlLines.push(`INSERT INTO kp_scholar (kp_id, scholar_key, position) VALUES (${q(kp.id)}, ${q(scKey)}, ${i});`);
  });
}
sqlLines.push('');

// === FTS5 索引（rebuild from kp 表） ===
sqlLines.push('-- FTS5');
sqlLines.push(`INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja) `
  + `SELECT id, title_zh, COALESCE(title_en, ''), COALESCE(title_ja, ''), body_zh, COALESCE(body_ja, '') FROM kp;`);
sqlLines.push('');

// === sync_log ===
sqlLines.push('-- Sync log');
sqlLines.push(
  `INSERT INTO sync_log (ran_at, commit_sha, kp_count, school_count, scholar_count, status) VALUES (` +
  `${q(new Date().toISOString())}, ${q(COMMIT_SHA)}, ${kps.length}, ${schools.length}, ${scholars.length}, 'success');`
);
sqlLines.push('');

// (no COMMIT — wrangler batches automatically)

// ============================================================
// 4. 写文件
// ============================================================

mkdirSync(dirname(OUT_SQL), { recursive: true });
writeFileSync(OUT_SQL, sqlLines.join('\n') + '\n', 'utf-8');

const sizeKb = (sqlLines.join('\n').length / 1024).toFixed(1);
console.log('');
console.log('=== Sync SQL generated ===');
console.log(`  File: ${OUT_SQL}`);
console.log(`  Size: ${sizeKb} KB, ${sqlLines.length} statements`);
console.log('');
console.log('Next:');
console.log(`  Local:  wrangler d1 execute management-study-v2 --local  --file=${OUT_SQL}`);
console.log(`  Remote: wrangler d1 execute management-study-v2 --remote --file=${OUT_SQL}`);
