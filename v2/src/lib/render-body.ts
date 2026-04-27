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

/**
 * 把 ①xxx ②xxx ③xxx 风格内容拆成 [{mark, name, alt?, desc}, ...]
 *
 * v0.5.46 regex 升级：支持 `name（alt）——desc` 形式（之前只支持 `name——desc`）
 *   - name 部分（必有）：`<strong>foo</strong>` 包裹也算 name 一部分
 *   - alt 部分（可选）：name 后紧跟 `（…）` 中括号内容（多为日语 alt 或英文原文）
 *   - 分隔符：`——` 或 `：`/`:`
 *   - desc：分隔符之后到末尾
 *
 * alt 保留在返回字段（暂不渲染，未来 lang-toggle 可读）。
 *
 * 边界：
 *   - 无分隔符 → fallback name='' desc=整段
 *   - 括号未闭合 → alt 不匹配，回到 `name——desc` 模式
 *   - desc 内可包含 `（中文括号说明）` — 不影响（只取 name 后第一个括号当 alt）
 */
const CIRCLE_NUMS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
function parseNumberedItems(text: string): Array<{ mark: string; name: string; alt?: string; desc: string }> {
  if (!text) return [];
  const re = new RegExp(`[${CIRCLE_NUMS}]`);
  if (!re.test(text)) return [];
  const first = text.search(re);
  const trimmed = text.slice(first);
  const splitRe = new RegExp(`(?=[${CIRCLE_NUMS}])`);
  const parts = trimmed.split(splitRe).map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => {
    const mark = p[0];
    const rest = p.slice(1).trim()
      .replace(/^(?:<br\s*\/?>\s*)+/i, '')
      .replace(/(?:\s*<br\s*\/?>)+$/i, '')
      .trim();
    const m = rest.match(/^([^—:：(（]+?)(?:[（(]([^）)]+)[）)])?\s*(?:——|：|:)\s*(.*)$/s);
    if (m) return { mark, name: m[1].trim(), alt: m[2]?.trim(), desc: m[3].trim() };
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

/**
 * v0.5.51 把 section name 中尾部括号（中文/英文括号）拆出当 sub 副标题
 *   "4种变革类型（变革对象维度）" → { name: "4种变革类型", sub: "变革对象维度" }
 *   "Bass 4I（核心维度）"        → { name: "Bass 4I", sub: "核心维度" }
 *   "增强效应"                   → { name: "增强效应", sub: "" }
 */
function splitSectionName(raw: string): { name: string; sub: string } {
  const m = raw.match(/^(.*?)\s*[（(]([^）)]+)[）)]\s*$/);
  if (m && m[1].trim()) return { name: m[1].trim(), sub: m[2].trim() };
  return { name: raw, sub: '' };
}

/**
 * accordion —— lead<br>【section1】<br>①...②...<br>【section2】<br>①...
 *
 * v0.5.46 重写：去 left strip + name/desc 两段 + 全部 default open
 * v0.5.51 升级：
 *   - section name 拆 sub（小灰 inline 副标题）
 *   - 去掉 count 数字（用户反馈"4/5"灰色计数没必要）
 *   - sub-section 仍用 <details open> 可点折叠
 */
export function renderAccordion(body: string, accentHex: string): string {
  const tokens = body.split(/(【[^】]+】)/);
  const lead = (tokens[0] || '').trim();
  const sections: Array<{ name: string; sub: string; block: string }> = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const raw = tokens[i].replace(/[【】]/g, '').trim();
    const { name, sub } = splitSectionName(raw);
    const block = (tokens[i + 1] || '').trim();
    sections.push({ name, sub, block });
  }

  const circleStyle = `border-color:${accentHex};color:${accentHex}`;

  const sectionsHtml = sections.map((s) => {
    const items = parseNumberedItems(s.block);
    const inner = items.length === 0
      ? `<div class="acc-prose">${s.block}</div>`
      : `<ol class="acc-numbered">${items.map((it, i) => `
          <li class="acc-li">
            <span class="acc-li-n" style="${circleStyle}">${i + 1}</span>
            <div class="acc-li-body">
              ${it.name ? `<span class="acc-li-name">${it.name}</span>` : ''}
              ${it.desc ? `<div class="acc-li-desc">${it.desc}</div>` : ''}
            </div>
          </li>
        `).join('')}</ol>`;
    return `
      <details class="acc-block" open>
        <summary class="acc-head">
          <h3 class="acc-title">${s.name}${s.sub ? `<span class="acc-sub">${s.sub}</span>` : ''}</h3>
          <span class="acc-chev">▾</span>
        </summary>
        ${inner}
      </details>
    `;
  }).join('');

  return `
    <div>
      ${lead ? renderParas(lead, 'margin-bottom:8px') : ''}
      <div class="acc">${sectionsHtml}</div>
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

/**
 * 主入口：按 format 派发到对应 renderer，compare → 表格版
 *
 * 用对象参数而非位置参数：fmt/body/accentHex 都是 string，位置错位时 TS 无法察觉。
 * 命名参数 + KpFormat 字面量类型，把"漏字段 / 字段错位 / fmt 传非法值"全部挪到编译期。
 */
export function renderBody(opts: {
  fmt: KpFormat;
  body: string;
  accentHex?: string;
}): string {
  const { fmt, body, accentHex = FALLBACK_ACCENT } = opts;
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
export function renderBodyForSchool(opts: {
  fmt: KpFormat;
  body: string;
  accentHex?: string;
}): string {
  const { fmt, body, accentHex = FALLBACK_ACCENT } = opts;
  if (!body) return '';
  if (fmt === 'compare') return renderCompareCards(body, accentHex);
  return renderBody({ fmt, body, accentHex });
}

// ============================================================
// EvalTagsModule —— 评价标签渲染（独立 6 色 tone, 不随学派变）
// ============================================================

/**
 * 把 EvalContent dict 渲染成 evaluation section（自动跳过空字段）
 *
 * v0.5.46 重写：
 *   - <details open> 默认展开 + 可折叠
 *   - 去 row card（border-left strip + bg tint），改 hanging indent 布局
 *   - "意义/局限/例子/应对/应用/比喻" 双字 pill label（去单字 glyph 圆圈重复）
 *   - tone 色只挂在 pill 上（10% bg + 100% text），整体灰白干净
 *   - 行间 1px 弱 hr 分隔
 */
export function renderEvalModule(content: EvalContent | null | undefined): string {
  if (!content) return '';
  const rows = EVAL_TAG_DEFS
    .map((d) => ({ def: d, text: content[d.glyph]?.trim() }))
    .filter((x) => Boolean(x.text));
  if (rows.length === 0) return '';

  const rowsHtml = rows.map(({ def, text }) => `
    <div class="eval-row" style="--tone:${def.tone}">
      <span class="eval-pill">${def.name}</span>
      <div class="eval-text">${text}</div>
    </div>
  `).join('');

  return `
    <details class="eval" open>
      <summary class="eval-h">
        <span>评价</span>
        <span class="eval-count">${rows.length}</span>
        <span class="eval-chev">▾</span>
      </summary>
      <div class="eval-list">${rowsHtml}</div>
    </details>
  `;
}
