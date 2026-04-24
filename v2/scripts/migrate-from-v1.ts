/**
 * v1 → v2 一次性迁移
 *
 * 读 ../Main/data.js + ../Main/data_ja.js（v1 的 JS 字面量数据），
 * 转换成 v2 schema 定义的 JSON 文件，写入 v2/data/keiei/。
 *
 * 用法（在 v2/ 目录下）：
 *   pnpm install
 *   pnpm run migrate:from-v1
 *
 * 跑完后会有：
 *   v2/data/keiei/discipline.json
 *   v2/data/keiei/schools/<key>.json     × ~55
 *   v2/data/keiei/scholars/<key>.json    × ~169
 *   v2/data/keiei/kp/<id>.json           × ~513
 *
 * 每个生成文件都用对应 Zod schema 校验过 — 失败 abort 全过程。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { Kp, School, Scholar, Discipline, type ThemeGroup } from '../src/schemas/index.js';

// ============================================================
// 常量 & 路径
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = resolve(__dirname, '..');
const V1_MAIN = resolve(V2_ROOT, '..', 'Main');
const V1_DATA = join(V1_MAIN, 'data.js');
const V1_DATA_JA = join(V1_MAIN, 'data_ja.js');
const OUT_ROOT = join(V2_ROOT, 'data', 'keiei');
const NOW = new Date().toISOString();

// v1 group 数字 → v2 theme key（命名比纯数字更可读）
const THEME_KEY_BY_GROUP: Record<number, string> = {
  1: 'ob_individual',
  2: 'ob_group',
  3: 'org_classic',
  4: 'org_modern',
  5: 'hr',
  6: 'strategy_internal',
  7: 'strategy_external',
  8: 'org_environment',
  10: 'strategy_process',
  11: 'scott_quadrant',
  12: 'institutes',
};

// v1 hex 色 → v2 accent semantic name
const ACCENT_BY_HEX: Record<string, 'ob' | 'classic' | 'strategy' | 'warning'> = {
  '#34C759': 'ob',
  '#FF9500': 'classic',
  '#007AFF': 'strategy',
  '#FF3B30': 'warning',
};

// ============================================================
// 1. Load v1 数据到 sandbox
// ============================================================

console.log('→ Loading v1 data...');

const v1DataSrc = readFileSync(V1_DATA, 'utf-8');
const v1DataJaSrc = readFileSync(V1_DATA_JA, 'utf-8');

interface V1Sandbox {
  DATA: Record<string, any>;
  SCHOLARS: Record<string, any>;
  KNOWLEDGE: any[];
  THEME_ORDER: any[];
  DATA_JA: Record<string, string>;
  JP_MAP?: Record<string, string>;
  NAME_TO_KEY?: Record<string, string>;
  KNOWLEDGE_MAP?: Record<string, any>;
  THEME_ORDER_LOOKUP?: any;
  TOPIC_MAP?: any;
  TOPIC_ORDER?: any;
  SCHOLAR_ORDER?: any;
  INSTITUTE_ORDER?: any;
  window: any;
  console: typeof console;
}

const sandbox: V1Sandbox = {
  DATA: {},
  SCHOLARS: {},
  KNOWLEDGE: [],
  THEME_ORDER: [],
  DATA_JA: {},
  window: {},
  console,
};

try {
  runInNewContext(v1DataSrc, sandbox, { filename: 'data.js' });
  runInNewContext(v1DataJaSrc, sandbox, { filename: 'data_ja.js' });
} catch (e) {
  console.error('✗ Failed to eval v1 data:', e);
  process.exit(1);
}

const { DATA, SCHOLARS, KNOWLEDGE, THEME_ORDER, DATA_JA } = sandbox;

console.log(`  ✓ ${Object.keys(DATA).length} schools, ${Object.keys(SCHOLARS).length} scholars, ${KNOWLEDGE.length} KPs, ${Object.keys(DATA_JA).length} ja entries`);

// ============================================================
// 2. 工具函数
// ============================================================

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, data: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function clean(s: string | undefined | null): string {
  return (s ?? '').toString().trim();
}

function toAccent(hex: string | undefined): 'ob' | 'classic' | 'strategy' | 'warning' {
  return ACCENT_BY_HEX[clean(hex).toUpperCase()] ?? 'classic';
}

function themeKeyOf(group: number | undefined): string {
  return THEME_KEY_BY_GROUP[group ?? 0] ?? 'misc';
}

/** v1 cnKey 算法（从 KP title 推 DATA_JA key） */
function cnKeyOf(title: string): string {
  return title.replace(/([（(][^）)]+[）)]\s*)+$/, '').trim();
}

/**
 * v1 DATA_JA 的 value 是 "<strong>日文标题</strong>正文..." 格式
 * 拆出 jaTitle 和 jaBody（jaBody 不含 strong 标题段）
 */
function splitJaFull(jaFull: string): { jaTitle: string; jaBody: string } {
  if (!jaFull) return { jaTitle: '', jaBody: '' };
  const m = jaFull.match(/^<strong>([\s\S]*?)<\/strong>([\s\S]*)$/);
  if (!m) return { jaTitle: '', jaBody: jaFull };
  // jaTitle 去括号、去 ——/—— 后的副标题
  const rawTitle = m[1].trim();
  const jaTitle = rawTitle.replace(/（[^）]*）|\([^)]*\)/g, '').replace(/——[\s\S]*$/, '').trim();
  // jaBody 保留原格式（可能开头有 ——副标题——，前端按 v1 老逻辑处理）
  const jaBody = m[2].trim();
  return { jaTitle, jaBody };
}

/** body 里 grep ◆意义 ◆局限 ◆例子 等评价标签 */
const TAG_MAP: Record<string, '义' | '限' | '例' | '应' | '用' | '喻'> = {
  意义: '义', 義: '义',
  局限: '限', 限界: '限',
  例子: '例', 例: '例', 企业例: '例',
  应对: '应', 対応: '应',
  应用: '用', 応用: '用',
  比喻: '喻', 比喩: '喻',
};

function parseTags(bodyZh: string, bodyJa: string): Array<'义' | '限' | '例' | '应' | '用' | '喻'> {
  const found = new Set<'义' | '限' | '例' | '应' | '用' | '喻'>();
  const all = (bodyZh ?? '') + ' ' + (bodyJa ?? '');
  for (const word in TAG_MAP) {
    const re = new RegExp(`◆\\s*${word}\\s*——`, 'g');
    if (re.test(all)) found.add(TAG_MAP[word]);
  }
  return Array.from(found);
}

function detectFormat(bodyZh: string): 'narrative' | 'flat-list' | 'accordion' | 'compare' | 'quad' {
  if (/<quad>/.test(bodyZh)) return 'quad';
  if (/<compare>/.test(bodyZh)) return 'compare';
  if (/<br>【[^】]+】/.test(bodyZh)) return 'accordion';
  // 平铺 ◆ 列表（不算评价标签的）
  const bullets = (bodyZh.match(/◆/g) || []).length;
  const evalTags = (bodyZh.match(/◆\s*(意义|局限|例子|例|应对|应用|比喻|義|限界|対応|応用|比喩|企业例)\s*——/g) || []).length;
  if (bullets - evalTags >= 3) return 'flat-list';
  return 'narrative';
}

/**
 * 清掉指定目录下的所有 .json（不是 _template / .example），用于 idempotent migration
 */
function clearJsonDir(dir: string) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.json') && !f.startsWith('_') && !f.includes('.example.')) {
      unlinkSync(join(dir, f));
    }
  }
}

// ============================================================
// 3. 生成 discipline.json
// ============================================================

console.log('→ Writing discipline.json...');

const themes: ThemeGroup[] = THEME_ORDER.map((t: any) => {
  const groups = (t.groups ?? []) as number[];
  const key = groups.length === 1 ? themeKeyOf(groups[0]) : `theme_${groups.join('_')}`;
  // 拆 label "组织与环境：超越组织的世界" → title "组织与环境" + tagline "超越组织的世界"
  const [titleZh, taglineZh] = String(t.label || '').split(/[：:]/).map((s) => s.trim());
  return {
    key,
    title: { zh: titleZh || key, en: undefined, ja: undefined },
    desc: t.desc ? { zh: clean(t.desc) } : undefined,
    accent: toAccent(t.color),
    schools: (t.order ?? []) as string[],
  };
});

const discipline: Discipline = {
  key: 'keiei',
  title: { zh: '经营学', en: 'Management', ja: '経営学' },
  tagline: { zh: '日本大学院入试备考' },
  accent: 'classic',
  themes,
  createdAt: NOW,
  updatedAt: NOW,
};

const discipResult = Discipline.safeParse(discipline);
if (!discipResult.success) {
  console.error('✗ discipline.json failed schema:', discipResult.error.issues);
  process.exit(1);
}
writeJson(join(OUT_ROOT, 'discipline.json'), discipline);
console.log(`  ✓ discipline.json (${themes.length} themes)`);

// ============================================================
// 4. 生成 schools/<key>.json
// ============================================================

console.log('→ Writing schools/...');
clearJsonDir(join(OUT_ROOT, 'schools'));

let schoolCount = 0;
for (const key of Object.keys(DATA)) {
  const d = DATA[key];
  if (!d || typeof d !== 'object') continue;

  const school: School = {
    key,
    discipline: 'keiei',
    title: {
      zh: clean(d.title),
      en: clean(d.en) || undefined,
      ja: clean(d.ja) || undefined,
    },
    era: clean(d.era),
    summary: {
      zh: clean(d.summary),
      ja: undefined, // v1 学派 summary 没有日文版
    },
    themeKey: themeKeyOf(d.group),
    accent: toAccent(d.accent),
    concepts: (d.concepts ?? []) as string[],
    createdAt: NOW,
    updatedAt: NOW,
  };

  const r = School.safeParse(school);
  if (!r.success) {
    console.error(`✗ school ${key} failed schema:`, r.error.issues);
    process.exit(1);
  }
  writeJson(join(OUT_ROOT, 'schools', `${key}.json`), school);
  schoolCount++;
}
console.log(`  ✓ ${schoolCount} schools`);

// ============================================================
// 5. 生成 scholars/<key>.json
// ============================================================

console.log('→ Writing scholars/...');
clearJsonDir(join(OUT_ROOT, 'scholars'));

let scholarCount = 0;
for (const key of Object.keys(SCHOLARS)) {
  const s = SCHOLARS[key];
  if (!s || typeof s !== 'object') continue;

  const scholar: Scholar = {
    key,
    discipline: 'keiei',
    name: {
      zh: clean(s.name),
      en: clean(s.en) || undefined,
      ja: clean(s.ja) || undefined,
    },
    schools: (s.schools ?? []) as string[],
    contribution: {
      zh: clean(s.contribution),
      ja: undefined,
    },
    lifespan: clean(s.lifespan ?? s.years),
    institution: clean(s.institution),
    nobel: s.nobel_detail
      ? { year: clean(s.nobel_year), detail: clean(s.nobel_detail) }
      : null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  // 学派列表至少 1 个 — 兜底
  if (scholar.schools.length === 0) {
    console.warn(`  ! scholar ${key} has no schools, defaulting to ['other']`);
    scholar.schools = ['other'];
  }

  const r = Scholar.safeParse(scholar);
  if (!r.success) {
    console.error(`✗ scholar ${key} failed schema:`, r.error.issues);
    process.exit(1);
  }
  writeJson(join(OUT_ROOT, 'scholars', `${key}.json`), scholar);
  scholarCount++;
}
console.log(`  ✓ ${scholarCount} scholars`);

// ============================================================
// 6. 生成 kp/<id>.json
// ============================================================

console.log('→ Writing kp/...');
clearJsonDir(join(OUT_ROOT, 'kp'));

let kpCount = 0;
let kpWithJa = 0;
for (const k of KNOWLEDGE) {
  if (!k || !k.id || !k.title) continue;

  const cnKey = cnKeyOf(k.title);
  const jaFull = DATA_JA[cnKey] ?? DATA_JA[k.title] ?? '';
  const { jaTitle, jaBody } = splitJaFull(jaFull);
  if (jaBody) kpWithJa++;

  const scholars = clean(k.scholar)
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  const kp: Kp = {
    id: k.id,
    discipline: 'keiei',
    schools: (k.schools ?? []) as string[],
    scholars,
    year: clean(k.year),
    title: {
      zh: clean(k.title),
      en: clean(k.en) || undefined,
      ja: jaTitle || undefined,
    },
    body: {
      zh: clean(k.body),
      ja: jaBody || undefined,
    },
    tags: parseTags(k.body, jaBody),
    format: detectFormat(k.body),
    createdAt: NOW,
    updatedAt: NOW,
  };

  if (kp.schools.length === 0) {
    console.warn(`  ! kp ${k.id} has no schools, skipping (orphan)`);
    continue;
  }

  const r = Kp.safeParse(kp);
  if (!r.success) {
    console.error(`✗ kp ${k.id} failed schema:`);
    for (const issue of r.error.issues) {
      console.error(`    ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  writeJson(join(OUT_ROOT, 'kp', `${k.id}.json`), kp);
  kpCount++;
}
console.log(`  ✓ ${kpCount} KPs (${kpWithJa} with ja translation)`);

// ============================================================
// 7. Summary
// ============================================================

console.log('');
console.log('=== Migration complete ===');
console.log(`  Themes:   ${themes.length}`);
console.log(`  Schools:  ${schoolCount}`);
console.log(`  Scholars: ${scholarCount}`);
console.log(`  KPs:      ${kpCount}`);
console.log(`  Output:   ${OUT_ROOT}`);
console.log('');
console.log('Next: pnpm validate  # cross-ref + schema check');
