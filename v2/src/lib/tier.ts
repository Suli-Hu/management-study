/**
 * Tier algorithm — 学派段位纯函数（v0.5.1）
 *
 * 规则（PRD §4.3，MVP 3 级）：
 *   - 1 分钟学习 = +1 分（计入 KP.schools[0]，单一主学派）
 *   - 每天 0 点 −20 分（衰减），下界 0
 *   - 段位阈值：C(0) → B(200) → A(400)，跌破降级，记录 peakTier
 *
 * 衰减语义：分数从 firstSession 起按天演化——每跨过一个 0 点扣 20，
 * 最低 0；当天的 session 直接累加。所以纯数学公式 `total - days*20` 不对，
 * 必须按天 loop（避免负数累积）。1 年 365 天 loop < 1ms，性能足够。
 *
 * 时区：date 是 'YYYY-MM-DD' 字符串，由调用方按用户时区算（前端浏览器
 * timezone）。本文件不感知时区。
 *
 * 不感知 KP / school 内容数据；调用方负责把 session 的 KP 解析到 schoolKey
 * （取 kp.schools[0]），传纯字符串进来。
 */

// ============================================================
// 常量 & 类型
// ============================================================

export const POINTS_PER_MIN = 1;
export const DECAY_PER_DAY = 20;

export type Tier = 'C' | 'B' | 'A';

export interface TierDef {
  readonly key: Tier;
  readonly threshold: number;
}

/** MVP 3 级段位定义。扩展到 9 级时改这里就好（C/B−/B/B+/A−/A/A+/S−/S）。 */
export const TIERS: readonly TierDef[] = [
  { key: 'C', threshold: 0 },
  { key: 'B', threshold: 200 },
  { key: 'A', threshold: 400 },
] as const;

/** 段位榜显示策略 C：有分数学派浮顶 + C 段折叠（前端用，常量定义放这里方便测试） */
export const C_SEGMENT_COLLAPSE_THRESHOLD = TIERS[1].threshold; // 即 B 段阈值 200

export interface TierSession {
  /** 主学派 key（已由调用方从 kp.schools[0] 解出） */
  schoolKey: string;
  /** YYYY-MM-DD */
  date: string;
  /** 1 ≤ x ≤ 600 */
  durationMin: number;
}

export interface SchoolTierState {
  schoolKey: string;
  /** 当前实际分数（已扣衰减，下界 0） */
  score: number;
  /** 历史累计获得分（无衰减，纯加） */
  totalEarned: number;
  /** 累计扣的衰减分（统计用） */
  decayApplied: number;
  /** 当前段位 */
  tier: Tier;
  /** 历史最高段位（peakTier ≥ tier） */
  peakTier: Tier;
  /** 距下一段位还差多少分；A 段（已最高）返回 null */
  toNextTierScore: number | null;
  /** 下一段位阈值；A 段返回 null */
  nextTierThreshold: number | null;
  /** 最近一次有 session 的日期 YYYY-MM-DD；无 session 返回 null */
  lastActiveDate: string | null;
  /** 距最后活动日的整天数；无 session 返回 0 */
  daysSinceLastActive: number;
  /** 这个学派的总 session 数（含历史） */
  sessionCount: number;
}

// ============================================================
// 主入口
// ============================================================

/**
 * 算给定 sessions 的所有学派段位状态。
 *
 * @param sessions 全部 sessions（已映射到 schoolKey）
 * @param today YYYY-MM-DD（调用方按用户时区算今天）
 * @param options.allSchools 段位榜显示策略 C：传入"该学科全部 55 学派"，
 *   会保证返回值包含每个学派（无 session 的也返回 score=0 状态）。不传则
 *   只返回有 session 的学派。
 */
export function computeTiers(
  sessions: readonly TierSession[],
  today: string,
  options?: { allSchools?: readonly string[] },
): SchoolTierState[] {
  const allKeys = new Set<string>();
  if (options?.allSchools) {
    for (const k of options.allSchools) allKeys.add(k);
  }
  for (const s of sessions) {
    allKeys.add(s.schoolKey);
  }

  return [...allKeys]
    .map((schoolKey) => computeTierForSchool(sessions, schoolKey, today))
    .sort((a, b) => b.score - a.score || a.schoolKey.localeCompare(b.schoolKey));
}

/**
 * 算单个学派的段位状态。
 * 算法：按日期分组 sessions，从 firstDate 到 today 按天演化。
 */
export function computeTierForSchool(
  sessions: readonly TierSession[],
  schoolKey: string,
  today: string,
): SchoolTierState {
  const own = sessions.filter((s) => s.schoolKey === schoolKey);

  if (own.length === 0) {
    return emptyTierState(schoolKey);
  }

  // 按日期分组累加（同一天多 session 合并）
  const byDate = new Map<string, number>();
  for (const s of own) {
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.durationMin * POINTS_PER_MIN);
  }

  const dates = [...byDate.keys()].sort();
  const firstDate = dates[0];
  const lastActiveDate = dates[dates.length - 1];

  let score = 0;
  let totalEarned = 0;
  let decayApplied = 0;
  let peakScore = 0;

  let cur = firstDate;
  let isFirstDay = true;
  while (cur <= today) {
    if (!isFirstDay) {
      const before = score;
      score = Math.max(0, score - DECAY_PER_DAY);
      decayApplied += before - score;
    }
    const earned = byDate.get(cur) ?? 0;
    score += earned;
    totalEarned += earned;
    if (score > peakScore) peakScore = score;
    isFirstDay = false;
    cur = nextDay(cur);
  }

  const tier = scoreToTier(score);
  const peakTier = scoreToTier(peakScore);
  const next = nextTierAfter(tier);

  return {
    schoolKey,
    score,
    totalEarned,
    decayApplied,
    tier,
    peakTier,
    toNextTierScore: next ? next.threshold - score : null,
    nextTierThreshold: next ? next.threshold : null,
    lastActiveDate,
    daysSinceLastActive: daysBetween(lastActiveDate, today),
    sessionCount: own.length,
  };
}

// ============================================================
// Helpers（exported for testing）
// ============================================================

/** 分数 → 段位。score 落到最大不超过它的 threshold 段位。 */
export function scoreToTier(score: number): Tier {
  let result: Tier = TIERS[0].key;
  for (const t of TIERS) {
    if (score >= t.threshold) result = t.key;
  }
  return result;
}

/** 给定当前段位，返回下一段位定义；已最高返回 null */
export function nextTierAfter(tier: Tier): TierDef | null {
  const idx = TIERS.findIndex((t) => t.key === tier);
  if (idx < 0 || idx >= TIERS.length - 1) return null;
  return TIERS[idx + 1];
}

/** YYYY-MM-DD 加一天，跨年/跨月正确处理 */
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 两个 YYYY-MM-DD 之间的天数差（end - start，可为 0 或负） */
export function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// ============================================================
// v0.5.4: 历史时间线（sparkline 用）
// ============================================================

export interface TimelinePoint {
  date: string;   // YYYY-MM-DD
  score: number;  // 当天结束时的分数（已扣衰减，下界 0）
}

/**
 * 给定 sessions + schoolKey + today + days，返回最近 days 天每天 end-of-day
 * 分数序列。算法跟 computeTierForSchool 一致（按天 loop + 衰减 + 同日累加），
 * 区别是把每天的 score push 到数组而不是只返回最终值。
 *
 * 用于段位榜的 30 天 sparkline。
 *
 * 注意：分数演化从 firstSessionDate 起算，但只返回 [today - days + 1, today]
 * 区间内的点。如果 firstSession 在窗口之前，loop 仍从 firstSession 开始保证
 * 衰减/peak 算对，只是 push 时筛选窗口内的天。
 */
export function computeTimeline(
  sessions: readonly TierSession[],
  schoolKey: string,
  today: string,
  days: number,
): TimelinePoint[] {
  const own = sessions.filter((s) => s.schoolKey === schoolKey);

  // 计算窗口起点
  const windowStart = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    return d.toISOString().slice(0, 10);
  })();

  // 窗口内每天先填 score=0（万一 own 完全没数据也能返回完整 days 长度）
  const window = new Map<string, number>();
  let cur = windowStart;
  while (cur <= today) {
    window.set(cur, 0);
    cur = nextDay(cur);
  }

  if (own.length === 0) {
    return [...window.entries()].map(([date]) => ({ date, score: 0 }));
  }

  // 按日期累加
  const byDate = new Map<string, number>();
  for (const s of own) {
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.durationMin * POINTS_PER_MIN);
  }

  const dates = [...byDate.keys()].sort();
  const firstSessionDate = dates[0];
  // loop 起点：firstSessionDate 和 windowStart 取较早的
  const loopStart = firstSessionDate < windowStart ? firstSessionDate : windowStart;

  let score = 0;
  let isFirstDay = true;
  let p = loopStart;
  while (p <= today) {
    if (!isFirstDay) {
      score = Math.max(0, score - DECAY_PER_DAY);
    }
    const earned = byDate.get(p) ?? 0;
    score += earned;
    isFirstDay = false;
    if (window.has(p)) window.set(p, score);
    p = nextDay(p);
  }

  return [...window.entries()].map(([date, s]) => ({ date, score: s }));
}

function emptyTierState(schoolKey: string): SchoolTierState {
  return {
    schoolKey,
    score: 0,
    totalEarned: 0,
    decayApplied: 0,
    tier: 'C',
    peakTier: 'C',
    toNextTierScore: TIERS[1].threshold,
    nextTierThreshold: TIERS[1].threshold,
    lastActiveDate: null,
    daysSinceLastActive: 0,
    sessionCount: 0,
  };
}
