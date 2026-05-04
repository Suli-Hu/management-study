/**
 * 共享数据加载 + 校验 — sync / validate / tests 都用这个。
 *
 * 保证只有一处实现"读 v2/data/，validate schema，cross-ref check"，
 * 避免 sync 通过但 validate 失败这种不一致。
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Kp, School, Scholar, Discipline,
  type Kp as KpT, type School as SchoolT, type Scholar as ScholarT, type Discipline as DisciplineT,
} from '../../src/schemas/index.js';
import { structuredToSearchText } from '../../src/lib/kp-body-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const V2_ROOT = resolve(__dirname, '..', '..');
export const DATA_ROOT = join(V2_ROOT, 'data');

export interface LoadedData {
  disciplines: DisciplineT[];
  schools: SchoolT[];
  scholars: ScholarT[];
  kps: KpT[];
  schoolKeys: Set<string>;
  scholarKeys: Set<string>;
  kpIds: Set<string>;
}

export interface LoadIssue {
  level: 'error' | 'warning';
  category: 'schema' | 'cross-ref' | 'unique' | 'parity' | 'format';
  file?: string;
  message: string;
}

/**
 * 加载 v2/data/ 下所有 JSON 文件 + Zod schema validate。
 * Schema 错误立即抛 — 数据格式不合法不应继续跑。
 */
export function loadAllData(dataRoot = DATA_ROOT): LoadedData {
  if (!existsSync(dataRoot)) {
    throw new Error(`Data dir not found: ${dataRoot}. Run pnpm migrate:from-v1 first.`);
  }

  const disciplines: DisciplineT[] = [];
  const schools: SchoolT[] = [];
  const scholars: ScholarT[] = [];
  const kps: KpT[] = [];

  for (const discKey of readdirSync(dataRoot)) {
    const discDir = join(dataRoot, discKey);
    if (!statSync(discDir).isDirectory()) continue;

    const discFile = join(discDir, 'discipline.json');
    if (!existsSync(discFile)) continue;
    disciplines.push(parseFile(discFile, Discipline));

    schools.push(...loadDir(join(discDir, 'schools'), School));
    scholars.push(...loadDir(join(discDir, 'scholars'), Scholar));
    kps.push(...loadDir(join(discDir, 'kp'), Kp));
  }

  return {
    disciplines, schools, scholars, kps,
    schoolKeys: new Set(schools.map((s) => s.key)),
    // v0.6.8: scholar 复合 PK (discipline, key) — Set 元素是 `${disc}:${key}`
    scholarKeys: new Set(scholars.map((s) => `${s.discipline}:${s.key}`)),
    kpIds: new Set(kps.map((k) => k.id)),
  };
}

/** 跑所有非 schema 类校验：cross-ref / unique / cn-ja parity / format */
export function checkAllIssues(data: LoadedData): LoadIssue[] {
  const issues: LoadIssue[] = [];

  // --- Cross-ref ---
  for (const kp of data.kps) {
    for (const sk of kp.schools) {
      if (!data.schoolKeys.has(sk)) {
        issues.push({ level: 'error', category: 'cross-ref',
          message: `KP ${kp.id} references missing school "${sk}"` });
      }
    }
    for (const sc of kp.scholars) {
      // v0.6.8: KP 引用 scholar 必在同 discipline，按 (discipline, key) 复合查
      if (!data.scholarKeys.has(`${kp.discipline}:${sc}`)) {
        issues.push({ level: 'error', category: 'cross-ref',
          message: `KP ${kp.id} references missing scholar "${sc}" in discipline "${kp.discipline}"` });
      }
    }
  }
  for (const school of data.schools) {
    for (const cid of school.concepts) {
      if (!data.kpIds.has(cid)) {
        issues.push({ level: 'warning', category: 'cross-ref',
          message: `School ${school.key}.concepts references missing KP "${cid}"` });
      }
    }
  }
  for (const scholar of data.scholars) {
    for (const sk of scholar.schools) {
      if (!data.schoolKeys.has(sk)) {
        issues.push({ level: 'warning', category: 'cross-ref',
          message: `Scholar ${scholar.key}.schools references missing school "${sk}"` });
      }
    }
  }

  // --- Unique IDs ---
  const seenKpIds = new Map<string, number>();
  for (const kp of data.kps) {
    seenKpIds.set(kp.id, (seenKpIds.get(kp.id) ?? 0) + 1);
  }
  for (const [id, count] of seenKpIds) {
    if (count > 1) {
      issues.push({ level: 'error', category: 'unique',
        message: `KP id "${id}" appears ${count} times` });
    }
  }

  // --- CN-JA parity ---
  // v0.8.10 Stage 5：body 已结构化，<strong> 散落在 lead/items.desc/cells.detail 等多处，
  // 但 v0.8.7 起 sanitize-strong 全栈剥除 — 散落次数应都为 0。保留 advisory 给老数据。
  // ◆ 评价段已抽到独立 evaluations 字段，body 内不再含 ◆ tags — 跳过旧的 ◆-tag 比较。
  for (const kp of data.kps) {
    if (!kp.body.ja) continue;  // 没翻译跳过
    const zhText = structuredToSearchText(kp.body.zh);
    const jaText = structuredToSearchText(kp.body.ja);
    const zhStrong = countMatches(zhText, /<strong>/g);
    const jaStrong = countMatches(jaText, /<strong>/g);
    if (zhStrong > 0 && Math.abs(zhStrong - jaStrong) / zhStrong > 0.3) {
      issues.push({ level: 'warning', category: 'parity',
        message: `KP ${kp.id}: cn has ${zhStrong} <strong>, ja has ${jaStrong} (>30% diff)` });
    }
  }

  // --- Format checks ---
  for (const kp of data.kps) {
    const zhText = structuredToSearchText(kp.body.zh);
    if (zhText.length < 30) {
      issues.push({ level: 'warning', category: 'format',
        message: `KP ${kp.id}: body.zh is suspiciously short (${zhText.length} chars)` });
    }
    if (kp.title.zh.length > 50) {
      issues.push({ level: 'warning', category: 'format',
        message: `KP ${kp.id}: title.zh too long (${kp.title.zh.length} chars), should be ≤ 50` });
    }
  }

  return issues;
}

// ============================================================
// Helpers
// ============================================================

function parseFile<T>(path: string, schema: { parse: (v: unknown) => T }): T {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`);
  }
  try {
    return schema.parse(json);
  } catch (e) {
    throw new Error(`Schema validation failed for ${path}:\n${formatZodError(e)}`);
  }
}

function loadDir<T>(dir: string, schema: { parse: (v: unknown) => T }): T[] {
  if (!existsSync(dir)) return [];
  const out: T[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('_') || f.includes('.example.')) continue;
    out.push(parseFile(join(dir, f), schema));
  }
  return out;
}

function formatZodError(e: unknown): string {
  if (e && typeof e === 'object' && 'issues' in e && Array.isArray((e as any).issues)) {
    return (e as any).issues
      .map((i: any) => `  - ${i.path?.join('.') ?? ''}: ${i.message}`)
      .join('\n');
  }
  return String(e);
}

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}
