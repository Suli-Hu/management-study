/**
 * v0.11.64 server-side ja 质量硬校验单元测试
 */

import { describe, expect, test } from 'vitest';
import { validateJaQuality, violationsToDetail } from '~/lib/ja-quality-check';
import type { KpBody } from '~/schemas/kp-body-structured';

function narr(prose: string): KpBody {
  return { format: 'narrative', prose };
}

describe('validateJaQuality', () => {
  test('正常 ja 内容 → 0 violations', () => {
    const v = validateJaQuality({
      title: 'Vroom-Yetton 意思決定モデル',
      body: narr('組織構造はコンティンジェンシー理論に従う。'),
    });
    expect(v).toEqual([]);
  });

  test('title 含「権変」(中文借词) → 命中 critical', () => {
    const v = validateJaQuality({ title: '技術-構造権変論' });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].field).toBe('title.ja');
    expect(v[0].rule).toBe('権変');
    expect(v[0].severity).toBe('critical');
    expect(v[0].matches).toContain('権変');
  });

  test('body 含「情境」(中文残留) → 命中 critical', () => {
    const v = validateJaQuality({ body: narr('リーダーは情境に応じてスタイルを変える。') });
    expect(v.some((x) => x.rule === '情境')).toBe(true);
  });

  test('body 含 Latin 中点 U+00B7 → 命中 critical', () => {
    const v = validateJaQuality({ body: narr('コンティンジェンシー·状況理論において。') });
    expect(v.some((x) => x.rule === 'Latin 中点 U+00B7')).toBe(true);
  });

  test('日文中点 U+30FB 正确 → 不命中', () => {
    const v = validateJaQuality({ body: narr('コンティンジェンシー・状況理論において。') });
    expect(v.filter((x) => x.severity === 'critical')).toEqual([]);
  });

  test('純中文段（15+ 汉字无假名）→ 命中', () => {
    const v = validateJaQuality({ body: narr('组织结构应匹配技术类型这是权变理论的核心命题没有日语字符。') });
    expect(v.some((x) => x.rule === '純中文段')).toBe(true);
  });

  test('短中文片段（< 15 汉字）→ 不命中纯中文段', () => {
    const v = validateJaQuality({ body: narr('組織構造（结构）はコンティンジェンシーに従う。') });
    expect(v.filter((x) => x.rule === '純中文段')).toEqual([]);
  });

  test('「組織合法性」→ 应改「組織の正統性」', () => {
    const v = validateJaQuality({ body: narr('組織合法性は重要な概念である。') });
    expect(v.some((x) => x.rule === '組織合法性')).toBe(true);
  });

  test('「無差異領域」→ 应改「無関心圏」', () => {
    const v = validateJaQuality({ body: narr('無差異領域はバーナードの概念。') });
    expect(v.some((x) => x.rule === '無差異領域')).toBe(true);
  });

  test('「カリスマ的権威」→ 应改「カリスマ的支配」', () => {
    const v = validateJaQuality({ body: narr('カリスマ的権威はウェーバーの3類型の一つ。') });
    expect(v.some((x) => x.rule === 'カリスマ的権威')).toBe(true);
  });

  test('「サーバントリーダーシップ」(无中点) → 命中', () => {
    const v = validateJaQuality({ body: narr('サーバントリーダーシップはグリーンリーフが提唱した。') });
    expect(v.some((x) => x.rule === 'サーバントリーダーシップ無中点')).toBe(true);
  });

  test('「サーバント・リーダーシップ」(有中点) → 不命中', () => {
    const v = validateJaQuality({ body: narr('サーバント・リーダーシップはグリーンリーフが提唱した。') });
    expect(v.filter((x) => x.rule === 'サーバントリーダーシップ無中点')).toEqual([]);
  });

  test('evaluations.ja 含违规 → 命中 evaluations.ja 字段', () => {
    const v = validateJaQuality({
      evaluations: { meaning: '組織合法性に関する評価' },
    });
    expect(v.some((x) => x.field === 'evaluations.ja' && x.rule === '組織合法性')).toBe(true);
  });

  test('多字段违规 → 全部列出', () => {
    const v = validateJaQuality({
      title: '権変論',
      body: narr('情境に応じる。'),
    });
    expect(v.filter((x) => x.field === 'title.ja' && x.rule === '権変').length).toBe(1);
    expect(v.filter((x) => x.field === 'body.ja' && x.rule === '情境').length).toBe(1);
  });

  test('matches 限制 5 个', () => {
    const v = validateJaQuality({
      body: narr('権変権変権変権変権変権変権変権変。'),
    });
    const m = v.find((x) => x.rule === '権変');
    expect(m).toBeDefined();
    expect(m!.matches.length).toBeLessThanOrEqual(5);
  });

  test('input 全空 → 0 violations', () => {
    expect(validateJaQuality({})).toEqual([]);
  });
});

describe('violationsToDetail', () => {
  test('结构正确', () => {
    const v = validateJaQuality({ title: '権変論' });
    const detail = violationsToDetail(v);
    expect(detail.critical_count).toBe(1);
    expect(detail.warning_count).toBe(0);
    expect(detail.violations).toEqual(v);
    expect(detail.guidance).toContain('japanese-academic-translation');
  });
});
