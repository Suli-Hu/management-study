/**
 * v0.8.0 Stage 2 — renderBodyWithFallback 单测 (PRD §6.3 防线 1 核心)
 *
 * 现有 render-parity.test.ts 只覆盖了"新旧 renderer 输出等价"。
 * 这套补的是 fallback 入口本身的 3 分支行为：
 *
 *   D1  body_json=合法 → 走新 renderer（不调 fallback）
 *   D2  body_json=null → console.warn(reason=new_column_null) + 调旧 renderer
 *   D3  body_json="not-json" → console.warn(reason=new_column_parse_failed) + fallback
 *   D4  body_json={format:'unknown'} → KpBody.parse 失败 → fallback
 *   D5  variant='school' fallback 走 renderBodyForSchool（不是 detail 版）
 *   D6  fallback warn 包含 kp_id（生产 grep 能定位）
 *
 * PM 决策：保留 console.warn（不接 sentry，CF Tail grep 即可）— D6 验证 grep 关键字稳定。
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderBodyWithFallback } from '~/lib/render-body-with-fallback';

describe('renderBodyWithFallback — 3 分支', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('D1 body_json 合法 → 新 renderer 输出 + 不 warn', () => {
    const body = JSON.stringify({ format: 'narrative', prose: '正文 prose' });
    const html = renderBodyWithFallback({
      body_json: body,
      body_string: '不应被使用的旧 body',
      format: 'narrative',
      accentHex: '#007AFF',
      kp_id: 'k001',
    });
    expect(html).toContain('正文 prose');
    expect(html).toContain('narrative-p');
    expect(html).not.toContain('不应被使用的旧 body');
    expect(warnSpy, '合法新列时不应触发 fallback warn').not.toHaveBeenCalled();
  });

  test('D1 flat-list 合法 → items 渲染', () => {
    const body = JSON.stringify({
      format: 'flat-list',
      lead: '导语',
      items: [{ name: 'A', desc: 'descA' }],
    });
    const html = renderBodyWithFallback({
      body_json: body,
      body_string: '',
      format: 'flat-list',
      accentHex: '#007AFF',
    });
    expect(html).toContain('导语');
    expect(html).toContain('body-card');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('D2 body_json=null → warn(reason=new_column_null) + fallback 旧 renderer', () => {
    const html = renderBodyWithFallback({
      body_json: null,
      body_string: 'fallback narrative content',
      format: 'narrative',
      accentHex: '#007AFF',
      kp_id: 'k_null',
    });
    expect(html).toContain('fallback narrative content');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const callArgs = warnSpy.mock.calls[0];
    expect(callArgs[0]).toBe('[KP_RENDER_FALLBACK]');
    expect(callArgs[1]).toMatchObject({ kp_id: 'k_null', reason: 'new_column_null' });
  });

  test('D3 body_json="not-json" → warn(reason=parse_failed) + fallback', () => {
    const html = renderBodyWithFallback({
      body_json: '{not-valid-json',
      body_string: 'fallback content',
      format: 'narrative',
      accentHex: '#007AFF',
      kp_id: 'k_bad_json',
    });
    expect(html).toContain('fallback content');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const callArgs = warnSpy.mock.calls[0];
    expect(callArgs[0]).toBe('[KP_RENDER_FALLBACK]');
    expect(callArgs[1]).toMatchObject({
      kp_id: 'k_bad_json',
      reason: 'new_column_parse_failed',
    });
  });

  test('D4 body_json 是合法 JSON 但 format 未知 → KpBody.parse 失败 → fallback', () => {
    const body = JSON.stringify({ format: 'unknown-fmt', prose: 'x' });
    const html = renderBodyWithFallback({
      body_json: body,
      body_string: 'fallback narrative',
      format: 'narrative',
      accentHex: '#007AFF',
      kp_id: 'k_unknown_fmt',
    });
    expect(html).toContain('fallback narrative');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][1]).toMatchObject({ reason: 'new_column_parse_failed' });
  });

  test('D4b body_json 是 m178 类脏 JSON (flat-list items=[]) → fallback', () => {
    const body = JSON.stringify({ format: 'flat-list', lead: 'x', items: [] });
    const html = renderBodyWithFallback({
      body_json: body,
      body_string: '原 m178 旧 body',
      format: 'flat-list',
      accentHex: '#007AFF',
      kp_id: 'm178',
    });
    expect(html).toContain('原 m178 旧 body');
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][1]).toMatchObject({
      kp_id: 'm178',
      reason: 'new_column_parse_failed',
    });
  });

  test('D5 variant=school + body_json=null → fallback 走 renderBodyForSchool（卡片不是表格）', () => {
    // compare body 在 detail variant 是 cmp-table，school variant 是 cmpc-grid
    const body = '<compare>X|经济人|定义||Y|社会人|定义</compare>';
    const html = renderBodyWithFallback({
      body_json: null,
      body_string: body,
      format: 'compare',
      accentHex: '#007AFF',
      variant: 'school',
    });
    expect(html).toContain('cmpc-grid');
    expect(html).not.toContain('cmp-table');
  });

  test('D5b variant=detail 默认 → fallback 走 renderBody (表格版)', () => {
    const body = '<compare>X|经济人|定义||Y|社会人|定义</compare>';
    const html = renderBodyWithFallback({
      body_json: null,
      body_string: body,
      format: 'compare',
      accentHex: '#007AFF',
      // variant 不传 → 默认 detail
    });
    expect(html).toContain('cmp-table');
  });

  test('D6 warn payload 关键字稳定（生产 CF Tail grep 关键字）', () => {
    renderBodyWithFallback({
      body_json: null,
      body_string: 'x',
      format: 'narrative',
      accentHex: '#000000',
      kp_id: 'k_grep_target',
    });
    // 关键字 1: tag
    expect(warnSpy.mock.calls[0][0]).toBe('[KP_RENDER_FALLBACK]');
    // 关键字 2: payload 是 object 含 kp_id + reason（CF Tail JSON-serialized 后 grep）
    const payload = warnSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toHaveProperty('kp_id');
    expect(payload).toHaveProperty('reason');
  });

  test('D6b kp_id 缺省（旧调用方没传）也不应 throw', () => {
    expect(() =>
      renderBodyWithFallback({
        body_json: null,
        body_string: 'x',
        format: 'narrative',
        accentHex: '#000',
      }),
    ).not.toThrow();
  });
});

describe('回归：变种 fallback 路径覆盖 5 format', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  // 5 format 各跑一次 fallback 路径，确认旧 renderer 路径没炸
  const cases: Array<{
    fmt: 'narrative' | 'flat-list' | 'accordion' | 'compare' | 'quad';
    body: string;
    expect: string;
  }> = [
    { fmt: 'narrative', body: '叙述段落', expect: '叙述段落' },
    { fmt: 'flat-list', body: '◆item A——desc A◆item B——desc B', expect: 'item A' },
    {
      fmt: 'accordion',
      body: '导语<br>【G1】<br>①n——d',
      expect: 'G1',
    },
    {
      fmt: 'compare',
      body: '<compare>X|kw|desc||Y|kw|desc</compare>',
      expect: 'cmp-table',
    },
    {
      fmt: 'quad',
      body: '<quad>y,x||A|⭐|s|d||B|❓|s|d||C|🐕|s|d||D|💰|s|d</quad>',
      expect: 'quad-cell',
    },
  ];

  for (const c of cases) {
    test(`fallback 路径 ${c.fmt} 不 throw + 含预期内容`, () => {
      const html = renderBodyWithFallback({
        body_json: null,
        body_string: c.body,
        format: c.fmt,
        accentHex: '#007AFF',
      });
      expect(html).toContain(c.expect);
    });
  }
});
