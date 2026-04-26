#!/usr/bin/env tsx
/**
 * v0.5.0 标签化重构一次性迁移脚本
 *
 * 行为：
 *   1. discipline.json:
 *      - 删除顶层 accent
 *      - 注入空 tags: []（标签库由用户后续填充）
 *      - 每个 theme：删除 accent，注入空 tags: []
 *   2. schools/*.json: 删除 accent，注入空 tags: []
 *   3. scholars/*.json: 删除 accent，注入空 tags: []
 *   4. kp/*.json: tags 字段语义换（义/限/例 → 颜色 tag key），全部清空为 []
 *
 * 用户决定：起步时全空，后续由经营学专业 agent 配置标签库 + 标记。
 *
 * 执行：pnpm tsx scripts/migrate-accent-to-tags.ts
 *
 * 幂等：可重复跑（已迁移过的文件再跑等价于 no-op）
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_ROOT = join(process.cwd(), 'data');

let stats = { discipline: 0, themes: 0, schools: 0, scholars: 0, kps: 0 };

function migrateJsonFile(path: string, transform: (obj: any) => boolean): void {
  const raw = readFileSync(path, 'utf8');
  const obj = JSON.parse(raw);
  const changed = transform(obj);
  if (changed) {
    writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  }
}

function migrateDiscipline(file: string): void {
  migrateJsonFile(file, (d) => {
    let changed = false;
    if ('accent' in d) { delete d.accent; changed = true; }
    if (!('tags' in d)) { d.tags = []; changed = true; }
    for (const t of d.themes ?? []) {
      if ('accent' in t) { delete t.accent; changed = true; stats.themes++; }
      if (!('tags' in t)) { t.tags = []; changed = true; }
    }
    if (changed) stats.discipline++;
    return changed;
  });
}

function migrateEntityFile(file: string, kind: 'school' | 'scholar'): void {
  migrateJsonFile(file, (e) => {
    let changed = false;
    if ('accent' in e) { delete e.accent; changed = true; }
    if (!('tags' in e)) { e.tags = []; changed = true; }
    if (changed) stats[kind === 'school' ? 'schools' : 'scholars']++;
    return changed;
  });
}

function migrateKpFile(file: string): void {
  migrateJsonFile(file, (k) => {
    let changed = false;
    // 旧 tags（义/限/例 enum）→ 颜色 tag 语义；起步全空
    if (Array.isArray(k.tags) && k.tags.length > 0) {
      k.tags = [];
      changed = true;
    } else if (!('tags' in k)) {
      k.tags = [];
      changed = true;
    }
    if (changed) stats.kps++;
    return changed;
  });
}

function walkDiscipline(disciplineKey: string): void {
  const dir = join(DATA_ROOT, disciplineKey);
  const discFile = join(dir, 'discipline.json');
  console.log(`\n=== ${disciplineKey} ===`);
  migrateDiscipline(discFile);

  const schoolsDir = join(dir, 'schools');
  for (const f of readdirSync(schoolsDir)) {
    if (f.endsWith('.json')) migrateEntityFile(join(schoolsDir, f), 'school');
  }

  const scholarsDir = join(dir, 'scholars');
  for (const f of readdirSync(scholarsDir)) {
    if (f.endsWith('.json')) migrateEntityFile(join(scholarsDir, f), 'scholar');
  }

  const kpDir = join(dir, 'kp');
  for (const f of readdirSync(kpDir)) {
    if (f.endsWith('.json')) migrateKpFile(join(kpDir, f));
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

  console.log('\n=== 迁移统计 ===');
  console.log(`discipline: ${stats.discipline} 个文件改动`);
  console.log(`themes:     ${stats.themes} 个 theme 清掉 accent`);
  console.log(`schools:    ${stats.schools} 个文件改动`);
  console.log(`scholars:   ${stats.scholars} 个文件改动`);
  console.log(`kps:        ${stats.kps} 个文件改动`);
}

main();
