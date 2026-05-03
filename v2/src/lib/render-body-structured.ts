/**
 * render-body-structured.ts — KpBody (结构化) → HTML 渲染器 (v0.8.0 Stage 2)
 *
 * 输入：typed KpBody 对象（不是 DSL 字符串），输出 HTML 字符串。
 * 5 种 format 各自一个 renderer，HTML 输出与旧 render-body.ts 视觉/CSS 类名完全一致
 * （便于 Stage 2 渲染层无缝切换 + parity test 验证）。
 *
 * 调用入口：
 *   - renderStructuredBody({ body, accentHex, variant }) — 通用入口
 *     variant: 'detail' (默认) | 'school' （compare 走卡片版而非表格版）
 *
 * 旧 render-body.ts 仍保留作 Stage 2-4 期间的 fallback；Stage 5 drop 旧 renderer。
 */

import type {
  KpBody,
  NarrativeBody,
  FlatListBody,
  AccordionBody,
  CompareBody,
  QuadBody,
} from '~/schemas/kp-body-structured';

const FALLBACK_ACCENT = '#8a7a6a';

// ============================================================
// Utilities (与 render-body.ts 一致)
// ============================================================

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

function hexRgb(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '138,122,106';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

/** prose 文本按 <br> 分段 → <p class="narrative-p"> */
function renderParas(text: string, wrapperStyle = ''): string {
  const paras = text.split(/<br\s*\/?>/i).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return '';
  const wrapAttr = wrapperStyle ? ` style="${wrapperStyle}"` : '';
  return `<div class="body-narrative"${wrapAttr}>${
    paras.map((p) => `<p class="narrative-p">${p}</p>`).join('')
  }</div>`;
}

/** v0.5.51 复用：section name 拆 sub */
function splitSectionName(raw: string): { name: string; sub: string } {
  const m = raw.match(/^(.*?)\s*[（(]([^）)]+)[）)]\s*$/);
  if (m && m[1].trim()) return { name: m[1].trim(), sub: m[2].trim() };
  return { name: raw, sub: '' };
}

// ============================================================
// 5 种 per-format renderer
// ============================================================

export function renderNarrativeStructured(body: NarrativeBody): string {
  return renderParas(body.prose);
}

export function renderFlatListStructured(body: FlatListBody, accentHex: string): string {
  const rgb = hexRgb(accentHex);
  const numStyle = `background:rgba(${rgb},.1);color:${accentHex}`;
  const cards = body.items
    .map(
      (it, i) => `
    <div class="body-card">
      <div class="body-num" style="${numStyle}">${i + 1}</div>
      <div class="body-card-content">
        ${it.name ? `<div class="body-item-name">${it.name}</div>` : ''}
        <div class="body-item-desc">${it.desc}</div>
      </div>
    </div>
  `,
    )
    .join('');
  return `<div>${body.lead ? `<div class="body-lead">${body.lead}</div>` : ''}<div class="body-items">${cards}</div></div>`;
}

export function renderAccordionStructured(body: AccordionBody, accentHex: string): string {
  const circleStyle = `border-color:${accentHex};color:${accentHex}`;

  const sectionsHtml = body.groups
    .map((g) => {
      const { name, sub } = splitSectionName(g.title);
      const inner =
        g.items.length === 0
          ? `<div class="acc-prose"></div>`
          : `<ol class="acc-numbered">${g.items
              .map(
                (it, i) => `
          <li class="acc-li">
            <span class="acc-li-n" style="${circleStyle}">${i + 1}</span>
            <div class="acc-li-body">
              ${it.name ? `<span class="acc-li-name">${it.name}</span>` : ''}
              ${it.desc ? `<div class="acc-li-desc">${it.desc}</div>` : ''}
            </div>
          </li>
        `,
              )
              .join('')}</ol>`;
      return `
      <details class="acc-block" open>
        <summary class="acc-head">
          <h3 class="acc-title">${name}${sub ? `<span class="acc-sub">${sub}</span>` : ''}</h3>
          <span class="acc-chev">▾</span>
        </summary>
        ${inner}
      </details>
    `;
    })
    .join('');

  return `
    <div>
      ${body.lead ? renderParas(body.lead, 'margin-bottom:8px') : ''}
      <div class="acc">${sectionsHtml}</div>
    </div>
  `;
}

/**
 * compare 表格版（详情页用）。
 * 旧 renderer 把每行第 0 个当 head pill，第 1+ 个分别按长度判定 chip vs prose。
 * 新 renderer 用结构化字段：
 *   - title 当 head pill
 *   - keyword + desc + type + theories 都 push 到 cells（按长度 ≤60 + 无 HTML tag 分 chip vs prose）
 *   - detail 单独 prose 段
 */
export function renderCompareStructured(body: CompareBody, accentHex: string): string {
  const rgb = hexRgb(accentHex);

  const rowsHtml = body.cols
    .map((c) => {
      // 把 5 个细字段按"chip vs prose"分类（保旧 renderer 视觉）
      const tail = [c.keyword, c.desc, c.type, c.theories, c.detail].filter(Boolean);
      const chips: string[] = [];
      const prose: string[] = [];
      for (const v of tail) {
        if (v.length <= 60 && !/<\w/.test(v)) chips.push(v);
        else prose.push(v);
      }
      const pillStyle = `background:rgba(${rgb},.08);color:${accentHex};border-color:rgba(${rgb},.25)`;
      const chipsHtml =
        chips.length > 0
          ? `<div class="cmp-chips">${chips.map((s) => `<span class="cmp-cell-tight">${s}</span>`).join('')}</div>`
          : '';
      const proseHtml = prose.map((p) => `<div class="cmp-cell-prose">${p}</div>`).join('');
      return `
      <div class="cmp-row">
        <div class="cmp-pill" style="${pillStyle}">${c.title}</div>
        <div class="cmp-cells">${chipsHtml}${proseHtml}</div>
      </div>
    `;
    })
    .join('');

  return `
    <div>
      ${body.lead ? renderParas(body.lead, 'margin-bottom:14px') : ''}
      <div class="cmp-table" style="--accent:${accentHex}">${rowsHtml}</div>
    </div>
  `;
}

/** compare 卡片版（学派详情页用） */
export function renderCompareCardsStructured(body: CompareBody, accentHex: string): string {
  const cardsHtml = body.cols
    .map((c, ri) => {
      const headlineStyle = `color:${accentHex}`;
      // headline = keyword (短标签提炼)；sub = desc (一句话定义)；secondary 列表 = type/theories/detail
      const secondary = [c.type, c.theories, c.detail].filter(Boolean);
      const metaHtml =
        secondary.length > 0
          ? `<ul class="cmpc-meta">${secondary.map((s) => `<li>${s}</li>`).join('')}</ul>`
          : '';
      return `
      <div class="cmpc-card">
        <span class="cmpc-num">${String(ri + 1).padStart(1, '0')}</span>
        <div class="cmpc-name">${c.title}</div>
        ${c.keyword ? `<div class="cmpc-headline" style="${headlineStyle}">${c.keyword}</div>` : ''}
        ${c.desc ? `<div class="cmpc-sub">${c.desc}</div>` : ''}
        ${metaHtml}
      </div>
    `;
    })
    .join('');

  const gridStyle = `--accent:${accentHex};grid-template-columns:repeat(${body.cols.length}, minmax(0, 1fr))`;
  return `
    <div>
      ${body.lead ? renderParas(body.lead, 'margin-bottom:18px') : ''}
      <div class="cmpc-grid" style="${gridStyle}">${cardsHtml}</div>
    </div>
  `;
}

export function renderQuadStructured(body: QuadBody, accentHex: string): string {
  const cellsHtml = body.cells
    .map(
      (q) => `
    <div class="quad-cell">
      <div class="quad-emoji">${esc(q.emoji)}</div>
      <div class="quad-name">${esc(q.name)}</div>
      <div class="quad-tag" style="color:${accentHex}">${esc(q.sub)}</div>
      <div class="quad-desc">${q.detail}</div>
    </div>
  `,
    )
    .join('');

  return `
    <div>
      ${body.lead ? `<div class="body-lead">${body.lead}</div>` : ''}
      <div class="quad-wrap" style="--accent:${accentHex}">
        ${body.yAxis ? `<div class="quad-axis-y">${esc(body.yAxis)}</div>` : ''}
        <div class="quad-grid">${cellsHtml}</div>
        ${body.xAxis ? `<div class="quad-axis-x">${esc(body.xAxis)}</div>` : ''}
      </div>
    </div>
  `;
}

// ============================================================
// Dispatcher
// ============================================================

export function renderStructuredBody(opts: {
  body: KpBody;
  accentHex?: string;
  /** 'detail' (默认 — compare 走表格) | 'school' (compare 走卡片) */
  variant?: 'detail' | 'school';
}): string {
  const { body, accentHex = FALLBACK_ACCENT, variant = 'detail' } = opts;
  switch (body.format) {
    case 'narrative':
      return renderNarrativeStructured(body);
    case 'flat-list':
      return renderFlatListStructured(body, accentHex);
    case 'accordion':
      return renderAccordionStructured(body, accentHex);
    case 'compare':
      return variant === 'school'
        ? renderCompareCardsStructured(body, accentHex)
        : renderCompareStructured(body, accentHex);
    case 'quad':
      return renderQuadStructured(body, accentHex);
  }
}
