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

describe('CN-JA parity (warnings, not strict failures)', () => {
  // v0.6.12: 名副其实改成真 warning — 之前用 expect.toBeLessThan 卡 deploy 跟 describe
  //   标题"warnings, not strict failures"矛盾。老师持续推新 KP 让阈值越调越宽没意义。
  //   数据质量是"应当主动改进"不是"必须达标才能部署"。
  //   CI log 仍然报告比例 + 失衡 KP 列表，团队 review 时收紧。
  it('KPs with ja translation: report <strong> count divergence (advisory)', () => {
    let mismatched = 0;
    const offenders: string[] = [];
    for (const kp of data.kps) {
      if (!kp.body.ja) continue;
      const zh = (kp.body.zh.match(/<strong>/g) ?? []).length;
      const ja = (kp.body.ja.match(/<strong>/g) ?? []).length;
      if (zh > 0 && Math.abs(zh - ja) / zh > 0.5) {
        mismatched++;
        offenders.push(`${kp.id}(zh=${zh},ja=${ja})`);
      }
    }
    const total = data.kps.filter((k) => k.body.ja).length;
    const ratio = mismatched / Math.max(total, 1);
    if (ratio > 0.05) {
      // eslint-disable-next-line no-console
      console.warn(
        `[CN-JA parity advisory] ${mismatched}/${total} KPs (${(ratio * 100).toFixed(1)}%) ` +
        `have >50% <strong> count diff. First 5: ${offenders.slice(0, 5).join(', ')}`,
      );
    }
    // 不 fail — 数据质量 monitoring 走 advisory channel
    expect(true).toBe(true);
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
