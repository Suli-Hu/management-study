/**
 * v0.8.10 Stage 5 一次性迁移：v2/data/<discipline>/kp/*.json 全量改 v0.8 shape。
 *
 * 输入（v0.7.x 形态，git 已有 700+ 文件）：
 *   {
 *     id, discipline, schools, scholars, year, tags,
 *     title: { zh, ja?, en? },
 *     body:  { zh: "<DSL string>", ja?: "<DSL string>" },
 *     format: 'narrative' | 'flat-list' | ...,
 *     evalContent?: { zh?: { 义, 限, 例, 应, 用, 喻 }, ja?: ... },
 *     createdAt, updatedAt
 *   }
 *
 * 输出（v0.8 KpV08 形态，写回原文件）：
 *   {
 *     id, discipline, schools, scholars, year, tags,
 *     title: { zh, ja?, en? },
 *     body:  { zh: KpBody, ja?: KpBody },
 *     evaluations?: { zh?: KpEvaluationsLang, ja?: KpEvaluationsLang },
 *     createdAt, updatedAt
 *   }
 *
 * 使用：
 *   pnpm tsx v2/scripts/migrate-data-to-v08-schema.ts          # 实际写
 *   pnpm tsx v2/scripts/migrate-data-to-v08-schema.ts --dry    # 仅扫不写
 *
 * Dry / dirty 输出：
 *   - parse 失败 / format 不一致 / quad axis split 失败 → dirty list
 *   - 报告打印 + 退出码 0（让 PM 手动看 dirty list 修，再重跑）
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBody, type Format } from '../../src/lib/body-parser.js';
import {
  parsedToStructured,
  evalContentToEvaluations,
  hasEvaluationsContent,
} from '../../src/lib/kp-body-helpers.js';
import { Kp } from '../../src/schemas/kp.js';
import { KpBody as KpBodySchema } from '../../src/schemas/kp-body-structured.js';
import type { KpBody, KpEvaluationsLang, NarrativeBody } from '../../src/schemas/kp-body-structured.js';

/**
 * 把 raw body 字符串 + format 转成结构化 KpBody。
 * 若按目标 format 解析后 schema 不通过（典型：flat-list items=[] / accordion groups=[]
 * / quad axis split 失败），降级为 narrative：把整段原文塞进 prose。
 *
 * 见 PRD §5.2：边界 case 强制改 format 为 narrative + 标注。
 */
function safeParseToStructured(raw: string, fmt: Format): { body: KpBody; downgraded: boolean } {
  if (!raw.trim()) {
    return { body: { format: 'narrative', prose: '' } as NarrativeBody, downgraded: fmt !== 'narrative' };
  }
  try {
    const candidate = parsedToStructured(parseBody(raw, fmt));
    const r = KpBodySchema.safeParse(candidate);
    if (r.success) return { body: r.data, downgraded: false };
  } catch {
    // fall through to narrative
  }
  return { body: { format: 'narrative', prose: raw } as NarrativeBody, downgraded: fmt !== 'narrative' };
}

const DRY = process.argv.includes('--dry');

const __dirname = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = resolve(__dirname, '..', '..');
const DATA_ROOT = join(V2_ROOT, 'data');

interface DirtyEntry {
  file: string;
  id: string;
  reason: string;
  detail?: string;
}

const dirty: DirtyEntry[] = [];
let scanned = 0;
let migratedClean = 0;
let alreadyV08 = 0;
let written = 0;

if (!existsSync(DATA_ROOT)) {
  console.error(`✗ data/ not found at ${DATA_ROOT}`);
  process.exit(1);
}

console.log(`→ Scanning ${DATA_ROOT}${DRY ? ' (dry-run)' : ''}...`);

for (const discKey of readdirSync(DATA_ROOT)) {
  const discDir = join(DATA_ROOT, discKey);
  if (!statSync(discDir).isDirectory()) continue;
  const kpDir = join(discDir, 'kp');
  if (!existsSync(kpDir)) continue;

  for (const fname of readdirSync(kpDir)) {
    if (!fname.endsWith('.json') || fname.startsWith('_') || fname.includes('.example.')) continue;
    const fp = join(kpDir, fname);
    scanned++;

    const raw = readFileSync(fp, 'utf-8');
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      dirty.push({ file: fp, id: fname, reason: 'invalid_json', detail: (e as Error).message });
      continue;
    }

    // 已是 v0.8 shape（body.zh 是 object 且无顶层 format / evalContent）
    const isV08Shape = (
      typeof json.body === 'object' &&
      json.body !== null &&
      typeof (json.body as Record<string, unknown>).zh === 'object' &&
      json.format === undefined &&
      json.evalContent === undefined
    );

    if (isV08Shape) {
      // 用最终 schema 校验：通过 → 跳过；失败 → dirty
      const r = Kp.safeParse(json);
      if (r.success) {
        alreadyV08++;
        continue;
      }
      dirty.push({
        file: fp,
        id: String(json.id ?? fname),
        reason: 'v08_schema_invalid',
        detail: r.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(' | '),
      });
      continue;
    }

    // legacy v0.7.x 形态 — 走解析路径
    const fmt = String(json.format ?? 'narrative') as Format;
    const bodyZhRaw = String((json.body as Record<string, unknown> | undefined)?.zh ?? '');
    const bodyJaRaw = (json.body as Record<string, unknown> | undefined)?.ja;
    const bodyJaStr = typeof bodyJaRaw === 'string' ? bodyJaRaw : null;

    const zhResult = safeParseToStructured(bodyZhRaw, fmt);
    const bodyZh: KpBody = zhResult.body;

    let bodyJa: KpBody | undefined = undefined;
    let jaDowngraded = false;
    if (bodyJaStr) {
      const jaResult = safeParseToStructured(bodyJaStr, fmt);
      bodyJa = jaResult.body;
      jaDowngraded = jaResult.downgraded;
    }

    if (zhResult.downgraded || jaDowngraded) {
      dirty.push({
        file: fp,
        id: String(json.id),
        reason: 'downgraded_to_narrative',
        detail: `original format=${fmt}; ${zhResult.downgraded ? 'zh ' : ''}${jaDowngraded ? 'ja' : ''} 不符合 ${fmt} schema → 降级 narrative 保留 prose`,
      });
    }

    // evaluations: legacy evalContent (glyph key) → KpEvaluationsLang (英文 key)
    const evalContent = json.evalContent as { zh?: Record<string, string>; ja?: Record<string, string> } | undefined;
    let evalsZh: KpEvaluationsLang | undefined;
    let evalsJa: KpEvaluationsLang | undefined;
    if (evalContent?.zh && Object.keys(evalContent.zh).length > 0) {
      const candidate = evalContentToEvaluations(evalContent.zh);
      if (hasEvaluationsContent(candidate)) evalsZh = candidate;
    }
    if (evalContent?.ja && Object.keys(evalContent.ja).length > 0) {
      const candidate = evalContentToEvaluations(evalContent.ja);
      if (hasEvaluationsContent(candidate)) evalsJa = candidate;
    }
    const evaluations = evalsZh || evalsJa
      ? {
          ...(evalsZh ? { zh: evalsZh } : {}),
          ...(evalsJa ? { ja: evalsJa } : {}),
        }
      : undefined;

    // 重组 v0.8 shape，按 Kp schema 字段顺序写
    const newKp: Record<string, unknown> = {
      id: json.id,
      discipline: json.discipline,
      schools: json.schools,
      scholars: json.scholars ?? [],
      year: json.year ?? '',
      title: json.title,
      body: bodyJa ? { zh: bodyZh, ja: bodyJa } : { zh: bodyZh },
      tags: json.tags ?? [],
      ...(evaluations ? { evaluations } : {}),
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };

    // 校验通过 = clean，否则记 dirty（quad axis split 失败 / items 空等都在这层发现）
    const r = Kp.safeParse(newKp);
    if (!r.success) {
      dirty.push({
        file: fp,
        id: String(json.id),
        reason: 'post_migration_schema_invalid',
        detail: r.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(' | '),
      });
      continue;
    }

    migratedClean++;
    if (!DRY) {
      writeFileSync(fp, JSON.stringify(newKp, null, 2) + '\n', 'utf-8');
      written++;
    }
  }
}

console.log('');
console.log('=== Migration report ===');
console.log(`  scanned:        ${scanned} files`);
console.log(`  already v0.8:   ${alreadyV08}`);
console.log(`  migrated clean: ${migratedClean}${DRY ? ' (dry-run, not written)' : ''}`);
console.log(`  written:        ${written}`);
console.log(`  dirty:          ${dirty.length}`);

if (dirty.length > 0) {
  console.log('');
  console.log('--- Dirty list (PM 手动 review) ---');
  for (const d of dirty.slice(0, 50)) {
    console.log(`  [${d.reason}] ${d.id} (${d.file})`);
    if (d.detail) console.log(`    ${d.detail.slice(0, 200)}`);
  }
  if (dirty.length > 50) {
    console.log(`  ... and ${dirty.length - 50} more`);
  }
}

console.log('');
console.log(DRY ? 'Dry-run complete; rerun without --dry to write.' : 'Migration complete.');
