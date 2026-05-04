/**
 * v0.8.7 sanitize-strong 单元测试
 *
 * 覆盖 stripStrong + deepStripStrong 的：
 *   - 基础 strip case
 *   - 大小写不敏感 / 内空格变体
 *   - 其它白名单 inline HTML 不动 (<em> / <br> / <code>)
 *   - 嵌套对象 / 数组递归
 *   - 类型保留 (input KpCreateInput → output KpCreateInput)
 *   - 边界值 (空字符串 / null / undefined / number / Date)
 */

import { describe, expect, test } from 'vitest';
import { stripStrong, deepStripStrong } from '../src/lib/sanitize-strong';

describe('stripStrong (string-level)', () => {
  test('剥单个 <strong>/</strong> pair', () => {
    expect(stripStrong('<strong>X</strong>')).toBe('X');
  });

  test('剥多个 pair + 文中混合', () => {
    expect(stripStrong('a<strong>b</strong>c<strong>d</strong>e')).toBe('abcde');
  });

  test('剥不平衡 tag (单个 <strong> 没 close)', () => {
    expect(stripStrong('a<strong>b')).toBe('ab');
    expect(stripStrong('a</strong>b')).toBe('ab');
  });

  test('大小写不敏感: <STRONG> / <Strong>', () => {
    expect(stripStrong('<STRONG>X</STRONG>')).toBe('X');
    expect(stripStrong('<Strong>X</Strong>')).toBe('X');
  });

  test('tag 内空格变体: <strong > / </ strong>', () => {
    expect(stripStrong('<strong >X</ strong>')).toBe('X');
    expect(stripStrong('< strong>X</strong >')).toBe('X');
  });

  test('保留其它白名单 inline HTML', () => {
    expect(stripStrong('<em>斜体</em>')).toBe('<em>斜体</em>');
    expect(stripStrong('a<br>b')).toBe('a<br>b');
    expect(stripStrong('<code>schoolKey</code>')).toBe('<code>schoolKey</code>');
  });

  test('混合: <strong> 剥 + <em> 留', () => {
    expect(stripStrong('<strong>粗</strong> + <em>斜</em>')).toBe('粗 + <em>斜</em>');
  });

  test('空字符串', () => {
    expect(stripStrong('')).toBe('');
  });

  test('CJK 文本中嵌入 <strong>', () => {
    expect(stripStrong('Maslow 1943 提出<strong>需求层次</strong>理论')).toBe(
      'Maslow 1943 提出需求层次理论',
    );
  });
});

describe('deepStripStrong (object/array recursive)', () => {
  test('递归 plain object 所有 string 字段', () => {
    const input = {
      title: '<strong>title</strong>',
      desc: 'plain',
      meta: { author: '<strong>X</strong>', year: '1980s' },
    };
    expect(deepStripStrong(input)).toEqual({
      title: 'title',
      desc: 'plain',
      meta: { author: 'X', year: '1980s' },
    });
  });

  test('递归数组', () => {
    const input = ['<strong>a</strong>', '<strong>b</strong>', 'c'];
    expect(deepStripStrong(input)).toEqual(['a', 'b', 'c']);
  });

  test('数组里的 object 也递归', () => {
    const input = [
      { name: '<strong>n1</strong>', desc: 'd1' },
      { name: 'n2', desc: '<strong>d2</strong>' },
    ];
    expect(deepStripStrong(input)).toEqual([
      { name: 'n1', desc: 'd1' },
      { name: 'n2', desc: 'd2' },
    ]);
  });

  test('深嵌套 (KP body shape)', () => {
    const input = {
      title: { zh: '<strong>标题</strong>' },
      body: {
        zh: {
          format: 'flat-list',
          lead: '导语 <strong>关键</strong>',
          items: [
            { name: '<strong>线性</strong>', desc: '加权<strong>求和</strong>' },
            { name: '连结', desc: '门槛' },
          ],
        },
      },
      schools: ['motivation'],
    };
    expect(deepStripStrong(input)).toEqual({
      title: { zh: '标题' },
      body: {
        zh: {
          format: 'flat-list',
          lead: '导语 关键',
          items: [
            { name: '线性', desc: '加权求和' },
            { name: '连结', desc: '门槛' },
          ],
        },
      },
      schools: ['motivation'],
    });
  });

  test('非 string 类型不动: number / boolean / null / undefined', () => {
    const input = { a: 1, b: true, c: null, d: undefined };
    expect(deepStripStrong(input)).toEqual({ a: 1, b: true, c: null, d: undefined });
  });

  test('Date 实例不动 (constructor !== Object)', () => {
    const d = new Date('2026-01-01');
    const input = { createdAt: d, name: '<strong>X</strong>' };
    const out = deepStripStrong(input);
    expect(out.createdAt).toBe(d);
    expect(out.name).toBe('X');
  });

  test('返 input 引用类型一致 (类型保留)', () => {
    interface Foo { a: string; b: number }
    const input: Foo = { a: '<strong>x</strong>', b: 42 };
    const out: Foo = deepStripStrong(input);
    expect(out.a).toBe('x');
    expect(out.b).toBe(42);
  });

  test('null / undefined / primitive 直接返', () => {
    expect(deepStripStrong(null)).toBeNull();
    expect(deepStripStrong(undefined)).toBeUndefined();
    expect(deepStripStrong(42)).toBe(42);
    expect(deepStripStrong(true)).toBe(true);
    expect(deepStripStrong('<strong>x</strong>')).toBe('x');
  });

  test('空 object / 空数组', () => {
    expect(deepStripStrong({})).toEqual({});
    expect(deepStripStrong([])).toEqual([]);
  });
});
