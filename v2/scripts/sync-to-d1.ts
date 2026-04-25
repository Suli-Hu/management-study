/**
 * data/ JSON 文件 → D1 SQL 同步脚本
 *
 * 输出一个 SQL 文件（默认 .wrangler/sync.sql），随后用：
 *   wrangler d1 execute management-study-v2 --remote --file=.wrangler/sync.sql
 * 由 GitHub Actions 跑（见 .github/workflows/deploy-v2.yml）。
 *
 * 策略：upsert + 孤儿清理（v0.3.4 修 A2）
 *   - 内容表（discipline/school/scholar/kp）用 ON CONFLICT DO UPDATE
 *     → 不 DELETE → 不触发 FK cascade → user_progress / user_note 保住
 *   - 关联表（kp_school/kp_scholar/scholar_school）/ FTS5 仍 wipe-reload
 *     → 它们内容完全由 JSON 决定且和 user 数据无关
 *   - 孤儿清理：learning 删掉的 KP，通过临时表 NOT IN 做 DELETE
 *     → 这是唯一一处会触发 cascade 的地方，但 user_note.kp_id 已在 migration 0005
 *       改为 SET NULL，笔记保留；user_progress 仍 CASCADE（进度跟 KP 走，合理）
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
const OUT_DIR = process.env.SYNC_OUT_DIR ?? join(V2_ROOT, '.wrangler', 'sync');
// 兼容旧 SYNC_OUT（已废弃）：若提供则单文件输出（仅本地干跑用）
const OUT_SQL_LEGACY = process.env.SYNC_OUT;
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
// v0.4.20：school.themeKey 必须对应 discipline.themes[].key（首页分组依赖此）
const themeKeysByDiscipline = new Map<string, Set<string>>();
for (const d of disciplines) {
  themeKeysByDiscipline.set(d.key, new Set(d.themes.map((t) => t.key)));
}
for (const school of schools) {
  const validThemes = themeKeysByDiscipline.get(school.discipline);
  if (!validThemes) {
    errors.push(`School ${school.key} references unknown discipline "${school.discipline}"`);
    continue;
  }
  if (!validThemes.has(school.themeKey)) {
    errors.push(`School ${school.key}.themeKey "${school.themeKey}" not in discipline.themes (有效值: ${[...validThemes].join(', ')})`);
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

// v0.4.14 分片 sync — 单 sync.sql 已 ~1MB 触发 wrangler workerd hash bug。
// 拆 5 个 shard，CI workflow 串行 execute。每片自带 header。
const sections: Record<string, string[]> = {
  '01_meta_wipe': [],
  '02_kp': [],
  '03_kp_joins': [],
  '04_fts': [],
  '05_log': [],
};
let cur: string[] = sections['01_meta_wipe'];
function setSection(k: keyof typeof sections) { cur = sections[k]; }
const sqlLines = {
  push(line: string) { cur.push(line); },
};

function header(title: string) {
  cur.push('-- Auto-generated by scripts/sync-to-d1.ts. DO NOT EDIT.');
  cur.push(`-- Section: ${title}`);
  cur.push(`-- Source commit: ${COMMIT_SHA}`);
  cur.push(`-- Generated at: ${new Date().toISOString()}`);
  cur.push('');
}
header('meta + wipe + discipline/school/scholar upsert');

// Wipe 只清理关联表 + FTS（它们和 user 数据无关、完全由 JSON 决定）。
// 内容表改 upsert，见下方。
sqlLines.push('-- Wipe join tables + FTS (user/session/etc untouched)');
sqlLines.push('DELETE FROM kp_fts;');
sqlLines.push('DELETE FROM kp_school;');
sqlLines.push('DELETE FROM kp_scholar;');
sqlLines.push('DELETE FROM scholar_school;');
sqlLines.push('');

/** 生成 ON CONFLICT DO UPDATE SET 子句（除 key 列外全部 overwrite） */
function updateSet(cols: string[], keyCol: string): string {
  return cols.filter((c) => c !== keyCol).map((c) => `${c}=excluded.${c}`).join(', ');
}

// === Disciplines (upsert) ===
sqlLines.push('-- Disciplines');
const discCols = ['key','title_zh','title_en','title_ja','tagline_zh','tagline_ja','accent','themes_json','created_at','updated_at'];
for (const d of disciplines) {
  sqlLines.push(
    `INSERT INTO discipline (${discCols.join(', ')}) VALUES (` +
    `${q(d.key)}, ${q(d.title.zh)}, ${q(d.title.en)}, ${q(d.title.ja)}, ` +
    `${q(d.tagline?.zh)}, ${q(d.tagline?.ja)}, ${q(d.accent)}, ${jq(d.themes)}, ` +
    `${q(d.createdAt)}, ${q(d.updatedAt)}) ` +
    `ON CONFLICT(key) DO UPDATE SET ${updateSet(discCols, 'key')};`
  );
}
sqlLines.push('');

// === Schools (upsert) ===
// v0.4.18：accent 强制由 themeKey 派生（SM/OT/OB 三色体系是知识点属性，
//   学派归属哪个主题分组就用哪个色，不再让学派自选）。
//   school.accent JSON 字段保留但 sync 时被覆盖；孤儿 themeKey fallback 到 'classic'。
sqlLines.push('-- Schools');
const themeAccentMap = new Map<string, 'ob' | 'classic' | 'strategy' | 'warning'>();
for (const d of disciplines) {
  for (const t of d.themes) themeAccentMap.set(`${d.key}|${t.key}`, t.accent);
}
const schoolCols = ['key','discipline','title_zh','title_en','title_ja','era','summary_zh','summary_ja','theme_key','accent','created_at','updated_at'];
for (const s of schools) {
  const derivedAccent = themeAccentMap.get(`${s.discipline}|${s.themeKey}`) ?? 'classic';
  sqlLines.push(
    `INSERT INTO school (${schoolCols.join(', ')}) VALUES (` +
    `${q(s.key)}, ${q(s.discipline)}, ${q(s.title.zh)}, ${q(s.title.en)}, ${q(s.title.ja)}, ` +
    `${q(s.era)}, ${q(s.summary.zh)}, ${q(s.summary.ja)}, ${q(s.themeKey)}, ${q(derivedAccent)}, ` +
    `${q(s.createdAt)}, ${q(s.updatedAt)}) ` +
    `ON CONFLICT(key) DO UPDATE SET ${updateSet(schoolCols, 'key')};`
  );
}
sqlLines.push('');

// === Scholars (upsert) ===
// v0.4.19：accent 强制写空（学者颜色 = 主属学派颜色 = 主题分组色，公开页 fallback 链派生）
sqlLines.push('-- Scholars');
const scholarCols = [
  'key','discipline','name_zh','name_en','name_ja',
  'contribution_zh','contribution_ja','lifespan','institution',
  'born','died','nationality','flag','origin','field','accent',
  'nobel_year','nobel_detail','created_at','updated_at',
];
for (const sc of scholars) {
  sqlLines.push(
    `INSERT INTO scholar (${scholarCols.join(', ')}) VALUES (` +
    `${q(sc.key)}, ${q(sc.discipline)}, ${q(sc.name.zh)}, ${q(sc.name.en)}, ${q(sc.name.ja)}, ` +
    `${q(sc.contribution.zh)}, ${q(sc.contribution.ja)}, ${q(sc.lifespan)}, ${q(sc.institution)}, ` +
    `${q(sc.born)}, ${q(sc.died)}, ${q(sc.nationality)}, ${q(sc.flag)}, ${q(sc.origin)}, ${q(sc.field)}, ${q('')}, ` +
    `${q(sc.nobel?.year)}, ${q(sc.nobel?.detail)}, ${q(sc.createdAt)}, ${q(sc.updatedAt)}) ` +
    `ON CONFLICT(key) DO UPDATE SET ${updateSet(scholarCols, 'key')};`
  );
}
sqlLines.push('');

// === 孤儿清理：discipline / school / scholar ===
// learning 删掉的 school.json / scholar.json / discipline.json → 这里 DELETE
// scholar / school 被 DELETE → kp_school / kp_scholar / scholar_school 的
// CASCADE 会清相关 join（但这些表我们上面已 wipe，无额外影响）。
sqlLines.push('-- Orphan cleanup: discipline / school / scholar');
const discKeysCSV = disciplines.map((d) => q(d.key)).join(',') || "''";
const schoolKeysCSV = schools.map((s) => q(s.key)).join(',') || "''";
const scholarKeysCSV = scholars.map((s) => q(s.key)).join(',') || "''";
sqlLines.push(`DELETE FROM discipline WHERE key NOT IN (${discKeysCSV});`);
sqlLines.push(`DELETE FROM school WHERE key NOT IN (${schoolKeysCSV});`);
sqlLines.push(`DELETE FROM scholar WHERE key NOT IN (${scholarKeysCSV});`);
sqlLines.push('');

// === Scholar ↔ School（v0.4.17：补 V1→V2 迁移漏掉的两路数据源） ===
// V1 学派"代表人物"是三路并集（Main/js/nav.js）。V2 schema 简化但迁移只搬了第 1 路，
// 大量学者 schools=[] → 学派页"代表学者 (0)"。三路 union 通过 PK 去重：
//   1) scholar.schools[]              — 学者主属机构 / 暂无 KP 的占位声明
//   2) school.concepts[] × kp.scholars — 学派显式列出的 KP，其学者
//   3) kp.schools[]   × kp.scholars   — KP 自己声明的学派，其学者
sqlLines.push('-- scholar_school');
const scholarSchoolEmitted = new Set<string>();
// 1) 学者声明优先（保留 schools[] 的 position 语义）
for (const sc of scholars) {
  sc.schools.forEach((sk, i) => {
    if (!schoolKeys.has(sk)) return;
    const k = `${sc.key}|${sk}`;
    if (scholarSchoolEmitted.has(k)) return;
    scholarSchoolEmitted.add(k);
    sqlLines.push(`INSERT INTO scholar_school (scholar_key, school_key, position) VALUES (${q(sc.key)}, ${q(sk)}, ${i});`);
  });
}
// 2+3) KP 反向派生（position=1000 让学者声明排前，同 position 按 sc.key 字典序）
const kpById = new Map(kps.map((k) => [k.id, k]));
function emitDerivedScholarSchool(scKey: string, schoolKey: string) {
  if (!scholarKeys.has(scKey) || !schoolKeys.has(schoolKey)) return;
  const k = `${scKey}|${schoolKey}`;
  if (scholarSchoolEmitted.has(k)) return;
  scholarSchoolEmitted.add(k);
  sqlLines.push(`INSERT INTO scholar_school (scholar_key, school_key, position) VALUES (${q(scKey)}, ${q(schoolKey)}, 1000);`);
}
for (const school of schools) {
  for (const kpId of school.concepts) {
    const kp = kpById.get(kpId);
    if (!kp) continue;
    for (const scKey of kp.scholars) emitDerivedScholarSchool(scKey, school.key);
  }
}
for (const kp of kps) {
  for (const sk of kp.schools) {
    for (const scKey of kp.scholars) emitDerivedScholarSchool(scKey, sk);
  }
}
sqlLines.push('');

// === KPs (upsert) ===
setSection('02_kp');
header('KP upsert + KP orphan cleanup');
sqlLines.push('-- KPs');
const kpCols = ['id','discipline','year','title_zh','title_en','title_ja','body_zh','body_ja','tags_json','format','created_at','updated_at'];
for (const k of kps) {
  sqlLines.push(
    `INSERT INTO kp (${kpCols.join(', ')}) VALUES (` +
    `${q(k.id)}, ${q(k.discipline)}, ${q(k.year)}, ${q(k.title.zh)}, ${q(k.title.en)}, ${q(k.title.ja)}, ` +
    `${q(k.body.zh)}, ${q(k.body.ja)}, ${jq(k.tags)}, ${q(k.format)}, ${q(k.createdAt)}, ${q(k.updatedAt)}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${updateSet(kpCols, 'id')};`
  );
}
sqlLines.push('');

// === 孤儿清理：kp ===
// learning 删掉的 kp.json → 这里 DELETE。
// cascade：kp_school/kp_scholar（已 wipe） + user_progress（CASCADE，进度跟 KP 走，合理）
// + user_note（migration 0005 改 SET NULL，笔记保留）
sqlLines.push('-- Orphan cleanup: kp');
const kpIdsCSV = kps.map((k) => q(k.id)).join(',') || "''";
sqlLines.push(`DELETE FROM kp WHERE id NOT IN (${kpIdsCSV});`);
sqlLines.push('');

// === KP ↔ School（用 school.concepts 顺序优先；fallback 到 KP.schools 顺序） ===
setSection('03_kp_joins');
header('KP join tables (kp_school + kp_scholar)');
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
setSection('04_fts');
header('FTS5 rebuild');
sqlLines.push('-- FTS5');
sqlLines.push(`INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja) `
  + `SELECT id, title_zh, COALESCE(title_en, ''), COALESCE(title_ja, ''), body_zh, COALESCE(body_ja, '') FROM kp;`);
sqlLines.push('');

// === sync_log ===
setSection('05_log');
header('Sync log');
sqlLines.push('-- Sync log');
sqlLines.push(
  `INSERT INTO sync_log (ran_at, commit_sha, kp_count, school_count, scholar_count, status) VALUES (` +
  `${q(new Date().toISOString())}, ${q(COMMIT_SHA)}, ${kps.length}, ${schools.length}, ${scholars.length}, 'success');`
);
sqlLines.push('');

// (no COMMIT — wrangler batches automatically)

// ============================================================
// 4. 写文件 — 分片输出到 OUT_DIR/01_*.sql ... 05_*.sql
// ============================================================

mkdirSync(OUT_DIR, { recursive: true });
const outputs: Array<{ name: string; path: string; sizeKb: string; lines: number }> = [];
let totalLines = 0;
let totalKb = 0;
for (const [name, lines] of Object.entries(sections)) {
  const path = join(OUT_DIR, `${name}.sql`);
  const content = lines.join('\n') + '\n';
  writeFileSync(path, content, 'utf-8');
  const sizeKb = (content.length / 1024);
  outputs.push({ name, path, sizeKb: sizeKb.toFixed(1), lines: lines.length });
  totalLines += lines.length;
  totalKb += sizeKb;
}

// 兼容 SYNC_OUT 老 env：再额外吐一份合体 sync.sql 用于干跑/调试
if (OUT_SQL_LEGACY) {
  const flat = Object.values(sections).flat().join('\n') + '\n';
  mkdirSync(dirname(OUT_SQL_LEGACY), { recursive: true });
  writeFileSync(OUT_SQL_LEGACY, flat, 'utf-8');
}

console.log('');
console.log('=== Sync SQL shards generated ===');
for (const o of outputs) {
  console.log(`  ${o.name}.sql — ${o.sizeKb} KB, ${o.lines} stmts`);
}
console.log(`  total: ${totalKb.toFixed(1)} KB, ${totalLines} stmts`);
console.log('');
console.log('Apply（按顺序）：');
console.log(`  for f in ${OUT_DIR}/*.sql; do wrangler d1 execute management-study-v2 --remote --file="$f"; done`);
