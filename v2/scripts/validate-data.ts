/**
 * pnpm validate — 一键校验所有数据
 *
 * 输出：
 *   ✓ 0 errors / N warnings → exit 0
 *   ✗ M errors             → exit 1（CI 拦截 push）
 *
 * 在 GitHub Actions 里在 build 之前跑：错就直接拒绝部署。
 */

import { loadAllData, checkAllIssues } from './lib/load-data.js';

let data;
try {
  data = loadAllData();
} catch (e) {
  console.error('✗ Schema validation failed:');
  console.error(`  ${(e as Error).message}`);
  process.exit(1);
}

console.log(`Loaded: ${data.disciplines.length} disciplines / ${data.schools.length} schools / ${data.scholars.length} scholars / ${data.kps.length} KPs`);
console.log('');

const issues = checkAllIssues(data);
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');

if (issues.length === 0) {
  console.log('✓ All checks passed.');
  process.exit(0);
}

// 按类别分组打印
const byCategory: Record<string, typeof issues> = {};
for (const i of issues) {
  byCategory[i.category] ??= [];
  byCategory[i.category].push(i);
}

for (const [cat, items] of Object.entries(byCategory)) {
  console.log(`[${cat}] ${items.length}`);
  for (const i of items.slice(0, 30)) {
    const icon = i.level === 'error' ? '✗' : '!';
    console.log(`  ${icon} ${i.message}`);
  }
  if (items.length > 30) console.log(`  ... and ${items.length - 30} more`);
  console.log('');
}

console.log(`Summary: ${errors.length} errors, ${warnings.length} warnings`);

if (errors.length > 0) {
  process.exit(1);
}
process.exit(0);
