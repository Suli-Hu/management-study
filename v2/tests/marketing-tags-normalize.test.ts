import { describe, expect, test } from 'vitest';
import { buildMarketingThemeToTagKey } from '~/lib/marketing-tags-normalize';

describe('buildMarketingThemeToTagKey', () => {
  test('returns null when required labels missing', () => {
    const map = buildMarketingThemeToTagKey([
      { key: 't_a', label: { zh: '市场洞察' } },
      // missing others
    ]);
    expect(map).toBeNull();
  });

  test('builds a complete mapping from zh labels', () => {
    const map = buildMarketingThemeToTagKey([
      { key: 't_insight', label: { zh: '市场洞察' } },
      { key: 't_strategy', label: { zh: '战略选择' } },
      { key: 't_create', label: { zh: '价值创造' } },
      { key: 't_comm', label: { zh: '价值传播' } },
      { key: 't_long', label: { zh: '长期关系' } },
    ]);
    expect(map).toEqual({
      marketing_strategy: 't_strategy',
      consumer_market: 't_insight',
      value_creation: 't_create',
      value_communication: 't_comm',
      growth_relationship: 't_long',
    });
  });
});

