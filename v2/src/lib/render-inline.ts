/**
 * 渲染 BilingualBody 字段的内联 HTML — 白名单 <strong> <em> <code> <br>。
 * 其它一切 < > & " ' 全部 HTML 转义。
 *
 * 用途：school.summary / scholar.contribution / 任何 BilingualBody 字段
 *   在 .astro 模板里：<div set:html={renderInlineHtml(text, opts)} />
 *
 * 白名单标签语义：
 *   <strong>          加粗 — 关键术语 / 概念名
 *   <em>              斜体 — 强调
 *   <code>            等宽 — 字面代码标识符（fallback）
 *   <code>schoolKey</code> 当传入 resolveCode 且 key 命中 → 渲染为
 *                     <a class="inline-ref">中文标题</a> 跨学派引用链接
 *   <br>              换行 — 段落内换行
 *
 * 设计：
 *   - 先全部 HTML escape（防 XSS / 属性注入）
 *   - 反转 <code>...</code> 时优先调 resolveCode；命中 → link，未命中 → 等宽 fallback
 *   - 再反转其它白名单（<strong> <em> <br>）
 *
 * 安全：
 *   - 标签属性都 escape — <strong class="x"> 显示原文
 *   - resolveCode 返回的 text/href 也 re-escape 防注入（即使 caller 传错也安全）
 *   - <a> / <script> / <img> 等任何其它标签都 escape
 */

export type CodeResolver = (key: string) => { text: string; href?: string } | null;

export interface RenderInlineOpts {
  /**
   * 把 <code>key</code> 解析成跨链引用。返 null = 保持 <code>key</code> 等宽 fallback。
   * 典型用法：传 schoolNameByKey lookup → 让老师写 <code>marketing_concept</code>
   * 自动渲染成 <a class="inline-ref" href="/marketing/marketing_concept">营销概念派</a>
   */
  resolveCode?: CodeResolver;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderInlineHtml(s: string | null | undefined, opts?: RenderInlineOpts): string {
  if (!s) return '';
  // Step 1: 全 escape
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  // Step 2: 反转 <code>X</code> — 优先 resolve 成 link，否则等宽 fallback
  //   key match: 至少 1 个非 escape / 非空格字符；避免吞掉嵌套标签
  let out = escaped.replace(/&lt;code&gt;([^<&\s][^<&]*?)&lt;\/code&gt;/g, (_full, key: string) => {
    if (opts?.resolveCode) {
      const r = opts.resolveCode(key);
      if (r) {
        const text = escText(r.text);
        return r.href ? `<a class="inline-ref" href="${escAttr(r.href)}">${text}</a>` : text;
      }
    }
    return `<code>${escText(key)}</code>`;
  });
  // Step 3: 反转其它白名单
  out = out
    .replace(/&lt;(\/?)(strong|em)&gt;/gi, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  return out;
}
