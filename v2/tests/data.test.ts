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
  it('has at least one school per discipline', () => {
    for (const d of data.disciplines) {
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
    const broken: string[] = [];
    for (const kp of data.kps) {
      for (const sc of kp.scholars) {
        if (!data.scholarKeys.has(sc)) broken.push(`${kp.id} → ${sc}`);
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

describe('CN-JA parity (warnings, not strict failures)', () => {
  it('KPs with ja translation should have similar <strong> count', () => {
    let mismatched = 0;
    for (const kp of data.kps) {
      if (!kp.body.ja) continue;
      const zh = (kp.body.zh.match(/<strong>/g) ?? []).length;
      const ja = (kp.body.ja.match(/<strong>/g) ?? []).length;
      if (zh > 0 && Math.abs(zh - ja) / zh > 0.5) mismatched++;
    }
    // 允许 < 5% KP 有大差异（部分 v1 历史遗留）
    const total = data.kps.filter((k) => k.body.ja).length;
    expect(mismatched / Math.max(total, 1)).toBeLessThan(0.05);
  });
});

describe('Format rules', () => {
  it('no KP body uses ◆tag with colon (must be ——)', () => {
    const offenders: string[] = [];
    for (const kp of data.kps) {
      if (/◆\s*(意义|局限|例子|应对|应用|比喻)\s*[：:]/.test(kp.body.zh)) {
        offenders.push(kp.id);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('no KP has empty body.zh', () => {
    const empty = data.kps.filter((k) => !k.body.zh.trim()).map((k) => k.id);
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
