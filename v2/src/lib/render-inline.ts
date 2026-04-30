/**
 * 渲染 BilingualBody 字段的内联 HTML — 白名单 <strong> <em> <br>。
 * 其它一切 < > & " ' 全部 HTML 转义。
 *
 * 用途：school.summary / scholar.contribution / 任何 BilingualBody 字段
 *   在 .astro 模板里：<div set:html={renderInlineHtml(text)} />
 *
 * 设计：
 *   - 先全部 HTML escape（防 XSS / 属性注入）
 *   - 再把白名单的 escaped 标签反转回明文标签
 *   - 顺序重要：先 escape，再 unescape 白名单 — 反过来会把白名单 < 也 escape 掉
 *
 * 不支持：
 *   - 标签属性（<strong class="x"> 会被 escape 显示原文）— 老师只能用裸标签
 *   - <a> / <script> / <img> / <iframe> 等都 escape，对 XSS 安全
 *   - 嵌套深层 HTML — 纯字符串替换无 DOM 解析
 *
 * 比 DOMPurify 简单 5 倍，对 inline emphasize 场景够用。
 */
export function renderInlineHtml(s: string | null | undefined): string {
  if (!s) return '';
  // Step 1: 全 escape
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  // Step 2: 白名单反转 — 必须严格匹配 ` <strong> / </strong> / <em> / </em> / <br> / <br/> ` 6 种
  return escaped
    .replace(/&lt;(\/?)(strong|em)&gt;/gi, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}
