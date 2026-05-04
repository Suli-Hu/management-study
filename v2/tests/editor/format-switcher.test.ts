/**
 * KP 编辑器 v0.8 — format-switcher.ts 单元测试
 *
 * 覆盖：bodyHasContent 5 format × {empty, has-content} 边界。
 */

import { describe, expect, test } from 'vitest';
import { bodyHasContent, emptyKpBodyByFormat } from '~/lib/editor/format-switcher';

describe('bodyHasContent — empty 5 format → false', () => {
  test.each(['narrative', 'flat-list', 'accordion', 'compare', 'quad'] as const)('%s 默认空', (fmt) => {
    expect(bodyHasContent(emptyKpBodyByFormat(fmt))).toBe(false);
  });
});

describe('bodyHasContent — narrative', () => {
  test('prose 非空 → true', () => {
    expect(bodyHasContent({ format: 'narrative', prose: 'a' })).toBe(true);
  });
  test('prose 全空白 → false', () => {
    expect(bodyHasContent({ format: 'narrative', prose: '   \n  ' })).toBe(false);
  });
});

describe('bodyHasContent — flat-list', () => {
  test('lead 非空 → true', () => {
    expect(
      bodyHasContent({ format: 'flat-list', lead: 'a', items: [{ name: '', desc: '' }] }),
    ).toBe(true);
  });
  test('item.name 非空 → true', () => {
    expect(
      bodyHasContent({ format: 'flat-list', lead: '', items: [{ name: 'a', desc: '' }] }),
    ).toBe(true);
  });
  test('item.desc 非空 → true', () => {
    expect(
      bodyHasContent({ format: 'flat-list', lead: '', items: [{ name: '', desc: 'd' }] }),
    ).toBe(true);
  });
});

describe('bodyHasContent — accordion', () => {
  test('group.title 非空 → true', () => {
    expect(
      bodyHasContent({ format: 'accordion', lead: '', groups: [{ title: 't', items: [] }] }),
    ).toBe(true);
  });
  test('group.item 非空 → true', () => {
    expect(
      bodyHasContent({
        format: 'accordion',
        lead: '',
        groups: [{ title: '', items: [{ name: 'n', desc: '' }] }],
      }),
    ).toBe(true);
  });
});

describe('bodyHasContent — compare', () => {
  test('col.title 非空 → true', () => {
    expect(
      bodyHasContent({
        format: 'compare',
        lead: '',
        cols: [
          { title: 't', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
      }),
    ).toBe(true);
  });
  test('col.detail 非空 → true', () => {
    expect(
      bodyHasContent({
        format: 'compare',
        lead: '',
        cols: [
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: 'd' },
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
      }),
    ).toBe(true);
  });
});

describe('bodyHasContent — quad', () => {
  test('yAxis.low 非空 → true', () => {
    const body = emptyKpBodyByFormat('quad');
    if (body.format !== 'quad') throw new Error('narrow');
    body.yAxis = { low: 'Y 低', label: '', high: '' };
    expect(bodyHasContent(body)).toBe(true);
  });
  test('yAxis.label 非空 → true', () => {
    const body = emptyKpBodyByFormat('quad');
    if (body.format !== 'quad') throw new Error('narrow');
    body.yAxis = { low: '', label: '中间', high: '' };
    expect(bodyHasContent(body)).toBe(true);
  });
  test('xAxis.high 非空 → true', () => {
    const body = emptyKpBodyByFormat('quad');
    if (body.format !== 'quad') throw new Error('narrow');
    body.xAxis = { low: '', label: '', high: 'X 高' };
    expect(bodyHasContent(body)).toBe(true);
  });
  test('cell.name 非空 → true', () => {
    const body = emptyKpBodyByFormat('quad');
    if (body.format !== 'quad') throw new Error('narrow');
    body.cells[0]!.name = 'n';
    expect(bodyHasContent(body)).toBe(true);
  });
});
