/**
 * v0.11.64 server-side ja 质量硬校验 — `patchKpRecord` / `createKpRecord` 写入时调用。
 *
 * 设计原则：
 *   - 只对**本次 PATCH/CREATE input 中显式包含的 ja 字段**做校验
 *     不校验已有数据库内的旧 ja（避免老脏数据卡住改 zh）
 *   - 命中 critical → 422 `ja_quality_failed` 拒绝
 *   - 规则来自 `~/.claude/skills/japanese-academic-translation/SKILL.md` §速查表「中文借词 / 机翻黑名单」
 *
 * 与 skill 5 阶段流程的关系：
 *   - skill 是质量上限（agent 跑 5 阶段产出高质量翻译）
 *   - 本校验是质量下限（server 兜底防止任何 agent / 老师写低质量 ja）
 *   - 两者互补，不冲突
 */

import type { KpBody } from '~/schemas/kp-body-structured';

export interface JaQualityRule {
  /** 规则名 — 日志 / 报错时给老师看 */
  name: string;
  /** 命中模式（global flag） */
  pattern: RegExp;
  /** critical = 422 block；warning = 不 block 仅返回 */
  severity: 'critical' | 'warning';
  /** 修复建议 */
  hint: string;
}

export interface JaQualityViolation {
  /** 命中字段 — 'title.ja' / 'body.ja' / 'evaluations.ja' */
  field: string;
  /** 规则名 */
  rule: string;
  severity: 'critical' | 'warning';
  /** 命中片段（最多 5 个，避免 response 太大） */
  matches: string[];
  hint: string;
}

/**
 * 规则库 — 基于 skill 速查表「中文借词 / 机翻黑名单」+ 历次审查发现。
 * 增量维护：发现新的机翻模式 → 加到此处 + 同步 skill SKILL.md。
 */
const RULES: JaQualityRule[] = [
  // ===== 中文借词（critical block） =====
  { name: '権変', pattern: /権変/g, severity: 'critical', hint: '应改「コンティンジェンシー」(skill 速查表 §权变论)' },
  { name: '情境', pattern: /情境/g, severity: 'critical', hint: '应改「状況」(中文借词)' },
  { name: '颠覆', pattern: /颠覆/g, severity: 'critical', hint: '应改「覆す」(中文残留)' },
  { name: '情況的', pattern: /情況的/g, severity: 'critical', hint: '应改「状況的」' },
  { name: '組織合法性', pattern: /組織合法性|合法性源泉/g, severity: 'critical', hint: '应改「組織の正統性」(skill §Weber 体系)' },
  { name: '課題次元', pattern: /課題次元/g, severity: 'critical', hint: '应改「構造づくり」(Ohio 双轴 skill §Leadership)' },
  { name: '関係次元', pattern: /関係次元/g, severity: 'critical', hint: '应改「配慮」(Ohio 双轴)' },
  { name: '専門家権力', pattern: /専門家権力/g, severity: 'critical', hint: '应改「専門権力」(skill §Power 5 源泉)' },
  { name: '無差異領域', pattern: /無差異領域|無差別ゾーン|無差別領域/g, severity: 'critical', hint: '应改「無関心圏」(Barnard 标准译 skill §Barnard 体系)' },
  { name: 'カリスマ的権威', pattern: /カリスマ的権威/g, severity: 'critical', hint: '应改「カリスマ的支配」(Weber Herrschaft 标准译)' },
  { name: '合法的権威', pattern: /合法的権威/g, severity: 'critical', hint: '应改「合法的支配」' },
  { name: '伝統的権威', pattern: /伝統的権威/g, severity: 'critical', hint: '应改「伝統的支配」' },
  { name: 'リーダーシップ効率', pattern: /リーダーシップ効率/g, severity: 'critical', hint: '应改「リーダーシップ効果 / 有効性」(efficiency vs effectiveness 混用)' },
  { name: '頭領', pattern: /頭領/g, severity: 'critical', hint: '应改「ヘッドシップ」(学术术语)' },
  { name: '案例', pattern: /案例/g, severity: 'critical', hint: '应改「事例」(中文借词)' },
  { name: '分歧', pattern: /分歧/g, severity: 'critical', hint: '应改「分岐」(中文简体残留)' },
  { name: '叛乱', pattern: /叛乱/g, severity: 'critical', hint: '应改「反乱」(古风/中文)' },

  // ===== 标点 / 字符 =====
  { name: 'Latin 中点 U+00B7', pattern: /·/g, severity: 'critical', hint: '应改日文中点 U+30FB「・」(skill §阶段 5 grep)' },
  { name: 'サーバントリーダーシップ無中点', pattern: /サーバントリーダーシップ/g, severity: 'critical', hint: '应改「サーバント・リーダーシップ」(必加中点 skill §Leadership)' },

  // ===== 纯中文段（最严重的机翻 fallback）=====
  { name: '純中文段', pattern: /[一-鿿]{15,}(?![぀-ヿ])/g, severity: 'critical', hint: '检测到 15+ 连续汉字且后续无平假名/片假名 — 疑似未翻译 zh 直接复制到 ja' },
];

/**
 * 检查 ja 内容是否违反规则。
 *
 * @param input 本次 PATCH/CREATE 提交的 ja 字段（部分字段可省略）
 * @returns 违规列表（空数组 = 通过）
 */
export function validateJaQuality(input: {
  title?: string | null;
  body?: KpBody;
  evaluations?: unknown;
}): JaQualityViolation[] {
  const texts: { field: string; text: string }[] = [];
  if (input.title) texts.push({ field: 'title.ja', text: input.title });
  if (input.body) texts.push({ field: 'body.ja', text: JSON.stringify(input.body) });
  if (input.evaluations) texts.push({ field: 'evaluations.ja', text: JSON.stringify(input.evaluations) });

  const violations: JaQualityViolation[] = [];
  for (const { field, text } of texts) {
    for (const rule of RULES) {
      const matches = Array.from(text.matchAll(rule.pattern), (m) => m[0]);
      if (matches.length > 0) {
        violations.push({
          field,
          rule: rule.name,
          severity: rule.severity,
          matches: matches.slice(0, 5),
          hint: rule.hint,
        });
      }
    }
  }
  return violations;
}

/**
 * 把违规列表整成 422 response 的 detail。
 */
export function violationsToDetail(violations: JaQualityViolation[]): {
  critical_count: number;
  warning_count: number;
  violations: JaQualityViolation[];
  guidance: string;
} {
  const critical = violations.filter((v) => v.severity === 'critical');
  return {
    critical_count: critical.length,
    warning_count: violations.length - critical.length,
    violations,
    guidance:
      '日文翻译需遵守 japanese-academic-translation skill 速查表的学界标准译法。详见 ~/.claude/skills/japanese-academic-translation/SKILL.md',
  };
}
