/**
 * 一次性脚本 — 给每个 discipline 生成默认视图（"学派组"）。
 *
 * 输入：v2/data/<discipline>/discipline.json (themes[])
 * 输出：v2/data/<discipline>/views/school-groups.json
 *
 * 跳过策略：若 views/ 目录已存在文件，不动；想强制重建加 --force。
 *
 * 用法：
 *   pnpm tsx scripts/backfill-default-view.ts        # 只补缺
 *   pnpm tsx scripts/backfill-default-view.ts --force # 强制覆盖默认视图
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Discipline } from '../src/schemas/discipline.js';
import { View, type View as ViewT } from '../src/schemas/view.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = resolve(__dirname, '..');
const DATA_ROOT = join(V2_ROOT, 'data');

const force = process.argv.includes('--force');

if (!existsSync(DATA_ROOT)) {
  console.error('✗ data/ not found');
  process.exit(1);
}

let total = 0;
for (const discKey of readdirSync(DATA_ROOT)) {
  const discDir = join(DATA_ROOT, discKey);
  if (!statSync(discDir).isDirectory()) continue;

  const discFile = join(discDir, 'discipline.json');
  if (!existsSync(discFile)) continue;
  const disc = Discipline.parse(JSON.parse(readFileSync(discFile, 'utf-8')));

  const viewsDir = join(discDir, 'views');
  if (!existsSync(viewsDir)) mkdirSync(viewsDir, { recursive: true });

  const defaultPath = join(viewsDir, 'school-groups.json');
  if (existsSync(defaultPath) && !force) {
    console.log(`  - ${discKey}: school-groups.json 已存在，跳过（--force 覆盖）`);
    continue;
  }

  const now = new Date().toISOString();
  const view: ViewT = {
    id: 'school-groups',
    discipline: disc.key,
    name: '学派组',
    jp: '学派グループ',
    icon: '📚',
    description: '默认视图。按论述题中的"问题域"把学派归成几大组——个体内、人与人、古典组织等。适合知识体系初识。',
    flow: '',
    scope: 'public',
    kind: 'manual',
    isDefault: true,
    position: 0,
    groups: disc.themes.map((t) => ({
      id: t.key,
      title: t.title.zh,
      flow: t.desc?.zh ?? '',
      schoolIds: [...t.schools],
    })),
    createdAt: now,
    updatedAt: now,
  };

  // schema 校验一遍（防 typo）
  const checked = View.parse(view);
  writeFileSync(defaultPath, JSON.stringify(checked, null, 2) + '\n');
  console.log(`  ✓ ${discKey}: wrote views/school-groups.json (${view.groups.length} groups)`);
  total++;
}
console.log(`\n→ Done. Generated ${total} default view(s).`);
