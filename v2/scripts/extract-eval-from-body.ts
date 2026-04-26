#!/usr/bin/env tsx
/**
 * extract-eval-from-body.ts — 一次性迁移：把 KP body 末尾的 ◆评价段抽到结构化字段
 *
 * 用法：
 *   pnpm tsx scripts/extract-eval-from-body.ts --dry-run     # 预览，不写文件
 *   pnpm tsx scripts/extract-eval-from-body.ts --apply       # 实际写盘
 *   pnpm tsx scripts/extract-eval-from-body.ts --apply --kp k001  # 单条测试
 *
 * 行为：
 *   - 遍历所有 data/<discipline>/kp 目录下的 .json 文件
 *   - 对每个 KP 的 body.zh / body.ja 跑 extractEvalTags()
 *   - 把抽出来的 evalContent 写到 kp.evalContent.{zh|ja}（KP schema 新增字段）
 *   - body.zh / body.ja 改写为 cleanBody（评价段 strip 掉）
 *
 * 安全策略：
 *   1. dry-run 模式输出 _eval-extraction-preview.json（diff 全列），让用户 spot-check
 *   2. apply 模式跳过 没有评价段的 KP（changed=false）
 *   3. 已经迁移过的 KP（已有 evalContent 字段）跳过，幂等
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractEvalTags } from '../src/lib/extract-eval-tags';
import type { EvalContent } from '../src/lib/eval-tag-defs';

const DATA_ROOT = join(process.cwd(), 'data');
const PREVIEW_FILE = join(process.cwd(), '_eval-extraction-preview.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const APPLY = args.includes('--apply');
const SINGLE_KP = (() => {
  const i = args.indexOf('--kp');
  return i >= 0 ? args[i + 1] : null;
})();

if (!DRY_RUN && !APPLY) {
  console.error('请指定 --dry-run 或 --apply');
  process.exit(1);
}

interface PreviewEntry {
  file: string;
  id: string;
  zh?: { glyphs: string[]; bodyBefore: string; bodyAfter: string; extractedContent: EvalContent };
  ja?: { glyphs: string[]; bodyBefore: string; bodyAfter: string; extractedContent: EvalContent };
}

const stats = {
  scanned: 0,
  withZhEval: 0,
  withJaEval: 0,
  changed: 0,
  alreadyMigrated: 0,
};
const previews: PreviewEntry[] = [];

function processKpFile(file: string): void {
  const raw = readFileSync(file, 'utf8');
  const kp = JSON.parse(raw) as {
    id: string;
    body: { zh: string; ja?: string };
    evalContent?: { zh?: EvalContent; ja?: EvalContent };
    [k: string]: unknown;
  };

  if (SINGLE_KP && kp.id !== SINGLE_KP) return;
  stats.scanned++;

  // 已迁移过 → 跳过（幂等）
  if (kp.evalContent && (Object.keys(kp.evalContent.zh ?? {}).length > 0 || Object.keys(kp.evalContent.ja ?? {}).length > 0)) {
    stats.alreadyMigrated++;
    return;
  }

  const zhResult = extractEvalTags(kp.body?.zh);
  const jaResult = extractEvalTags(kp.body?.ja);

  const hasZhExtraction = Object.keys(zhResult.evalContent).length > 0;
  const hasJaExtraction = Object.keys(jaResult.evalContent).length > 0;
  if (hasZhExtraction) stats.withZhEval++;
  if (hasJaExtraction) stats.withJaEval++;

  if (!hasZhExtraction && !hasJaExtraction) return;

  // Preview entry
  const entry: PreviewEntry = { file: file.replace(DATA_ROOT + '/', ''), id: kp.id };
  if (hasZhExtraction) {
    entry.zh = {
      glyphs: Object.keys(zhResult.evalContent),
      bodyBefore: kp.body.zh,
      bodyAfter: zhResult.cleanBody,
      extractedContent: zhResult.evalContent,
    };
  }
  if (hasJaExtraction) {
    entry.ja = {
      glyphs: Object.keys(jaResult.evalContent),
      bodyBefore: kp.body.ja ?? '',
      bodyAfter: jaResult.cleanBody,
      extractedContent: jaResult.evalContent,
    };
  }
  previews.push(entry);

  if (APPLY) {
    const newKp: typeof kp = { ...kp };
    newKp.body = { ...kp.body };
    if (hasZhExtraction) newKp.body.zh = zhResult.cleanBody;
    if (hasJaExtraction && kp.body.ja !== undefined) newKp.body.ja = jaResult.cleanBody;
    newKp.evalContent = {
      ...(hasZhExtraction ? { zh: zhResult.evalContent } : {}),
      ...(hasJaExtraction ? { ja: jaResult.evalContent } : {}),
    };
    newKp.updatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(newKp, null, 2) + '\n', 'utf8');
    stats.changed++;
  }
}

function walkDiscipline(disciplineKey: string): void {
  const kpDir = join(DATA_ROOT, disciplineKey, 'kp');
  for (const f of readdirSync(kpDir)) {
    if (!f.endsWith('.json')) continue;
    if (f.startsWith('_template') || f.includes('.example.')) continue;
    processKpFile(join(kpDir, f));
  }
}

function main(): void {
  const disciplines = readdirSync(DATA_ROOT).filter((d) => {
    try {
      readFileSync(join(DATA_ROOT, d, 'discipline.json'), 'utf8');
      return true;
    } catch {
      return false;
    }
  });

  for (const d of disciplines) walkDiscipline(d);

  // Always write preview file
  writeFileSync(PREVIEW_FILE, JSON.stringify({ stats, previews }, null, 2) + '\n', 'utf8');

  console.log('\n=== 抽取统计 ===');
  console.log(`scanned: ${stats.scanned}`);
  console.log(`已迁移过（跳过）: ${stats.alreadyMigrated}`);
  console.log(`含中文评价段: ${stats.withZhEval}`);
  console.log(`含日文评价段: ${stats.withJaEval}`);
  console.log(`改动文件: ${stats.changed}`);
  console.log(`\nPreview 文件: ${PREVIEW_FILE}`);
  console.log(`Mode: ${APPLY ? 'APPLY (已写盘)' : 'DRY-RUN (未写盘)'}`);
}

main();
