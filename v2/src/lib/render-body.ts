/**
 * render-body.ts — KP body 渲染器（v0.5.1 设计稿落地版）
 *
 * 输入：(body 字符串, accentHex 已解析好的 hex)，输出：HTML 字符串
 * 5 种 format：narrative / flat-list / accordion / compare / quad
 *
 * 移植自 prototype/shared.jsx 的 5 个 render* + school-options.jsx 的 renderCompareCards.
 * 设计原则：纯函数，body 信任已授权（admin 写的），保留内嵌 <strong>/<em>/<br> HTML.
 *
 * 学派详情页用 renderBodyWithEval（compare → renderCompareCards 卡片版）；
 * 其他场景用 renderBody（compare → renderCompare 表格版）。
 */

import { EVAL_TAG_DEFS, type EvalContent } from './eval-tag-defs';

export type KpFormat = 'narrative' | 'flat-list' | 'accordion' | 'compare' | 'quad';

const FALLBACK_ACCENT = '#8a7a6a';

// ============================================================
// Utilities
// ============================================================

/** 转义文本节点（不允许 HTML 注入的场景用） */
function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  ));
}

/** 把 hex 转 rgb 字串 "r,g,b"（用于 rgba()） */
function hexRgb(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '138,122,106';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

/** 把文本按 <br> 分段，每段作为 <p class="narrative-p"> 输出（HTML 信任） */
function renderParas(text: string, wrapperStyle = ''): string {
  const paras = text.split(/<br\s*\/?>/i).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return '';
  const wrapAttr = wrapperStyle ? ` style="${wrapperStyle}"` : '';
  return `<div class="body-narrative"${wrapAttr}>${
    paras.map((p) => `<p class="narrative-p">${p}</p>`).join('')
  }</div>`;
}

/** 把 ①xxx ②xxx ③xxx 风格内容拆成 [{mark, name, desc}, ...] */
const CIRCLE_NUMS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
function parseNumberedItems(text: string): Array<{ mark: string; name: string; desc: string }> {
  if (!text) return [];
  const re = new RegExp(`[${CIRCLE_NUMS}]`);
  if (!re.test(text)) return [];
  const first = text.search(re);
  const trimmed = text.slice(first);
  const splitRe = new RegExp(`(?=[${CIRCLE_NUMS}])`);
  const parts = trimmed.split(splitRe).map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => {
    const mark = p[0];
    let rest = p.slice(1).trim()
      .replace(/^(?:<br\s*\/?>\s*)+/i, '')
      .replace(/(?:\s*<br\s*\/?>)+$/i, '')
      .trim();
    const m = rest.match(/^([^—:：(（]+?)(?:——|：|:)(.*)$/s);
    if (m) return { mark, name: m[1].trim(), desc: m[2].trim() };
    return { mark, name: '', desc: rest };
  });
}

// ============================================================
// 5 种 renderer
// ============================================================

/** narrative —— 纯叙事，<br> 分段，保留内嵌标签 */
export function renderNarrative(body: string, _accentHex: string): string {
  return renderParas(body);
}

/** flat-list —— ◆ 分隔，name——desc 或 name：desc */
export function renderFlatList(body: string, accentHex: string): string {
  const parts = body.split('◆').map((p) => p.trim()).filter(Boolean);
  const items = parts.map((p) => {
    const m = p.match(/^([^—:：]+?)(?:——|：|:)(.*)$/s);
    if (m) return { name: m[1].trim(), desc: m[2].trim() };
    return { name: '', desc: p };
  });
  let lead: string | null = null;
  let rest = items;
  if (items[0] && items[0].name === '' && items[0].desc.length < 280 && items.length > 1) {
    lead = items[0].desc;
    rest = items.slice(1);
  }
  const rgb = hexRgb(accentHex);
  const numStyle = `background:rgba(${rgb},.1);color:${accentHex}`;
  const cards = rest.map((it, i) => `
    <div class="body-card">
      <div class="body-num" style="${numStyle}">${i + 1}</div>
      <div class="body-card-content">
        ${it.name ? `<div class="body-item-name">${it.name}</div>` : ''}
        <div class="body-item-desc">${it.desc}</div>
      </div>
    </div>
  `).join('');
  return `<div>${lead ? `<div class="body-lead">${lead}</div>` : ''}<div class="body-items">${cards}</div></div>`;
}

/** accordion —— lead<br>【section1】<br>①...②...<br>【section2】<br>①... */
export function renderAccordion(body: string, accentHex: string): string {
  const tokens = body.split(/(【[^】]+】)/);
  const lead = (tokens[0] || '').trim();
  const sections: Array<{ name: string; block: string }> = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const name = tokens[i].replace(/[【】]/g, '').trim();
    const block = (tokens[i + 1] || '').trim();
    sections.push({ name, block });
  }

  const sectionsHtml = sections.map((s, idx) => {
    const items = parseNumberedItems(s.block);
    const open = idx < 2 ? ' open' : '';
    const summaryStyle = `--accent:${accentHex}`;
    const bulletStyle = `background:${accentHex}`;
    const circleStyle = `border-color:${accentHex};color:${accentHex}`;
    const inner = items.length === 0
      ? `<div class="acc-prose">${s.block}</div>`
      : items.map((it, i) => `
          <div class="acc-row">
            <span class="acc-circle" style="${circleStyle}">${i + 1}</span>
            <div class="acc-text">
              ${it.name ? `<span class="acc-name">${it.name}</span>` : ''}
              <span class="acc-desc">${it.desc}</span>
            </div>
          </div>
        `).join('');
    return `
      <details class="acc-item"${open}>
        <summary class="acc-summary" style="${summaryStyle}">
          <span class="acc-bullet" style="${bulletStyle}"></span>
          <span class="acc-title">${s.name}</span>
          <span class="acc-count">${items.length}</span>
          <span class="acc-chev">▾</span>
        </summary>
        <div class="acc-body">${inner}</div>
      </details>
    `;
  }).join('');

  return `
    <div>
      ${lead ? renderParas(lead, 'margin-bottom:8px') : ''}
      <div class="accordion">${sectionsHtml}</div>
    </div>
  `;
}

/** compare —— <compare>r1c1|r1c2||r2c1|r2c2</compare> 表格 */
export function renderCompare(body: string, accentHex: string): string {
  const m = body.match(/<compare>([\s\S]*?)<\/compare>/);
  if (!m) return renderNarrative(body, accentHex);
  const before = body.slice(0, m.index!).trim();
  const after = body.slice(m.index! + m[0].length).trim();
  const rows = m[1].trim().split('||').map((r) => r.split('|').map((c) => c.trim()));
  const rgb = hexRgb(accentHex);

  const rowsHtml = rows.map((row) => {
    const head = row[0] || '';
    const tail = row.slice(1);
    const chips: string[] = [];
    const prose: string[] = [];
    tail.forEach((c) => {
      if (!c) return;
      if (c.length <= 60 && !/<\w/.test(c)) chips.push(c);
      else prose.push(c);
    });
    const pillStyle = `background:rgba(${rgb},.08);color:${accentHex};border-color:rgba(${rgb},.25)`;
    const chipsHtml = chips.length > 0
      ? `<div class="cmp-chips">${chips.map((c) => `<span class="cmp-cell-tight">${c}</span>`).join('')}</div>`
      : '';
    const proseHtml = prose.map((p) => `<div class="cmp-cell-prose">${p}</div>`).join('');
    return `
      <div class="cmp-row">
        <div class="cmp-pill" style="${pillStyle}">${head}</div>
        <div class="cmp-cells">${chipsHtml}${proseHtml}</div>
      </div>
    `;
  }).join('');

  return `
    <div>
      ${before ? renderParas(before, 'margin-bottom:14px') : ''}
      <div class="cmp-table" style="--accent:${accentHex}">${rowsHtml}</div>
      ${after ? (after.includes('◆')
        ? `<div style="margin-top:14px">${renderFlatList(after, accentHex)}</div>`
        : renderParas(after, 'margin-top:14px')) : ''}
    </div>
  `;
}

/** compare cards —— OptionA 学派详情专用，N 张并排卡 */
export function renderCompareCards(body: string, accentHex: string): string {
  const m = body.match(/<compare>([\s\S]*?)<\/compare>/);
  if (!m) return renderCompare(body, accentHex);
  const before = body.slice(0, m.index!).trim();
  const after = body.slice(m.index! + m[0].length).trim();
  const rows = m[1].trim().split('||').map((r) => r.split('|').map((c) => c.trim()));

  const cardsHtml = rows.map((row, ri) => {
    const name = row[0] || '';
    const headline = row[1] || '';
    const sub = row[2] || '';
    const secondary = row.slice(3).filter(Boolean);
    const headlineStyle = `color:${accentHex}`;
    const metaHtml = secondary.length > 0
      ? `<ul class="cmpc-meta">${secondary.map((s) => `<li>${s}</li>`).join('')}</ul>`
      : '';
    return `
      <div class="cmpc-card">
        <span class="cmpc-num">${String(ri + 1).padStart(1, '0')}</span>
        <div class="cmpc-name">${name}</div>
        ${headline ? `<div class="cmpc-headline" style="${headlineStyle}">${headline}</div>` : ''}
        ${sub ? `<div class="cmpc-sub">${sub}</div>` : ''}
        ${metaHtml}
      </div>
    `;
  }).join('');

  const gridStyle = `--accent:${accentHex};grid-template-columns:repeat(${rows.length}, minmax(0, 1fr))`;
  return `
    <div>
      ${before ? renderParas(before, 'margin-bottom:18px') : ''}
      <div class="cmpc-grid" style="${gridStyle}">${cardsHtml}</div>
      ${after && !after.startsWith('◆') ? renderParas(after, 'margin-top:18px') : ''}
    </div>
  `;
}

/** quad —— <quad>x,y||name|emoji|tag|desc||...</quad> 四象限 */
export function renderQuad(body: string, accentHex: string): string {
  const m = body.match(/<quad>([\s\S]*?)<\/quad>/);
  if (!m) return renderNarrative(body, accentHex);
  const before = body.slice(0, m.index!).trim();
  const after = body.slice(m.index! + m[0].length).trim();
  const parts = m[1].split('||').map((s) => s.trim()).filter(Boolean);
  const axes = (parts[0] || '').split(',');
  const xAxis = (axes[0] || '').trim();
  const yAxis = (axes[1] || '').trim();
  const quads = parts.slice(1, 5).map((p) => {
    const cells = p.split('|').map((c) => c.trim());
    return { name: cells[0] || '', emoji: cells[1] || '', tag: cells[2] || '', desc: cells[3] || '' };
  });
  while (quads.length < 4) quads.push({ name: '', emoji: '', tag: '', desc: '' });

  const cellsHtml = quads.map((q) => `
    <div class="quad-cell">
      <div class="quad-emoji">${esc(q.emoji)}</div>
      <div class="quad-name">${esc(q.name)}</div>
      <div class="quad-tag" style="color:${accentHex}">${esc(q.tag)}</div>
      <div class="quad-desc">${q.desc}</div>
    </div>
  `).join('');

  return `
    <div>
      ${before ? `<div class="body-lead">${before}</div>` : ''}
      <div class="quad-wrap" style="--accent:${accentHex}">
        ${yAxis ? `<div class="quad-axis-y">${esc(yAxis)}</div>` : ''}
        <div class="quad-grid">${cellsHtml}</div>
        ${xAxis ? `<div class="quad-axis-x">${esc(xAxis)}</div>` : ''}
      </div>
      ${after ? renderParas(after, 'margin-top:14px') : ''}
    </div>
  `;
}

// ============================================================
// Dispatchers
// ============================================================

/** 主入口：按 format 派发到对应 renderer，compare → 表格版 */
export function renderBody(
  fmt: KpFormat | string,
  body: string,
  accentHex: string = FALLBACK_ACCENT,
): string {
  if (!body) return '';
  switch (fmt) {
    case 'flat-list': return renderFlatList(body, accentHex);
    case 'accordion': return renderAccordion(body, accentHex);
    case 'compare':   return renderCompare(body, accentHex);
    case 'quad':      return renderQuad(body, accentHex);
    case 'narrative':
    default:          return renderNarrative(body, accentHex);
  }
}

/** 学派详情页专用：compare → 卡片版（renderCompareCards） */
export function renderBodyForSchool(
  fmt: KpFormat | string,
  body: string,
  accentHex: string = FALLBACK_ACCENT,
): string {
  if (!body) return '';
  if (fmt === 'compare') return renderCompareCards(body, accentHex);
  return renderBody(fmt, body, accentHex);
}

// ============================================================
// EvalTagsModule —— 评价标签渲染（独立 6 色 tone, 不随学派变）
// ============================================================

/** 把 EvalContent dict 渲染成 .eval-mod section（自动跳过空字段） */
export function renderEvalModule(content: EvalContent | null | undefined): string {
  if (!content) return '';
  // 按 EVAL_TAG_DEFS 顺序输出（义/限/例/应/用/喻）
  const rows = EVAL_TAG_DEFS
    .map((d) => ({ def: d, text: content[d.glyph]?.trim() }))
    .filter((x) => Boolean(x.text));
  if (rows.length === 0) return '';

  const rowsHtml = rows.map(({ def, text }) => `
    <div class="eval-row" style="--tone:${def.tone}">
      <span class="eval-glyph">${def.glyph}</span>
      <div class="eval-body">
        <div class="eval-label">${def.name}</div>
        <div class="eval-text">${text}</div>
      </div>
    </div>
  `).join('');

  return `
    <section class="eval-mod">
      <div class="eval-mod-h">
        <span>评价</span>
        <span class="eval-mod-count">${rows.length}</span>
      </div>
      <div class="eval-mod-list">${rowsHtml}</div>
    </section>
  `;
}
