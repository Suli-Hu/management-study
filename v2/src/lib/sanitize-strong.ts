/**
 * sanitize-strong — server-side strip `<strong>` / `</strong>` 自所有 KP / school /
 * scholar / discipline / view 写入。
 *
 * Why：用户偏激进 minimalism — 概念名带英文括号已能被识别为术语，不需额外加粗。
 * AI agent (含老师 / 自己) 默认会在概念名加 <strong>，造成视觉杂乱。这层 sanitize
 * 是机制保障：不论 caller 怎么写，server 写入前一律 strip，调用方不需要记规则。
 *
 * 保留的 inline HTML：<em> / <br> / <code> — render-inline.ts 白名单仍接受。
 *
 * 静默 strip — 不抛错、不告警，是 v0.8.7 起的写入语义一部分（见 migration-v0.8.md §11）。
 */

const STRONG_RE = /<\s*\/?\s*strong\s*>/gi;

/** 删除字符串中所有 `<strong>` / `</strong>` (大小写 / 空格不敏感)。其它 inline HTML 不动。 */
export function stripStrong(s: string): string {
  return s.replace(STRONG_RE, '');
}

/**
 * 递归扫一个值的所有 string 字段，对每个跑 stripStrong。
 *
 * - string → strip
 * - array → 递归
 * - plain object → 递归到每个 value
 * - 其它类型 (number / boolean / null / undefined / Date / etc) → 原样返回
 *
 * 类型保留：deepStripStrong<KpCreateInput>(input) 仍返 KpCreateInput。
 */
export function deepStripStrong<T>(value: T): T {
  if (typeof value === 'string') return stripStrong(value) as T;
  if (Array.isArray(value)) return (value as unknown[]).map((v) => deepStripStrong(v)) as T;
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepStripStrong(v);
    }
    return out as T;
  }
  return value;
}
