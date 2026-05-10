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
  QuadAxis,
  KpEvaluationsLang,
} from '~/schemas/kp-body-structured';

import { formatTrustedProseHtml, inlineMdDoubleStarToStrong } from './format-trusted-prose-html';

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

/** prose 文本按 <br> 或 \n 分段 → <p class="narrative-p">
 * v0.8.30: 兼容用户在 admin textarea 里直接 Enter 换行存的字面 \n（v1 era 数据用 <br>，
 * v2 admin UI 通常存 \n）。两种都识别为段落分隔。
 * v0.11.x: 每段内 `**…**` → `<strong>`（见 format-trusted-prose-html）。
 */
function renderParas(text: string, wrapperStyle = ''): string {
  const paras = text.split(/<br\s*\/?>|\n/i).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return '';
  const wrapAttr = wrapperStyle ? ` style="${wrapperStyle}"` : '';
  return `<div class="body-narrative"${wrapAttr}>${
    paras.map((p) => `<p class="narrative-p">${formatTrustedProseHtml(p)}</p>`).join('')
  }</div>`;
}

/** v0.5.51 复用：section name 拆 sub */
function splitSectionName(raw: string): { name: string; sub: string } {
  const m = raw.match(/^(.*?)\s*[（(]([^）)]+)[）)]\s*$/);
  if (m && m[1].trim()) return { name: m[1].trim(), sub: m[2].trim() };
  return { name: raw, sub: '' };
}

/** flat-list / accordion 条目标题：与分组 title 相同「尾部括号」拆主副，副标题用 .acc-sub */
function renderItemNameWithOptionalSub(raw: string): string {
  const { name, sub } = splitSectionName(raw);
  return `${formatTrustedProseHtml(name)}${sub ? `<span class="acc-sub">${formatTrustedProseHtml(sub)}</span>` : ''}`;
}

// ============================================================
// 5 种 per-format renderer
// ============================================================

export function renderNarrativeStructured(body: NarrativeBody): string {
  return `<div class="body-fmt body-fmt-narr">${renderParas(body.prose)}</div>`;
}

export function renderFlatListStructured(body: FlatListBody, accentHex: string): string {
  const cards = body.items
    .map(
      (it, i) => `
    <div class="body-card">
      <div class="body-num">${i + 1}</div>
      <div class="body-card-content">
        ${it.name ? `<div class="body-item-name">${renderItemNameWithOptionalSub(it.name)}</div>` : ''}
        <div class="body-item-desc">${formatTrustedProseHtml(it.desc)}</div>
      </div>
    </div>
  `,
    )
    .join('');
  return `<div class="body-fmt body-fmt-flat" style="--accent:${accentHex}">${body.lead ? `<div class="body-lead">${formatTrustedProseHtml(body.lead)}</div>` : ''}<div class="body-items">${cards}</div></div>`;
}

export function renderAccordionStructured(body: AccordionBody, accentHex: string): string {
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
            <span class="acc-li-n">${i + 1}</span>
            <div class="acc-li-body">
              ${it.name ? `<span class="acc-li-name">${renderItemNameWithOptionalSub(it.name)}</span>` : ''}
              ${it.desc ? `<div class="acc-li-desc">${formatTrustedProseHtml(it.desc)}</div>` : ''}
            </div>
          </li>
        `,
              )
              .join('')}</ol>`;
      return `
      <details class="acc-block" open>
        <summary class="acc-head">
          <h3 class="acc-title">${inlineMdDoubleStarToStrong(name)}${sub ? `<span class="acc-sub">${inlineMdDoubleStarToStrong(sub)}</span>` : ''}</h3>
          <span class="acc-chev">▾</span>
        </summary>
        ${inner}
      </details>
    `;
    })
    .join('');

  return `
    <div class="body-fmt body-fmt-acc" style="--accent:${accentHex}">
      ${body.lead ? renderParas(body.lead, 'margin-bottom:8px') : ''}
      <div class="acc">${sectionsHtml}</div>
    </div>
  `;
}

/** compare 卡片版 — v0.8.30 起全站统一（KP / 学派 / 学者 详情页共用）
 *
 * v0.8.30: 删了老 renderCompareStructured (table 版) — KP 详情页之前用 table 视觉跟
 * 学派/学者 详情不一致，用户 fb 要求统一。dispatcher 也去掉 variant 分支。
 *
 * Grid 列数：v0.8.30 改 auto-fit minmax(180px, 1fr) 自适应，KP 详情窄栏 (max 720px)
 * 时多列卡片自动换行/缩列；宽栏时按数据列数撑开。
 *
 * v0.8.28: detail 字段移到背面 reveal
 * v0.8.29: 删 "详情/返回" 字样
 *
 * 交互：
 *   - PC (≥1024px): hover 出阴影；click → CSS 3D rotateY(180deg) 翻面
 *   - 手机 (<1024px): tap → max-height 过渡 inline 展开
 *   - 没填 detail 的列退化扁平卡片，无 affordance
 *   - 行为由 /cmpc-flip.js 接管
 */
export function renderCompareCardsStructured(body: CompareBody, accentHex: string): string {
  const cardsHtml = body.cols
    .map((c, ri) => {
      // 正面 secondary = type / theories（detail 移到背面）
      const frontSecondary = [c.type, c.theories].filter(Boolean);
      const metaHtml =
        frontSecondary.length > 0
          ? `<ul class="cmpc-meta">${frontSecondary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
          : '';
      const hasDetail = Boolean(c.detail);
      const frontInner = `
        <div class="cmpc-face cmpc-front">
          <span class="cmpc-num">${String(ri + 1).padStart(1, '0')}</span>
          <div class="cmpc-name">${esc(c.title)}</div>
          ${c.keyword ? `<div class="cmpc-headline">${esc(c.keyword)}</div>` : ''}
          ${c.desc ? `<div class="cmpc-sub">${esc(c.desc)}</div>` : ''}
          ${metaHtml}
        </div>`;
      const backInner = hasDetail
        ? `
        <div class="cmpc-face cmpc-back">
          <div class="cmpc-detail">${formatTrustedProseHtml(c.detail)}</div>
        </div>`
        : '';
      return `
      <div class="cmpc-card${hasDetail ? ' is-flippable' : ''}"${hasDetail ? ' role="button" tabindex="0" aria-expanded="false" data-flippable aria-label="' + esc(c.title) + ' — 查看详情"' : ''}>
        <div class="cmpc-card-inner">
          ${frontInner}
          ${backInner}
        </div>
      </div>
    `;
    })
    .join('');

  // v0.8.30: auto-fit 自适应。KP 详情窄栏多列时自动换行；宽栏按数据列数撑开
  return `
    <div class="body-fmt body-fmt-cmpc" style="--accent:${accentHex}">
      ${body.lead ? renderParas(body.lead, 'margin-bottom:18px') : ''}
      <div class="cmpc-grid">${cardsHtml}</div>
    </div>
  `;
}

/**
 * QuadAxis → axis HTML：
 *   - 3 labels (low + label + high 全填): 单 span 拼 "low-label-high" 居中
 *   - 2 labels (label 空, 仅 low/high): 双 span 分别对齐到列/行端 (.is-2labels)
 *   - 0/1 label: 同 3-label 路径，单 span (兜底)
 * v0.8.24 fix: 2-label 老路径用 "-" 拼接居中，分不出哪头是 low / 哪头是 high；改双 span 对齐。
 */
function renderQuadAxis(axis: QuadAxis, dir: 'x' | 'y'): string {
  if (!axis.low && !axis.high && !axis.label) return '';
  const isTwoLabel = !axis.label && Boolean(axis.low) && Boolean(axis.high);
  if (isTwoLabel) {
    return `<div class="quad-axis-${dir} is-2labels">`
      + `<span class="quad-axis-end quad-axis-low">${esc(axis.low)}</span>`
      + `<span class="quad-axis-end quad-axis-high">${esc(axis.high)}</span>`
      + `</div>`;
  }
  const text = axis.label
    ? `${axis.low}-${axis.label}-${axis.high}`
    : (axis.low || axis.high || '');
  return `<div class="quad-axis-${dir}">${esc(text)}</div>`;
}

export function renderQuadStructured(body: QuadBody, accentHex: string): string {
  // v0.8.33: cell 永远可翻面（背面空时显示小号 name + 空白区域，跟正面 4 象限位置对齐）。
  // 跟 compare 卡复用 cmpc-flip.js 的 [data-flippable] 行为；CSS 用 .quad-* 并行规则。
  const cellsHtml = body.cells
    .map(
      (q) => `
    <div class="quad-cell is-flippable" role="button" tabindex="0" aria-expanded="false" aria-label="${esc(q.name)} — 查看详情" data-flippable>
      <div class="quad-cell-inner">
        <div class="quad-face quad-front">
          <div class="quad-emoji">${esc(q.emoji)}</div>
          <div class="quad-name">${esc(q.name)}</div>
          <div class="quad-tag">${esc(q.sub)}</div>
          <div class="quad-desc">${formatTrustedProseHtml(q.detail)}</div>
        </div>
        <div class="quad-face quad-back">
          <div class="quad-back-name">${esc(q.name)}</div>
          <div class="quad-detail">${formatTrustedProseHtml(q.detailBack)}</div>
        </div>
      </div>
    </div>
  `,
    )
    .join('');

  const yAxisHtml = renderQuadAxis(body.yAxis, 'y');
  const xAxisHtml = renderQuadAxis(body.xAxis, 'x');

  return `
    <div class="body-fmt body-fmt-quad" style="--accent:${accentHex}">
      ${body.lead ? `<div class="body-lead">${formatTrustedProseHtml(body.lead)}</div>` : ''}
      <div class="quad-wrap">
        ${yAxisHtml}
        <div class="quad-grid">${cellsHtml}</div>
        ${xAxisHtml}
      </div>
    </div>
  `;
}

// ============================================================
// Dispatcher
// ============================================================

/** v0.8.30: variant 分支删了 — compare 全站统一卡片版（KP / 学派 / 学者 详情共用）。
 * 调用方仍可传 variant 参数（向后兼容），但被忽略。
 */
export function renderStructuredBody(opts: {
  body: KpBody;
  accentHex?: string;
  /** @deprecated v0.8.30 起 compare 统一卡片版，variant 参数被忽略 */
  variant?: 'detail' | 'school';
}): string {
  const { body, accentHex = FALLBACK_ACCENT } = opts;
  switch (body.format) {
    case 'narrative':
      return renderNarrativeStructured(body);
    case 'flat-list':
      return renderFlatListStructured(body, accentHex);
    case 'accordion':
      return renderAccordionStructured(body, accentHex);
    case 'compare':
      return renderCompareCardsStructured(body, accentHex);
    case 'quad':
      return renderQuadStructured(body, accentHex);
  }
}

// ============================================================
// 评价模块（独立于 body）— 6 字段 (meaning/limit/example/response/application/analogy)
// ============================================================

/**
 * 6 字段定义：v0.8 英文 key + 中文 pill 标签 + tone 语义色。
 *
 * v0.8.23 — 用户 fb：v0.8.13 的 84px LHS 圆 glyph + 双标签 layout 太复杂 ("现在的这块做的太复杂了，
 * 原来的绿色'意义'红色'局限'就挺好的")。回滚到 v0.5.46 hanging indent + tone-pill 简洁版：
 *   - 56px pill (只放中文双字 e.g. "意义") + 1fr text，左对齐
 *   - 三组 tone 语义色（与学派 accent 无关，写死 hex）：
 *     * 积极组（义/应/用）= 绿 #10B981 — 核心价值 / 行动策略
 *     * 警告组（限）     = 红 #EF4444 — 边界 / 风险
 *     * 中性组（例/喻）   = 灰 #6B7280 — 实例与隐喻
 *   - pill: tone color 文字 + 10% tone bg；行间 1px 弱 hr
 */
type EvalKey = keyof KpEvaluationsLang;
interface EvalDef {
  key: EvalKey;
  label: string;  // 中文双字 (意义/局限/例子/应对/应用/比喻)
  tone: string;   // 语义色 hex
}
const EVAL_DEFS: readonly EvalDef[] = [
  { key: 'meaning',     label: '意义', tone: '#10B981' },
  { key: 'limit',       label: '局限', tone: '#EF4444' },
  { key: 'example',     label: '例子', tone: '#6B7280' },
  { key: 'response',    label: '应对', tone: '#10B981' },
  { key: 'application', label: '应用', tone: '#10B981' },
  { key: 'analogy',     label: '比喻', tone: '#6B7280' },
] as const;

/**
 * 把 KpEvaluationsLang 渲染成 evaluation section（自动跳过空字段）。
 * v0.8.10 Stage 5：取代旧 renderEvalModule(EvalContent) — 直接吃 v0.8 英文 key shape。
 * v0.8.23：layout 回滚到 v0.5.46 简洁版（用户 fb 当前太复杂）。
 */
export function renderEvalModule(content: KpEvaluationsLang | null | undefined): string {
  if (!content) return '';
  const rows = EVAL_DEFS
    .map((d) => ({ def: d, text: content[d.key]?.trim() }))
    .filter((x): x is { def: EvalDef; text: string } => Boolean(x.text));
  if (rows.length === 0) return '';

  const rowsHtml = rows.map(({ def, text }) => `
    <div class="eval-row" style="--tone:${def.tone}">
      <span class="eval-pill">${def.label}</span>
      <div class="eval-text">${formatTrustedProseHtml(text)}</div>
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
