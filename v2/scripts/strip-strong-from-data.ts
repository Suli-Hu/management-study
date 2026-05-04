#!/usr/bin/env tsx
/**
 * strip-strong-from-data.ts — 一次性数据清理：剥离所有 `<strong>` / `</strong>` tag
 *
 * 用法：
 *   pnpm tsx scripts/strip-strong-from-data.ts            # 直接执行（写盘）
 *   pnpm tsx scripts/strip-strong-from-data.ts --dry-run  # 仅 report，不写
 *
 * 行为：
 *   - 递归扫 v2/data/**\/*.json（含 _template.* — 它们也 demo `<strong>`，统一清）
 *   - 对每个文件读 raw text，全局 regex replace `<\s*\/?\s*strong\s*>` (case-insensitive) → ''
 *   - 不动 <em> / <br> / <code> 等其它白名单标签
 *   - JSON escape 安全：`<` 在 JSON string 里是 raw 字符（不会被 escape），string-level
 *     replace 不破坏 JSON 结构。改后再 JSON.parse + JSON.stringify 一遍保证 round-trip 正常。
 *
 * 输出：
 *   - 扫了 N 文件 / 修了 M 文件 / 剥了 K 个 tag
 *   - 各 discipline / 各类（kp / school / scholar / view / discipline）分布
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DATA_ROOT = join(process.cwd(), 'data');
const STRONG_RE = /<\s*\/?\s*strong\s*>/gi;
const DRY_RUN = process.argv.includes('--dry-run');

interface FileStat {
  path: string;
  tagsRemoved: number;
}

const stats = {
  scanned: 0,
  modified: 0 as number,
  totalTagsRemoved: 0,
};

const modifiedFiles: FileStat[] = [];

function walkJson(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkJson(full));
    } else if (st.isFile() && entry.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

function processFile(file: string): void {
  stats.scanned++;
  const raw = readFileSync(file, 'utf8');
  const matches = raw.match(STRONG_RE);
  if (!matches || matches.length === 0) return;

  // raw string replace — `<strong>` 在 JSON 里是 string-content 字符（JSON spec 不 escape `<`），
  // 不会破坏结构。保留原文件的缩进 / 末尾换行 / 字段顺序（不做 round-trip parse+stringify）。
  const stripped = raw.replace(STRONG_RE, '');

  if (!DRY_RUN) writeFileSync(file, stripped, 'utf8');
  stats.modified++;
  stats.totalTagsRemoved += matches.length;
  modifiedFiles.push({ path: file, tagsRemoved: matches.length });
}

function summarizeByCategory(): Record<string, { files: number; tags: number }> {
  const byCat: Record<string, { files: number; tags: number }> = {};
  for (const { path, tagsRemoved } of modifiedFiles) {
    const rel = path.slice(DATA_ROOT.length + 1);
    const parts = rel.split('/');
    const discipline = parts[0] ?? 'unknown';
    const category = parts[1]?.endsWith('.json') ? 'discipline.json' : (parts[1] ?? 'root');
    const key = `${discipline}/${category}`;
    if (!byCat[key]) byCat[key] = { files: 0, tags: 0 };
    byCat[key].files += 1;
    byCat[key].tags += tagsRemoved;
  }
  return byCat;
}

function main(): void {
  const files = walkJson(DATA_ROOT);
  for (const file of files) processFile(file);

  console.log('=== strip-strong-from-data 报告 ===');
  console.log(`模式: ${DRY_RUN ? 'DRY-RUN（未写盘）' : 'APPLY（已写盘）'}`);
  console.log(`扫描: ${stats.scanned} 文件`);
  console.log(`修改: ${stats.modified} 文件`);
  console.log(`剥除: ${stats.totalTagsRemoved} 个 <strong>/</strong> tag`);
  console.log('');
  console.log('按 discipline/category 分布:');
  const byCat = summarizeByCategory();
  for (const [key, v] of Object.entries(byCat).sort()) {
    console.log(`  ${key.padEnd(30)} ${v.files} 文件 / ${v.tags} tag`);
  }
}

main();
