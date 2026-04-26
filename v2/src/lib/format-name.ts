/**
 * 知识点卡片/标题里展示学者时只取 last name：
 *   "Kurt Zadek Lewin" → "Lewin"
 *   "John Paul Kotter" → "Kotter"
 *   "Edgar H. Schein"  → "Schein"
 *   "Karl Weick"       → "Weick"
 *   "库尔特·察丹·勒温" → "勒温"   （CJK 中点 / Japanese 中点拆分）
 *   "丹尼尔·卡尼曼"   → "卡尼曼"
 *   "Meyer"            → "Meyer"  （单 token 原样返回）
 */
export function lastName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  if (/[·・]/.test(trimmed)) {
    const parts = trimmed.split(/[·・]/);
    return parts[parts.length - 1].trim();
  }
  const words = trimmed.split(/\s+/);
  return words[words.length - 1];
}
