/**
 * 一次性 migration：scan all KP JSON, detect 真实 format, 修正 schema 字段。
 *
 * 不动 body 内容，只改 .format。仅当 detected ≠ current 时写。
 *
 * 用法：
 *   pnpm tsx scripts/fix-format-field.ts            # dry-run，print diff
 *   pnpm tsx scripts/fix-format-field.ts --write    # 实际写入
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFormatFromBody } from '../src/lib/body-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = join(__dirname, '..');
const DATA_ROOT = join(V2_ROOT, 'data');
const WRITE = process.argv.includes('--write');

interface KpJson {
  id: string;
  format: string;
  body: { zh?: string; ja?: string };
  [k: string]: unknown;
}

function findKpFiles(): string[] {
  const out: string[] = [];
  for (const disc of readdirSync(DATA_ROOT)) {
    const kpDir = join(DATA_ROOT, disc, 'kp');
    try {
      for (const f of readdirSync(kpDir)) {
        // 与 sync-to-d1.ts 一致：排除 _template / .example. 文件
        if (f.endsWith('.json') && !f.startsWith('_') && !f.includes('.example.')) {
          out.push(join(kpDir, f));
        }
      }
    } catch { /* not a discipline dir, skip */ }
  }
  return out;
}

function main() {
  const files = findKpFiles();
  console.log(`扫描 ${files.length} 个 KP 文件...`);
  const changes: Array<{ id: string; from: string; to: string; path: string }> = [];

  for (const path of files) {
    const raw = readFileSync(path, 'utf-8');
    const kp = JSON.parse(raw) as KpJson;
    const current = kp.format;
    const detected = detectFormatFromBody(kp.body?.zh ?? '');
    if (current !== detected) {
      changes.push({ id: kp.id, from: current, to: detected, path });
    }
  }

  if (changes.length === 0) {
    console.log('✓ 无需要修正的 KP，所有 format 与 body 内容一致。');
    return;
  }

  console.log(`\n发现 ${changes.length} 个 format 字段不匹配：\n`);
  const byTransition = new Map<string, string[]>();
  for (const c of changes) {
    const key = `${c.from} → ${c.to}`;
    if (!byTransition.has(key)) byTransition.set(key, []);
    byTransition.get(key)!.push(c.id);
  }
  for (const [t, ids] of [...byTransition.entries()].sort()) {
    console.log(`  ${t}：${ids.length} 个 [${ids.slice(0, 8).join(', ')}${ids.length > 8 ? `, ...+${ids.length - 8}` : ''}]`);
  }

  if (!WRITE) {
    console.log(`\nDry-run。加 --write 实际写入。`);
    return;
  }

  console.log(`\n写入中...`);
  for (const c of changes) {
    const raw = readFileSync(c.path, 'utf-8');
    const kp = JSON.parse(raw) as KpJson;
    kp.format = c.to;
    writeFileSync(c.path, JSON.stringify(kp, null, 2) + '\n');
  }
  console.log(`✓ 已修 ${changes.length} 个文件。运行 git diff 查看实际改动。`);
}

main();
