/**
 * render-body smoke tests (v0.5.1)
 *
 * 旧 test 移除：v0.5.1 前 renderBody 是「按 body 内容自动检测格式」单一函数；
 * 新设计是 `renderBody({ fmt, body, accentHex })` 显式派发到 5 个 renderer。
 * 老测试的 HTML 输出全部不再适用（class name / 结构都不同）。
 *
 * 这里是新设计的 smoke tests：每种 format 跑一次，验证结构 class 出现 + 不抛错。
 */

import { describe, expect, test } from 'vitest';
import {
  renderBody, renderBodyForSchool,
  renderNarrative, renderFlatList, renderAccordion, renderCompare, renderCompareCards, renderQuad,
  renderEvalModule,
} from '../src/lib/render-body';

const ACCENT = '#007AFF';

describe('renderBody — dispatch by format', () => {
  test('narrative → body-narrative wrapper', () => {
    const out = renderBody({ fmt: 'narrative', body: '霍桑实验是<strong>转折点</strong><br>梅奥团队…', accentHex: ACCENT });
    expect(out).toContain('class="body-narrative"');
    expect(out).toContain('class="narrative-p"');
    expect(out).toContain('<strong>转折点</strong>');
  });

  test('flat-list → body-items + body-card', () => {
    // 第一段无 ——/：/: 分隔符 → name 为空 → 触发 lead 提取
    const out = renderBody({ fmt: 'flat-list', body: '总论一段叙述◆任务管理——desc1◆员工选拔——desc2', accentHex: ACCENT });
    expect(out).toContain('class="body-items"');
    expect(out).toContain('class="body-card"');
    expect((out.match(/class="body-card"/g) ?? []).length).toBe(2);
    expect(out).toContain('class="body-lead"');
    expect(out).toContain('任务管理');
  });

  test('accordion → details/acc-item with sections', () => {
    const out = renderBody({ fmt: 'accordion', body: '【组1】<br>①A——a<br>②B——b<br>【组2】<br>①C——c', accentHex: ACCENT });
    expect(out).toContain('class="accordion"');
    expect((out.match(/class="acc-item"/g) ?? []).length).toBe(2);
    expect(out).toContain('class="acc-bullet"');
  });

  test('compare → cmp-table table form', () => {
    const out = renderBody({ fmt: 'compare', body: '<compare>类型A|属性1|属性2||类型B|属性1|属性2</compare>', accentHex: ACCENT });
    expect(out).toContain('class="cmp-table"');
    expect((out.match(/class="cmp-row"/g) ?? []).length).toBe(2);
  });

  test('quad → quad-wrap with 4 cells', () => {
    const out = renderBody({ fmt: 'quad', body: '<quad>x轴,y轴||名1|🎯|tag1|desc1||名2|🎨|tag2|desc2</quad>', accentHex: ACCENT });
    expect(out).toContain('class="quad-wrap"');
    expect((out.match(/class="quad-cell"/g) ?? []).length).toBe(4); // pad to 4
    expect(out).toContain('class="quad-axis-x"');
    expect(out).toContain('class="quad-axis-y"');
  });

  test('unknown format → fall back to narrative', () => {
    const out = renderBody({ fmt: 'something-weird' as any, body: 'plain text', accentHex: ACCENT });
    expect(out).toContain('class="body-narrative"');
  });

  test('empty body → empty string', () => {
    expect(renderBody({ fmt: 'narrative', body: '', accentHex: ACCENT })).toBe('');
  });
});

describe('renderBodyForSchool — compare uses cards', () => {
  test('compare → cmpc-grid (cards), not cmp-table', () => {
    const out = renderBodyForSchool({ fmt: 'compare', body: '<compare>名1|公式1|sub1||名2|公式2|sub2</compare>', accentHex: ACCENT });
    expect(out).toContain('class="cmpc-grid"');
    expect((out.match(/class="cmpc-card"/g) ?? []).length).toBe(2);
    expect(out).not.toContain('class="cmp-table"');
  });

  test('non-compare formats → same as renderBody', () => {
    const body = 'narrative content';
    expect(renderBodyForSchool({ fmt: 'narrative', body, accentHex: ACCENT })).toBe(renderBody({ fmt: 'narrative', body, accentHex: ACCENT }));
  });
});

describe('individual renderers — direct call', () => {
  test('renderNarrative empty paragraphs filtered', () => {
    const out = renderNarrative('a<br><br>b', ACCENT);
    expect((out.match(/class="narrative-p"/g) ?? []).length).toBe(2);
  });

  test('renderFlatList without lead (single item)', () => {
    const out = renderFlatList('◆只有一条', ACCENT);
    expect(out).toContain('class="body-card"');
    expect(out).not.toContain('class="body-lead"');
  });

  test('renderAccordion preserves lead before first 【】', () => {
    const out = renderAccordion('lead text<br>【sec1】<br>①item——desc', ACCENT);
    expect(out).toContain('class="body-narrative"'); // lead 用 narrative 包
    expect(out).toContain('class="acc-item"');
  });

  test('renderCompare without <compare> tag → falls back to narrative', () => {
    const out = renderCompare('plain narrative', ACCENT);
    expect(out).toContain('class="body-narrative"');
  });

  test('renderCompareCards without <compare> tag → falls back to renderCompare', () => {
    const out = renderCompareCards('plain narrative', ACCENT);
    expect(out).toContain('class="body-narrative"');
  });

  test('renderQuad pads to 4 cells', () => {
    const out = renderQuad('<quad>x,y||只有1个|🎯|tag|desc</quad>', ACCENT);
    expect((out.match(/class="quad-cell"/g) ?? []).length).toBe(4);
  });
});

describe('renderEvalModule', () => {
  test('null/empty → empty string', () => {
    expect(renderEvalModule(null)).toBe('');
    expect(renderEvalModule(undefined)).toBe('');
    expect(renderEvalModule({})).toBe('');
  });

  test('with content → eval-mod section + rows in glyph order', () => {
    const out = renderEvalModule({ '限': 'limit text', '义': 'meaning text', '例': 'example' });
    expect(out).toContain('class="eval-mod"');
    expect((out.match(/class="eval-row"/g) ?? []).length).toBe(3);
    // 顺序应按 EVAL_TAG_DEFS 定义（义→限→例→...）而非传入顺序
    const yi = out.indexOf('>义<');
    const xian = out.indexOf('>限<');
    const li = out.indexOf('>例<');
    expect(yi).toBeLessThan(xian);
    expect(xian).toBeLessThan(li);
  });

  test('whitespace-only fields ignored', () => {
    const out = renderEvalModule({ '义': 'real', '限': '   ', '例': '' });
    expect((out.match(/class="eval-row"/g) ?? []).length).toBe(1);
  });
});
