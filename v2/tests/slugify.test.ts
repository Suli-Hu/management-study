/**
 * v0.8.9 Stage 4.6 Q2=A: slugify.ts 单元测试
 *
 * 覆盖 slugFromTitleEn / generateKeyFallback / generateUniqueKey 三个 export。
 */

import { describe, expect, test, vi } from 'vitest';
import {
  slugFromTitleEn,
  generateKeyFallback,
  generateUniqueKey,
} from '~/lib/slugify';

describe('slugFromTitleEn', () => {
  test('简单单词 → 全小写', () => {
    expect(slugFromTitleEn('Hitotsubashi')).toBe('hitotsubashi');
  });

  test('多词 → 用 _ 串接', () => {
    expect(slugFromTitleEn('Harvard Business School')).toBe('harvard_business_school');
  });

  test('标点 → 折叠成单 _', () => {
    expect(slugFromTitleEn('A.I. Lab — 2024 (NYC)!')).toBe('a_i_lab_2024_nyc');
  });

  test('首尾 _ 去掉', () => {
    expect(slugFromTitleEn('  hello  ')).toBe('hello');
  });

  test('空 input → null', () => {
    expect(slugFromTitleEn(undefined)).toBeNull();
    expect(slugFromTitleEn(null)).toBeNull();
    expect(slugFromTitleEn('')).toBeNull();
  });

  test('全非 ASCII（中文 / 日文）→ null（schema 要求首字母字母）', () => {
    expect(slugFromTitleEn('马斯洛')).toBeNull();
    expect(slugFromTitleEn('組織変革')).toBeNull();
  });

  test('首字母数字 → null', () => {
    expect(slugFromTitleEn('1st School')).toBeNull();
  });

  test('超长 (>31 字符) → null（让 caller fallback）', () => {
    expect(slugFromTitleEn('a'.repeat(32))).toBeNull();
  });

  test('刚好 31 字符 → 接受', () => {
    expect(slugFromTitleEn('a'.repeat(31))).toBe('a'.repeat(31));
  });
});

describe('generateKeyFallback', () => {
  test('格式 prefix_<6 ASCII小写/数字>', () => {
    const fb = generateKeyFallback('s');
    expect(fb).toMatch(/^s_[a-z0-9]{6}$/);
  });

  test('不同 prefix', () => {
    expect(generateKeyFallback('sch')).toMatch(/^sch_[a-z0-9]{6}$/);
    expect(generateKeyFallback('th')).toMatch(/^th_[a-z0-9]{6}$/);
  });

  test('多次调用产生不同结果（统计意义上）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateKeyFallback('s'));
    // crypto.getRandomValues 50 次应该几乎都不同（理论碰撞率极低）
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe('generateUniqueKey', () => {
  test('slug 可用 + 不冲突 → 直接返回', async () => {
    const exists = vi.fn(async () => false);
    const key = await generateUniqueKey('Hitotsubashi University', 'sch', exists);
    expect(key).toBe('hitotsubashi_university');
    expect(exists).toHaveBeenCalledWith('hitotsubashi_university');
  });

  test('slug 冲突 → 加 _2 后缀', async () => {
    const exists = vi.fn(async (k: string) => k === 'lewin');
    const key = await generateUniqueKey('Lewin', 's', exists);
    expect(key).toBe('lewin_2');
  });

  test('slug + _2.._9 都冲突 → fallback random', async () => {
    const exists = vi.fn(async (k: string) => /^lewin(_[2-9])?$/.test(k));
    const key = await generateUniqueKey('Lewin', 's', exists);
    expect(key).toMatch(/^s_[a-z0-9]{6}$/);
  });

  test('titleEn 空 → 直接 fallback random', async () => {
    const exists = vi.fn(async () => false);
    const key = await generateUniqueKey(undefined, 'th', exists);
    expect(key).toMatch(/^th_[a-z0-9]{6}$/);
  });

  test('titleEn 全中文 → 直接 fallback', async () => {
    const exists = vi.fn(async () => false);
    const key = await generateUniqueKey('马斯洛', 's', exists);
    expect(key).toMatch(/^s_[a-z0-9]{6}$/);
  });

  test('5 次 fallback 全冲突 → throw', async () => {
    const exists = vi.fn(async () => true);
    await expect(generateUniqueKey('马斯洛', 's', exists)).rejects.toThrow(/too many collisions/);
  });
});
