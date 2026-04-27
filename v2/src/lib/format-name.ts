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

/**
 * v0.5.51 学者列表渲染：把 en 全名拆 first + last
 *   "James MacGregor Burns" → { first: "James MacGregor", last: "Burns" }
 *   "R. Edward Freeman"     → { first: "R. Edward",       last: "Freeman" }
 *   "Chris Argyris"         → { first: "Chris",           last: "Argyris" }
 *   "Meyer"                 → { first: "",                last: "Meyer" }
 *
 * "first" 是"姓之外的全部"（含 middle/initial），不丢缩写点。
 * 用于学者列表行视觉：first 灰小 + last 黑粗加重，扫读靠 last。
 */
export function splitName(en: string | null | undefined): { first: string; last: string } {
  if (!en) return { first: '', last: '' };
  const parts = en.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: '', last: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}
