/**
 * tier algorithm tests (v0.5.1)
 *
 * 段位算法是学习记录模块的灵魂，最容易出 bug 的地方。这里覆盖：
 *   - 分数 → 段位映射边界
 *   - 同日累加 / 跨日衰减 / 衰减下界 0
 *   - 跨学派分数隔离
 *   - peak tier 历史最高记录
 *   - lastActiveDate / daysSinceLastActive
 *   - 跨年 / 跨月日期跳变
 *   - allSchools 显示策略
 *   - sort 稳定性
 */

import { describe, expect, test } from 'vitest';
import {
  computeTiers,
  computeTierForSchool,
  computeTimeline,
  scoreToTier,
  nextTierAfter,
  nextDay,
  daysBetween,
  TIERS,
  DECAY_PER_DAY,
  type TierSession,
} from '../src/lib/tier';

const TODAY = '2026-05-02';

// ============================================================
// scoreToTier — 分数 → 段位映射
// ============================================================

describe('scoreToTier', () => {
  test('0 分 → C', () => expect(scoreToTier(0)).toBe('C'));
  test('1 分 → C（C 段下限）', () => expect(scoreToTier(1)).toBe('C'));
  test('199 分 → C（B 阈值前一分）', () => expect(scoreToTier(199)).toBe('C'));
  test('200 分 → B（B 阈值精确）', () => expect(scoreToTier(200)).toBe('B'));
  test('399 分 → B（A 阈值前一分）', () => expect(scoreToTier(399)).toBe('B'));
  test('400 分 → A（A 阈值精确）', () => expect(scoreToTier(400)).toBe('A'));
  test('1000 分 → A（已最高，不会爆）', () => expect(scoreToTier(1000)).toBe('A'));
});

// ============================================================
// nextTierAfter — 下一段位
// ============================================================

describe('nextTierAfter', () => {
  test('C → B', () => expect(nextTierAfter('C')?.key).toBe('B'));
  test('B → A', () => expect(nextTierAfter('B')?.key).toBe('A'));
  test('A → null（已最高）', () => expect(nextTierAfter('A')).toBeNull());
});

// ============================================================
// 日期工具
// ============================================================

describe('nextDay / daysBetween', () => {
  test('普通日加一', () => expect(nextDay('2026-05-02')).toBe('2026-05-03'));
  test('跨月', () => expect(nextDay('2026-05-31')).toBe('2026-06-01'));
  test('跨年', () => expect(nextDay('2026-12-31')).toBe('2027-01-01'));
  test('闰年 2-29', () => expect(nextDay('2024-02-29')).toBe('2024-03-01'));
  test('daysBetween 同日', () => expect(daysBetween('2026-05-02', '2026-05-02')).toBe(0));
  test('daysBetween 一天', () => expect(daysBetween('2026-05-01', '2026-05-02')).toBe(1));
  test('daysBetween 跨月', () => expect(daysBetween('2026-04-30', '2026-05-02')).toBe(2));
});

// ============================================================
// computeTierForSchool — 单学派核心
// ============================================================

describe('computeTierForSchool — 空状态', () => {
  test('无 session → C 段，所有字段为初始', () => {
    const r = computeTierForSchool([], 'scientific', TODAY);
    expect(r.score).toBe(0);
    expect(r.totalEarned).toBe(0);
    expect(r.tier).toBe('C');
    expect(r.peakTier).toBe('C');
    expect(r.toNextTierScore).toBe(200);
    expect(r.nextTierThreshold).toBe(200);
    expect(r.lastActiveDate).toBeNull();
    expect(r.daysSinceLastActive).toBe(0);
    expect(r.sessionCount).toBe(0);
  });

  test('其他学派的 session 不影响本学派', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'human_relations', date: TODAY, durationMin: 100 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('C');
  });
});

describe('computeTierForSchool — 当天单 session', () => {
  test('100 分钟 → score 100, C 段（首日不扣衰减）', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 100 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(100);
    expect(r.totalEarned).toBe(100);
    expect(r.decayApplied).toBe(0);
    expect(r.tier).toBe('C');
    expect(r.toNextTierScore).toBe(100);
    expect(r.lastActiveDate).toBe(TODAY);
    expect(r.daysSinceLastActive).toBe(0);
  });

  test('200 分钟 → 精确踩 B 阈值', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 200 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(200);
    expect(r.tier).toBe('B');
    expect(r.toNextTierScore).toBe(200);
  });

  test('500 分钟 → A 段且 nextTier null', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 500 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(500);
    expect(r.tier).toBe('A');
    expect(r.toNextTierScore).toBeNull();
    expect(r.nextTierThreshold).toBeNull();
  });
});

describe('computeTierForSchool — 同日多 session 合并', () => {
  test('同一天两条 session 累加', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 30 },
      { schoolKey: 'scientific', date: TODAY, durationMin: 50 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(80);
    expect(r.sessionCount).toBe(2);
  });
});

describe('computeTierForSchool — 衰减', () => {
  test('1 天前学 30 分钟 → 今天 score 10（−20）', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2026-05-01', durationMin: 30 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(10);
    expect(r.totalEarned).toBe(30);
    expect(r.decayApplied).toBe(20);
    expect(r.lastActiveDate).toBe('2026-05-01');
    expect(r.daysSinceLastActive).toBe(1);
  });

  test('3 天前学 30 分钟 → 今天 score 0（衰减下界 0）', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2026-04-29', durationMin: 30 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(0);
    expect(r.totalEarned).toBe(30);
    expect(r.decayApplied).toBe(30); // 只扣实际有的，不扣到负
    expect(r.daysSinceLastActive).toBe(3);
  });

  test('100 分钟 day1 → 没事 day2 → 今天 day3 score 60（连扣 2 次 −20）', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2026-04-30', durationMin: 100 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(60);
    expect(r.decayApplied).toBe(40);
  });

  test('每天学 20 分钟刚好对冲衰减（净 0）', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2026-04-30', durationMin: 20 },
      { schoolKey: 'scientific', date: '2026-05-01', durationMin: 20 },
      { schoolKey: 'scientific', date: '2026-05-02', durationMin: 20 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    // day1: +20 = 20; day2: -20+20 = 20; day3 (today): -20+20 = 20
    expect(r.score).toBe(20);
  });

  test('每天学 30 分钟 → 净 +10 / 天', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2026-04-30', durationMin: 30 },
      { schoolKey: 'scientific', date: '2026-05-01', durationMin: 30 },
      { schoolKey: 'scientific', date: '2026-05-02', durationMin: 30 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    // day1: +30 = 30; day2: -20+30 = 40; day3 (today): -20+30 = 50
    expect(r.score).toBe(50);
  });
});

describe('computeTierForSchool — peak tier', () => {
  test('曾达 B 段然后跌回 C → tier=C, peakTier=B', () => {
    // 一天 250 → B（200 阈值）；隔 20 天没学 → 250 - 400 = max 0 → C
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2026-04-12', durationMin: 250 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.tier).toBe('C');
    expect(r.score).toBe(0);
    expect(r.peakTier).toBe('B');
  });

  test('从未达 B → peakTier C', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 50 },
    ];
    expect(computeTierForSchool(sessions, 'scientific', TODAY).peakTier).toBe('C');
  });

  test('曾达 A → peakTier A', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 450 },
    ];
    expect(computeTierForSchool(sessions, 'scientific', TODAY).peakTier).toBe('A');
  });
});

describe('computeTierForSchool — 跨年 / 长期', () => {
  test('跨年正确累计衰减', () => {
    // 2025-12-30 学 100 → 2026-01-01 today，跨过 2 个 0 点
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2025-12-30', durationMin: 100 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', '2026-01-01');
    // day1: +100; day2 0点: -20=80; day3 0点 (today): -20=60
    expect(r.score).toBe(60);
  });

  test('365 天 loop 性能可接受（不卡）', () => {
    // 一年前学一次，至今每天扣
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2025-05-02', durationMin: 100 },
    ];
    const start = Date.now();
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    const ms = Date.now() - start;
    expect(r.score).toBe(0); // 早就降到 0 了
    expect(ms).toBeLessThan(50);
  });
});

// ============================================================
// computeTiers — 多学派 / 显示策略
// ============================================================

describe('computeTiers — 多学派', () => {
  test('两个学派分数隔离', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 100 },
      { schoolKey: 'human_relations', date: TODAY, durationMin: 50 },
    ];
    const all = computeTiers(sessions, TODAY);
    expect(all).toHaveLength(2);
    const scientific = all.find((s) => s.schoolKey === 'scientific')!;
    const hr = all.find((s) => s.schoolKey === 'human_relations')!;
    expect(scientific.score).toBe(100);
    expect(hr.score).toBe(50);
  });

  test('按 score 降序排序，相同分数按 key 字母序', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 100 },
      { schoolKey: 'change', date: TODAY, durationMin: 200 },
      { schoolKey: 'austrian', date: TODAY, durationMin: 200 },
    ];
    const all = computeTiers(sessions, TODAY);
    expect(all.map((s) => s.schoolKey)).toEqual(['austrian', 'change', 'scientific']);
  });

  test('allSchools 选项：传入全部 → 无 session 学派也返回 score 0', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 100 },
    ];
    const all = computeTiers(sessions, TODAY, {
      allSchools: ['scientific', 'change', 'austrian'],
    });
    expect(all).toHaveLength(3);
    expect(all.find((s) => s.schoolKey === 'change')?.score).toBe(0);
    expect(all.find((s) => s.schoolKey === 'austrian')?.score).toBe(0);
  });

  test('不传 allSchools → 只返回有 session 的学派', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 100 },
    ];
    const all = computeTiers(sessions, TODAY);
    expect(all).toHaveLength(1);
  });

  test('空 sessions + 空 allSchools → 空数组', () => {
    expect(computeTiers([], TODAY)).toEqual([]);
  });

  test('空 sessions + 有 allSchools → 全 C 段 0 分', () => {
    const all = computeTiers([], TODAY, { allSchools: ['scientific', 'change'] });
    expect(all).toHaveLength(2);
    expect(all.every((s) => s.tier === 'C' && s.score === 0)).toBe(true);
  });
});

// ============================================================
// 边界值
// ============================================================

describe('computeTierForSchool — 边界', () => {
  test('duration 1 分钟（最小允许） → score 1', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 1 },
    ];
    expect(computeTierForSchool(sessions, 'scientific', TODAY).score).toBe(1);
  });

  test('duration 600 分钟（最大允许） → score 600 → A', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 600 },
    ];
    const r = computeTierForSchool(sessions, 'scientific', TODAY);
    expect(r.score).toBe(600);
    expect(r.tier).toBe('A');
  });

  test('衰减常量等于阈值差的一半（数学校验）', () => {
    expect(DECAY_PER_DAY).toBe(20);
    expect(TIERS[1].threshold - TIERS[0].threshold).toBe(200);
  });
});

// ============================================================
// computeTimeline — sparkline 用
// ============================================================

describe('computeTimeline', () => {
  test('无 session → 全 0 序列', () => {
    const tl = computeTimeline([], 'scientific', TODAY, 7);
    expect(tl).toHaveLength(7);
    expect(tl.every((p) => p.score === 0)).toBe(true);
  });

  test('窗口长度 = days', () => {
    const tl = computeTimeline([], 'scientific', TODAY, 30);
    expect(tl).toHaveLength(30);
  });

  test('窗口最后一天 = today', () => {
    const tl = computeTimeline([], 'scientific', TODAY, 5);
    expect(tl[tl.length - 1].date).toBe(TODAY);
  });

  test('单 session 当天 → 最后一天有分数', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 50 },
    ];
    const tl = computeTimeline(sessions, 'scientific', TODAY, 7);
    expect(tl[tl.length - 1].score).toBe(50);
    // 之前几天还是 0
    expect(tl.slice(0, -1).every((p) => p.score === 0)).toBe(true);
  });

  test('每天 30min 学 7 天 → 序列净 +10/天', () => {
    const sessions: TierSession[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${TODAY}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (6 - i));
      sessions.push({ schoolKey: 'scientific', date: d.toISOString().slice(0, 10), durationMin: 30 });
    }
    const tl = computeTimeline(sessions, 'scientific', TODAY, 7);
    // day0: +30 = 30; day1: -20+30 = 40; day2: 50; ...; day6: 90
    expect(tl.map((p) => p.score)).toEqual([30, 40, 50, 60, 70, 80, 90]);
  });

  test('窗口起点之前的 session 仍按天演化进窗口', () => {
    // 30 天前学 100 → 之后每天扣 20，10 天后归 0
    // 窗口 7 天，起点 today-6，session 在 today-30 → 窗口内全 0
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: '2026-04-02', durationMin: 100 },
    ];
    const tl = computeTimeline(sessions, 'scientific', TODAY, 7);
    expect(tl.every((p) => p.score === 0)).toBe(true);
  });

  test('跨学派隔离', () => {
    const sessions: TierSession[] = [
      { schoolKey: 'scientific', date: TODAY, durationMin: 100 },
      { schoolKey: 'change', date: TODAY, durationMin: 50 },
    ];
    const a = computeTimeline(sessions, 'scientific', TODAY, 3);
    const b = computeTimeline(sessions, 'change', TODAY, 3);
    expect(a[a.length - 1].score).toBe(100);
    expect(b[b.length - 1].score).toBe(50);
  });

  test('30 天 timeline 性能 < 50ms', () => {
    const sessions: TierSession[] = [];
    for (let i = 0; i < 30; i++) {
      sessions.push({
        schoolKey: 'scientific',
        date: TODAY,
        durationMin: 30,
      });
    }
    const start = Date.now();
    const tl = computeTimeline(sessions, 'scientific', TODAY, 30);
    const ms = Date.now() - start;
    expect(tl).toHaveLength(30);
    expect(ms).toBeLessThan(50);
  });
});
