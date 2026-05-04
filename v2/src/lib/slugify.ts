/**
 * v0.8.9 Stage 4.6 Q2=A: 共享 key 自动生成 helper
 *
 * 调用方：POST /api/schools / POST /api/scholars / POST /api/new/theme /
 *        admin/disciplines (复用 /api/admin/disciplines 内联的 slugify)
 *
 * 生成规则：
 *   1. 优先从 title.en slugify（"Hitotsubashi University" → "hitotsubashi_university"）
 *   2. 退到 title.zh slugify（去 ASCII 后基本是空 → 走 fallback）
 *   3. 冲突加后缀 _2/.../_9
 *   4. 仍冲突或 slug 不可用 → crypto.getRandomValues 6 位 ASCII fallback (`prefix_xxxxxx`)
 *
 * SchoolKey/ScholarKey/ThemeGroup.key/DisciplineKey schema 全部要求 `^[a-z][a-z0-9_]*$` + 长度 ≤ 31。
 */

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const MAX_KEY_LENGTH = 31;

/**
 * 从英文 title 生成 slug。
 * - 全小写 + 非字母数字转 _ + 去首尾 _ + 折叠重复 _
 * - 首字母必须是字母（schema 要求）
 * - 长度限制 ≤ MAX_KEY_LENGTH，超过返 null（让 caller fallback）
 *
 * 返 null 的场景：input 空 / 全非 ASCII / 首字母不是字母 / 截断后超长。
 */
export function slugFromTitleEn(titleEn: string | undefined | null): string | null {
  if (!titleEn) return null;
  const slug = titleEn
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!slug) return null;
  if (slug.length > MAX_KEY_LENGTH) return null;
  if (!/^[a-z]/.test(slug)) return null;
  return slug;
}

/**
 * Random fallback key，如 `s_a1b2c3` / `sch_x9k7m2` / `th_q4p8d1`。
 * 用 crypto.getRandomValues — Cloudflare Workers / Node 18+ / browser 都有。
 */
export function generateKeyFallback(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (let i = 0; i < bytes.length; i++) {
    suffix += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return `${prefix}_${suffix}`;
}

/** 调用方提供的 key 存在性检查 — 让本 helper 不绑 D1 schema 细节 */
export type KeyExistsCheck = (key: string) => Promise<boolean>;

/**
 * 完整的 unique key 生成流程：slug → 加后缀 → 6 位 random fallback。
 *
 * @param titleEn - 用于生成可读 slug 的英文标题（可空）
 * @param prefix  - random fallback 的前缀（≤ 3 字符；如 's' for scholar / 'sch' for school / 'th' for theme）
 * @param exists  - 检查 key 是否已被占用 — 调用方自己定 (D1 query / inline lookup ...)
 *
 * @throws Error 如果 5 次 random fallback 都冲突（实际不会发生）
 */
export async function generateUniqueKey(
  titleEn: string | undefined | null,
  prefix: string,
  exists: KeyExistsCheck,
): Promise<string> {
  const base = slugFromTitleEn(titleEn);
  if (base) {
    if (!(await exists(base))) return base;
    for (let i = 2; i <= 9; i++) {
      const candidate = `${base}_${i}`;
      if (candidate.length > MAX_KEY_LENGTH) break;
      if (!(await exists(candidate))) return candidate;
    }
  }
  for (let attempts = 0; attempts < 5; attempts++) {
    const fallback = generateKeyFallback(prefix);
    if (!(await exists(fallback))) return fallback;
  }
  throw new Error('Key generation failed: too many collisions in fallback range');
}
