/**
 * v0.8.0 Stage 2 — 新 vs 旧 renderer HTML parity 测试
 *
 * 验证：把同一个 KP 的 body string + format 跑：
 *   1. 旧 renderer: renderBody({ fmt, body, accentHex }) → HTML A
 *   2. 新 renderer: parseBody → parsedToStructured → renderStructuredBody → HTML B
 * 应该 HTML A === HTML B（容差：whitespace 规范化）
 *
 * 这是 Stage 2 切换的核心安全网：保证用户视觉零变化。
 *
 * 注意：parity 不要求 byte-for-byte 完全一致 — render-body.ts 输出含 template literal
 * 引入的 leading/trailing whitespace + 缩进。我们 normalize 后比对。
 */

import { describe, expect, test } from 'vitest';
import { renderBody, renderBodyForSchool } from '~/lib/render-body';
import { renderStructuredBody } from '~/lib/render-body-structured';
import { parseBody } from '~/lib/body-parser';
import { parsedToStructured } from '~/lib/kp-body-helpers';

const ACCENT = '#007AFF';

/**
 * 规范化 HTML：连续 whitespace → 单空格；移除 > 和 < 周围的 whitespace。
 * 让两个语义相同但 leading whitespace 不同的 HTML 视为等价。
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

function pairFor(body: string, fmt: 'narrative' | 'flat-list' | 'accordion' | 'compare' | 'quad', variant: 'detail' | 'school' = 'detail') {
  const parsed = parseBody(body, fmt);
  const structured = parsedToStructured(parsed);
  const oldHtml = variant === 'school'
    ? renderBodyForSchool({ fmt, body, accentHex: ACCENT })
    : renderBody({ fmt, body, accentHex: ACCENT });
  const newHtml = renderStructuredBody({ body: structured, accentHex: ACCENT, variant });
  return { oldHtml, newHtml };
}

describe('Stage 2 parity — narrative', () => {
  test('简单 prose', () => {
    const { oldHtml, newHtml } = pairFor('单段叙事正文', 'narrative');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });

  test('多段 with <br>', () => {
    const { oldHtml, newHtml } = pairFor('段 1<br>段 2<br>段 3', 'narrative');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });

  test('含 <strong>', () => {
    const { oldHtml, newHtml } = pairFor('开头 <strong>重点</strong> 结尾', 'narrative');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });
});

describe('Stage 2 parity — flat-list', () => {
  test('lead + 3 items', () => {
    // 用 <br>◆ 分隔 lead 和 items（避免触发旧 renderer 的"name 空"lead 检测）
    const body = '导语<br>◆类型 A——desc A◆类型 B——desc B◆类型 C——desc C';
    const { oldHtml, newHtml } = pairFor(body, 'flat-list');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });

  test('无 lead', () => {
    const body = '◆类型 A——desc A◆类型 B——desc B';
    const { oldHtml, newHtml } = pairFor(body, 'flat-list');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });

  test('注：旧 renderer "导语：◆" 有 lead 检测脆弱性，新 renderer 更准（Stage 2 的修复目标之一）', () => {
    // 旧 renderer 把"导语："当成 item[0] 渲染（带序号 1），新 renderer 正确识别 lead
    // 见 m178 原 bug。这是 Stage 2 切换的额外好处。
    const body = '导语：◆类型 A——desc A◆类型 B——desc B';
    const { oldHtml, newHtml } = pairFor(body, 'flat-list');
    // 新 renderer 应该有 body-lead；旧 renderer 没有
    expect(newHtml).toContain('body-lead');
    expect(newHtml).toContain('导语');
    // items 数量：新 = 2（lead 拆出去），旧 = 3（导语当 item）
    // 用 class="body-card" 精确匹配避免与 body-card-content 子类冲突
    expect((newHtml.match(/class="body-card"/g) ?? []).length).toBe(2);
    expect((oldHtml.match(/class="body-card"/g) ?? []).length).toBe(3);
  });
});

describe('Stage 2 parity — accordion', () => {
  test('2 组 each 2 items', () => {
    const body = '导语<br>【组 A】<br>①item 1——desc 1<br>②item 2——desc 2<br>【组 B】<br>①item a——desc a<br>②item b——desc b';
    const { oldHtml, newHtml } = pairFor(body, 'accordion');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });

  test('section name 含括号 sub', () => {
    const body = '导语<br>【4 种类型（变革对象维度）】<br>①item 1——d 1<br>②item 2——d 2';
    const { oldHtml, newHtml } = pairFor(body, 'accordion');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });
});

describe('Stage 2 parity — quad', () => {
  test('BCG 矩阵风格（v0.8.4：用三段 yAxis "低-增长率-高" / xAxis "低-份额-高"）', () => {
    // 旧 DSL string 仍是单字符串 axes — body-parser 不变。新 schema 通过 splitQuadAxisString 拆。
    const body = '导语<quad>低-增长率-高,低-份额-高||明星|⭐|高+高|领先位置||问题|❓|高+低|抉择||瘦狗|🐕|低+低|剥离||现金牛|💰|低+高|挤奶</quad>';
    const { oldHtml, newHtml } = pairFor(body, 'quad');
    // 软 parity：双方都含 4 个 quad-cell
    expect((oldHtml.match(/quad-cell/g) ?? []).length).toBe(4);
    expect((newHtml.match(/quad-cell/g) ?? []).length).toBe(4);
    // 双方都含象限名
    for (const name of ['明星', '问题', '瘦狗', '现金牛']) {
      expect(oldHtml).toContain(name);
      expect(newHtml).toContain(name);
    }
    // 新 renderer 重组的 axis label
    expect(newHtml).toContain('低-增长率-高');
    expect(newHtml).toContain('低-份额-高');
  });
});

describe('Stage 2 parity — compare（软 parity：旧按位置切，新按字段名 — 不要求 byte-byte）', () => {
  test('detail variant: 表格 双方都渲染 N 列', () => {
    // 注意：旧 parseBody 用 split('||') 拆 cols；新 schema 用 .min(2) cols 数组
    // fixture：2 列 × 6 字段
    const body = '导语<compare>X 理论|经济人|认为人是经济人||Y 理论|社会人|认为人是社会人</compare>';
    const { oldHtml, newHtml } = pairFor(body, 'compare', 'detail');
    expect(oldHtml).toContain('cmp-table');
    expect(newHtml).toContain('cmp-table');
    // 双方都含 2 个 cmp-row（每列一个）
    expect((oldHtml.match(/cmp-row/g) ?? []).length).toBe(2);
    expect((newHtml.match(/cmp-row/g) ?? []).length).toBe(2);
    // 关键内容都存在
    for (const s of ['X 理论', 'Y 理论', '经济人', '社会人']) {
      expect(oldHtml).toContain(s);
      expect(newHtml).toContain(s);
    }
  });

  test('school variant: 卡片 双方都渲染 N 卡', () => {
    const body = '导语<compare>X 理论|经济人|认为人是经济人||Y 理论|社会人|认为人是社会人</compare>';
    const { oldHtml, newHtml } = pairFor(body, 'compare', 'school');
    expect(oldHtml).toContain('cmpc-grid');
    expect(newHtml).toContain('cmpc-grid');
    expect((oldHtml.match(/cmpc-card/g) ?? []).length).toBe(2);
    expect((newHtml.match(/cmpc-card/g) ?? []).length).toBe(2);
  });
});
