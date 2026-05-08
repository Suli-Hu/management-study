export type MarketingThemeKey =
  | 'marketing_strategy'
  | 'consumer_market'
  | 'value_creation'
  | 'value_communication'
  | 'growth_relationship';

export interface TagLibEntry {
  key: string;
  label?: { zh?: string };
}

export function isMarketingThemeKey(v: unknown): v is MarketingThemeKey {
  return (
    v === 'marketing_strategy' ||
    v === 'consumer_market' ||
    v === 'value_creation' ||
    v === 'value_communication' ||
    v === 'growth_relationship'
  );
}

/**
 * Build a themeKey -> tagKey mapping for Marketing discipline,
 * by resolving tag keys from tag library entries by zh label.
 *
 * Required zh labels (5 category tags):
 *   市场洞察 / 战略选择 / 价值创造 / 价值传播 / 长期关系
 */
export function buildMarketingThemeToTagKey(
  tags: TagLibEntry[],
): Record<MarketingThemeKey, string> | null {
  const byZh = new Map<string, string>();
  for (const t of tags) {
    const zh = t?.label?.zh?.trim();
    if (zh && typeof t.key === 'string') byZh.set(zh, t.key);
  }

  const marketInsight = byZh.get('市场洞察');
  const strategyChoice = byZh.get('战略选择');
  const valueCreation = byZh.get('价值创造');
  const valueCommunication = byZh.get('价值传播');
  const longTerm = byZh.get('长期关系');
  if (!marketInsight || !strategyChoice || !valueCreation || !valueCommunication || !longTerm) return null;

  return {
    marketing_strategy: strategyChoice,
    consumer_market: marketInsight,
    value_creation: valueCreation,
    value_communication: valueCommunication,
    growth_relationship: longTerm,
  };
}

