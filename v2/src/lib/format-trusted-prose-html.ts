/**
 * Trusted KP prose → safe-ish HTML fragments for set:html.
 *
 * v0.11.x: Markdown **subset** — paired `**…**` → `<strong>…</strong>` at **render time only**
 * (DB/API 仍 strip `<strong>` on write; 见 migration-v0.8.md §11 附录)。
 *
 * 顺序：`**` 先展开，再 `\n` → `<br>`，避免 `<br>` 夹在 `**` 内影响配对。
 *
 * 限制（刻意不做完整 Markdown）：
 * - 不成对 `**` 保持字面量
 * - `**` 不要跨 `renderParas` 的段落切分（按 `<br>/\n` 切段后各自处理）
 * - 不在 `<strong>` 内嵌套解析另一层 `**`
 */

function nlToBrInner(s: string): string {
  return s.replace(/\n/g, '<br>');
}

/**
 * 将成对 `**` 转为 `<strong>`。不成对则末尾补回字面 `**`。
 * 不处理 HTML escape — 与现有 nlToBr 路径一致（admin-trusted 内容）。
 */
export function inlineMdDoubleStarToStrong(s: string): string {
  if (!s.includes('**')) return s;
  const parts = s.split('**');
  if (parts.length < 3) return s;

  let out = parts[0] ?? '';
  for (let i = 1; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      const inner = parts[i] ?? '';
      out += `<strong>${inner}</strong>${parts[i + 1] ?? ''}`;
    } else {
      out += `**${parts[i] ?? ''}`;
    }
  }
  return out;
}

/** 正文 / 评价等：`**` → strong，再换行 → br */
export function formatTrustedProseHtml(s: string | undefined | null): string {
  if (!s) return '';
  return nlToBrInner(inlineMdDoubleStarToStrong(String(s)));
}
