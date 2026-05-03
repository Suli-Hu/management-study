/**
 * KpBody discriminated union schema + helpers (v0.8.0 Stage 0)
 *
 * 验证：
 *   1. 5 种 format 的 zod schema happy path 解析通过
 *   2. invalid input 被正确拒绝（discriminator 错 / structure 错 / min/max 违反）
 *   3. emptyKpBody helper 输出能通过 schema 校验（除 min(1) 字段需 placeholder）
 *   4. parsedToStructured 把现有 ParsedBody 正确转结构化（lossless）
 *   5. structuredToSearchText 拼出可搜索文本
 *
 * 这套测试是 v0.8.0 后续 stage 的安全网 — schema 改了未跟代码变 → 此处先报错。
 */

import { describe, expect, test } from 'vitest';
import {
  KpBody,
  KpEvaluations,
  KpEvaluationsLang,
  NarrativeBody,
  FlatListBody,
  AccordionBody,
  CompareBody,
  QuadBody,
} from '~/schemas/kp-body-structured';
import {
  emptyKpBody,
  parsedToStructured,
  extractEvaluationsFromParsed,
  structuredToSearchText,
} from '~/lib/kp-body-helpers';
import { parseBody } from '~/lib/body-parser';

describe('KpBody schema — 5 种 format 各自', () => {
  test('NarrativeBody happy', () => {
    const r = NarrativeBody.safeParse({ format: 'narrative', prose: '正文内容' });
    expect(r.success).toBe(true);
  });

  test('FlatListBody happy', () => {
    const r = FlatListBody.safeParse({
      format: 'flat-list',
      lead: '导语',
      items: [{ name: '类型 1', desc: '描述 1' }, { name: '类型 2', desc: '描述 2' }],
    });
    expect(r.success).toBe(true);
  });

  test('FlatListBody 拒绝 items 为空', () => {
    const r = FlatListBody.safeParse({ format: 'flat-list', lead: '', items: [] });
    expect(r.success).toBe(false);
  });

  test('FlatListBody 拒绝 item.name 为空', () => {
    const r = FlatListBody.safeParse({
      format: 'flat-list',
      lead: '',
      items: [{ name: '', desc: '描述' }],
    });
    expect(r.success).toBe(false);
  });

  test('AccordionBody happy', () => {
    const r = AccordionBody.safeParse({
      format: 'accordion',
      lead: '导语',
      groups: [
        { title: 'group 1', items: [{ name: 'item 1', desc: '...' }] },
        { title: 'group 2', items: [] },
      ],
    });
    expect(r.success).toBe(true);
  });

  test('AccordionBody 拒绝 groups 为空', () => {
    const r = AccordionBody.safeParse({ format: 'accordion', lead: '', groups: [] });
    expect(r.success).toBe(false);
  });

  test('CompareBody happy', () => {
    const r = CompareBody.safeParse({
      format: 'compare',
      lead: '对比导语',
      cols: [
        { title: 'X 理论', keyword: '经济人', desc: '认为人是经济人', type: '', theories: '', detail: '' },
        { title: 'Y 理论', keyword: '社会人', desc: '认为人是社会人', type: '', theories: '', detail: '' },
      ],
    });
    expect(r.success).toBe(true);
  });

  test('CompareBody 拒绝 cols 少于 2', () => {
    const r = CompareBody.safeParse({
      format: 'compare',
      lead: '',
      cols: [{ title: 'X', keyword: '', desc: '', type: '', theories: '', detail: '' }],
    });
    expect(r.success).toBe(false);
  });

  test('QuadBody happy', () => {
    const r = QuadBody.safeParse({
      format: 'quad',
      lead: '矩阵导语',
      yAxis: '市场增长率',
      xAxis: '相对市场份额',
      cells: [
        { name: '问题', emoji: '❓', sub: '高增长 + 低份额', detail: '...' },
        { name: '明星', emoji: '⭐', sub: '高增长 + 高份额', detail: '...' },
        { name: '瘦狗', emoji: '🐕', sub: '低增长 + 低份额', detail: '...' },
        { name: '现金牛', emoji: '💰', sub: '低增长 + 高份额', detail: '...' },
      ],
    });
    expect(r.success).toBe(true);
  });

  test('QuadBody 拒绝 cells 不是 4 个 (3 个)', () => {
    const r = QuadBody.safeParse({
      format: 'quad',
      lead: '',
      yAxis: 'y',
      xAxis: 'x',
      cells: [
        { name: 'a', emoji: '', sub: '', detail: '' },
        { name: 'b', emoji: '', sub: '', detail: '' },
        { name: 'c', emoji: '', sub: '', detail: '' },
      ],
    });
    expect(r.success).toBe(false);
  });

  test('QuadBody 拒绝 cells 不是 4 个 (5 个)', () => {
    const r = QuadBody.safeParse({
      format: 'quad',
      lead: '',
      yAxis: 'y',
      xAxis: 'x',
      cells: Array.from({ length: 5 }, (_, i) => ({
        name: `c${i}`, emoji: '', sub: '', detail: '',
      })),
    });
    expect(r.success).toBe(false);
  });

  test('QuadBody 拒绝 yAxis/xAxis 为空', () => {
    const r = QuadBody.safeParse({
      format: 'quad',
      lead: '',
      yAxis: '',
      xAxis: 'x',
      cells: Array.from({ length: 4 }, () => ({ name: 'a', emoji: '', sub: '', detail: '' })),
    });
    expect(r.success).toBe(false);
  });
});

describe('KpBody discriminated union', () => {
  test('union 接受所有 5 种 format', () => {
    expect(KpBody.safeParse({ format: 'narrative', prose: 'x' }).success).toBe(true);
    expect(
      KpBody.safeParse({ format: 'flat-list', lead: '', items: [{ name: 'a', desc: 'b' }] }).success,
    ).toBe(true);
  });

  test('union 拒绝未知 format', () => {
    const r = KpBody.safeParse({ format: 'unknown', prose: 'x' });
    expect(r.success).toBe(false);
  });

  test('union 拒绝 narrative 缺 prose', () => {
    const r = KpBody.safeParse({ format: 'narrative' });
    expect(r.success).toBe(false);
  });

  test('strict() 拒绝多余字段（NarrativeBody）', () => {
    const r = NarrativeBody.safeParse({ format: 'narrative', prose: 'x', extra: 'y' });
    expect(r.success).toBe(false);
  });
});

describe('KpEvaluations schema', () => {
  test('happy path：6 字段全填', () => {
    const r = KpEvaluationsLang.safeParse({
      meaning: 'm', limit: 'l', example: 'e', response: 'r', application: 'a', analogy: 'an',
    });
    expect(r.success).toBe(true);
  });

  test('全空也 ok（每个字段 default ""）', () => {
    const r = KpEvaluationsLang.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({
        meaning: '', limit: '', example: '', response: '', application: '', analogy: '',
      });
    }
  });

  test('双语 zh/ja 各一份', () => {
    const r = KpEvaluations.safeParse({
      zh: { meaning: '义' },
      ja: { meaning: '義' },
    });
    expect(r.success).toBe(true);
  });

  test('strict() 拒绝未知字段', () => {
    const r = KpEvaluationsLang.safeParse({ meaning: 'm', unknown: 'x' });
    expect(r.success).toBe(false);
  });
});

describe('emptyKpBody helper', () => {
  test('narrative 空白能 schema parse', () => {
    const empty = emptyKpBody('narrative');
    expect(KpBody.safeParse(empty).success).toBe(true);
  });

  test('flat-list 空白带 placeholder item — schema parse 拒绝（min 1 但 name/desc 空）', () => {
    // 这是 expected：emptyFlatListBody 给编辑器初始化用，里面是 placeholder
    // 不应该过 schema 校验直接写入 — 用户必须填内容才能保存
    const empty = emptyKpBody('flat-list');
    const r = FlatListBody.safeParse(empty);
    expect(r.success).toBe(false);
  });

  test('accordion 空白带 placeholder group', () => {
    const empty = emptyKpBody('accordion');
    // group.title 空，schema 拒
    expect(AccordionBody.safeParse(empty).success).toBe(false);
  });

  test('compare 空白 2 列 placeholder', () => {
    const empty = emptyKpBody('compare');
    expect(CompareBody.safeParse(empty).success).toBe(false); // title 空
  });

  test('quad 空白 4 个 cell placeholder', () => {
    const empty = emptyKpBody('quad');
    // yAxis/xAxis/cell.name 空，schema 拒
    expect(QuadBody.safeParse(empty).success).toBe(false);
  });
});

describe('parsedToStructured — 旧 ParsedBody → 新 KpBody', () => {
  test('narrative round-trip', () => {
    const parsed = parseBody('正文 prose 内容', 'narrative');
    const structured = parsedToStructured(parsed);
    expect(structured).toEqual({ format: 'narrative', prose: '正文 prose 内容' });
    expect(KpBody.safeParse(structured).success).toBe(true);
  });

  test('flat-list 转换', () => {
    const body = '导语：◆ 类型 1——描述 1◆ 类型 2——描述 2';
    const parsed = parseBody(body, 'flat-list');
    const structured = parsedToStructured(parsed);
    expect(structured.format).toBe('flat-list');
    if (structured.format === 'flat-list') {
      expect(structured.lead).toBe('导语');
      expect(structured.items).toHaveLength(2);
      expect(structured.items[0]).toEqual({ name: '类型 1', desc: '描述 1' });
    }
    expect(KpBody.safeParse(structured).success).toBe(true);
  });

  test('accordion 转换', () => {
    const body = '导语<br>【组 1】<br>①item 1——desc 1<br>②item 2——desc 2<br>【组 2】<br>①item a——desc a';
    const parsed = parseBody(body, 'accordion');
    const structured = parsedToStructured(parsed);
    expect(structured.format).toBe('accordion');
    if (structured.format === 'accordion') {
      expect(structured.lead).toBe('导语');
      expect(structured.groups).toHaveLength(2);
      expect(structured.groups[0].title).toBe('组 1');
      expect(structured.groups[0].items).toHaveLength(2);
    }
    expect(KpBody.safeParse(structured).success).toBe(true);
  });

  test('quad 转换', () => {
    const body = '导语<quad>市场增长率,相对市场份额||明星|⭐|高+高|领先||问题|❓|高+低|抉择||瘦狗|🐕|低+低|剥离||现金牛|💰|低+高|挤奶</quad>';
    const parsed = parseBody(body, 'quad');
    const structured = parsedToStructured(parsed);
    expect(structured.format).toBe('quad');
    if (structured.format === 'quad') {
      expect(structured.yAxis).toBe('市场增长率');
      expect(structured.xAxis).toBe('相对市场份额');
      expect(structured.cells).toHaveLength(4);
      expect(structured.cells[0].name).toBe('明星');
    }
    expect(KpBody.safeParse(structured).success).toBe(true);
  });

  test('提取 evaluations from ParsedBody', () => {
    const body = '◆ 类型 1——描述 1◆意义——这是义◆局限——这是限';
    const parsed = parseBody(body, 'flat-list');
    const evals = extractEvaluationsFromParsed(parsed);
    expect(evals.meaning).toBe('这是义');
    expect(evals.limit).toBe('这是限');
    expect(evals.example).toBe('');
  });
});

describe('structuredToSearchText — kp_fts 用纯文本', () => {
  test('narrative 输出 prose 去 HTML', () => {
    const txt = structuredToSearchText({
      format: 'narrative',
      prose: '<strong>Maslow</strong> 提出<br>需求层次理论',
    });
    expect(txt).toBe('Maslow 提出 需求层次理论');
  });

  test('flat-list 拼接 lead + items', () => {
    const txt = structuredToSearchText({
      format: 'flat-list',
      lead: '消费者选择规则',
      items: [
        { name: '线性补偿型', desc: '加权选择' },
        { name: '辞书编纂型', desc: '逐项过滤' },
      ],
    });
    expect(txt).toContain('消费者选择规则');
    expect(txt).toContain('线性补偿型');
    expect(txt).toContain('加权选择');
    expect(txt).toContain('辞书编纂型');
  });

  test('quad 拼接 axes + cells', () => {
    const txt = structuredToSearchText({
      format: 'quad',
      lead: 'BCG 矩阵',
      yAxis: '市场增长率',
      xAxis: '相对市场份额',
      cells: [
        { name: '问题', emoji: '❓', sub: '高+低', detail: '抉择' },
        { name: '明星', emoji: '⭐', sub: '高+高', detail: '领先' },
        { name: '瘦狗', emoji: '🐕', sub: '低+低', detail: '剥离' },
        { name: '现金牛', emoji: '💰', sub: '低+高', detail: '挤奶' },
      ],
    });
    expect(txt).toContain('市场增长率');
    expect(txt).toContain('明星');
    expect(txt).toContain('挤奶');
    // emoji 不进搜索文本（结构里没拼）— 不验
  });
});
