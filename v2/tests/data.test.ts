/**
 * 数据完整性回归测试 — Vitest。
 *
 * 跑：pnpm test
 * CI 强制：任何 fail → push 拒绝（见 .github/workflows/deploy-v2.yml）
 *
 * 测试**整个 data/ 目录**，不是单个文件。这模拟"用户实际访问"的最终状态。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllData, checkAllIssues, type LoadedData } from '../scripts/lib/load-data.js';

let data: LoadedData;

beforeAll(() => {
  data = loadAllData();
});

describe('Data presence', () => {
  it('has at least one discipline', () => {
    expect(data.disciplines.length).toBeGreaterThan(0);
  });
  it('has at least one school per discipline (skipped for empty placeholder disciplines)', () => {
    // v0.5.71: marketing / sociology 暂时是空 placeholder（admin 还没建学派）→ 跳过这条对它们的硬性要求。
    // 等首批学派落地后从这里删掉它们或直接砍此规则。
    const PLACEHOLDER = new Set(['marketing', 'sociology']);
    for (const d of data.disciplines) {
      if (PLACEHOLDER.has(d.key)) continue;
      const has = data.schools.some((s) => s.discipline === d.key);
      expect(has, `discipline ${d.key} should have ≥ 1 school`).toBe(true);
    }
  });
  it('has KPs', () => {
    expect(data.kps.length).toBeGreaterThan(0);
  });
});

describe('Schema (already enforced by Zod in loadAllData)', () => {
  it('all disciplines parsed', () => expect(data.disciplines).toBeDefined());
  it('all schools parsed', () => expect(data.schools).toBeDefined());
  it('all scholars parsed', () => expect(data.scholars).toBeDefined());
  it('all kps parsed', () => expect(data.kps).toBeDefined());
});

describe('Unique IDs', () => {
  it('KP ids are unique', () => {
    const seen = new Map<string, number>();
    for (const k of data.kps) seen.set(k.id, (seen.get(k.id) ?? 0) + 1);
    const dups = [...seen.entries()].filter(([_, n]) => n > 1);
    expect(dups, `duplicate KP ids: ${JSON.stringify(dups)}`).toEqual([]);
  });
  it('school keys are unique', () => {
    expect(data.schools.length).toBe(data.schoolKeys.size);
  });
  it('scholar keys are unique', () => {
    expect(data.scholars.length).toBe(data.scholarKeys.size);
  });
});

describe('Cross-references', () => {
  it('every KP.schools entry exists in schools/', () => {
    const broken: string[] = [];
    for (const kp of data.kps) {
      for (const sk of kp.schools) {
        if (!data.schoolKeys.has(sk)) broken.push(`${kp.id} → ${sk}`);
      }
    }
    expect(broken, `broken KP→school refs:\n  ${broken.join('\n  ')}`).toEqual([]);
  });

  it('every KP.scholars entry exists in scholars/', () => {
    // v0.6.8: scholar 复合 PK — 引用按 (kp.discipline, scholarKey)
    const broken: string[] = [];
    for (const kp of data.kps) {
      for (const sc of kp.scholars) {
        if (!data.scholarKeys.has(`${kp.discipline}:${sc}`)) broken.push(`${kp.id} → ${sc}`);
      }
    }
    expect(broken, `broken KP→scholar refs:\n  ${broken.join('\n  ')}`).toEqual([]);
  });

  it('every Scholar.schools entry exists in schools/', () => {
    const broken: string[] = [];
    for (const sc of data.scholars) {
      for (const sk of sc.schools) {
        if (!data.schoolKeys.has(sk)) broken.push(`${sc.key} → ${sk}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe('Format rules (v0.8 structured)', () => {
  // v0.8.10 Stage 5: body 已结构化，旧的 ◆-tag 检查 + <strong> parity 已经移到
  // load-data.ts 走 structuredToSearchText 拍平后比对（advisory，不卡 test）。
  // 这里只保留"非空 body"硬约束 — body.zh 必须有可见内容。
  it('no KP has empty body.zh content', () => {
    const empty = data.kps
      .filter((k) => {
        const b = k.body.zh;
        if (b.format === 'narrative') return !b.prose.trim();
        // 结构化 format：lead 或 items/groups/cols/cells 任一非空就算有内容
        const lead = b.lead?.trim() ?? '';
        if (lead) return false;
        if (b.format === 'flat-list') return b.items.length === 0;
        if (b.format === 'accordion') return b.groups.length === 0;
        if (b.format === 'compare') return (b.cols ?? []).length === 0 && (b.headers ?? []).length === 0;
        if (b.format === 'quad') return b.cells.length === 0;
        return false;
      })
      .map((k) => k.id);
    expect(empty).toEqual([]);
  });
});

describe('Aggregate health (smoke)', () => {
  it('checkAllIssues returns no errors', () => {
    const issues = checkAllIssues(data);
    const errors = issues.filter((i) => i.level === 'error');
    expect(errors, `${errors.length} errors found:\n  ${errors.slice(0, 10).map((e) => e.message).join('\n  ')}`).toEqual([]);
  });
});
