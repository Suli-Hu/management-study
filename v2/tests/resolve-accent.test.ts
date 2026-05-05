/**
 * resolve-accent.ts unit tests (v0.8.20)
 *
 * 防回归 chip 1 v0.8.12 的 hashToTagToken 路径错 — 学派色必须从 user-defined
 * discipline.tags[].color 真实 hex 解析，不是 hash 到 8 OKLCH token 之一。
 */

import { describe, expect, test } from 'vitest';
import { resolveAccentForSchool } from '~/lib/resolve-accent';

const KEIEI_TAGS = [
  { key: 't_ejbdv3', color: '#10B981' }, // OB (personality 学派 tag)
  { key: 't_jg440q', color: '#3B82F6' }, // SM
  { key: 't_93nqjd', color: '#F59E0B' }, // OT
];

describe('resolveAccentForSchool', () => {
  test('school.tags[0] 在 discipline.tags 里 → 返回真实 hex', () => {
    const accent = resolveAccentForSchool(
      { tags: ['t_ejbdv3'] },
      { tags: KEIEI_TAGS },
    );
    expect(accent).toBe('#10B981');
  });

  test('school.tags=[] → 返回中性 fallback var(--text-3)', () => {
    const accent = resolveAccentForSchool(
      { tags: [] },
      { tags: KEIEI_TAGS },
    );
    expect(accent).toBe('var(--text-3)');
  });

  test('school 无 tags 字段 → 中性 fallback', () => {
    const accent = resolveAccentForSchool({}, { tags: KEIEI_TAGS });
    expect(accent).toBe('var(--text-3)');
  });

  test('school.tags[0] 在 lookup 里找不到 → 中性 fallback', () => {
    const accent = resolveAccentForSchool(
      { tags: ['t_unknown'] },
      { tags: KEIEI_TAGS },
    );
    expect(accent).toBe('var(--text-3)');
  });

  test('discipline.tags 空 → 中性 fallback', () => {
    const accent = resolveAccentForSchool(
      { tags: ['t_ejbdv3'] },
      { tags: [] },
    );
    expect(accent).toBe('var(--text-3)');
  });

  test('多 tag 学派 → 取首个 (school.tags[0]) 决定 page chrome 色', () => {
    const accent = resolveAccentForSchool(
      { tags: ['t_jg440q', 't_ejbdv3'] },
      { tags: KEIEI_TAGS },
    );
    expect(accent).toBe('#3B82F6');
  });

  test('lookup tag 缺 color 字段 → 中性 fallback (defensive)', () => {
    const accent = resolveAccentForSchool(
      { tags: ['t_broken'] },
      { tags: [{ key: 't_broken', color: '' }] },
    );
    expect(accent).toBe('var(--text-3)');
  });
});
