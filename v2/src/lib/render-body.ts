/**
 * KP body renderer — 把 JSON 里的 body 字符串转成结构化 HTML.
 *
 * 语法（从 v1 Main/js/render.js 移植，保持兼容）：
 *   <compare>...</compare>       翻转卡（N 列，onclick flip）
 *   <quad>...</quad>              四象限（2×2, binary/continuous 两种模式）
 *   <br>【组名】<br>①...<br>②...   手风琴分组（点标题展开）
 *   ①name——desc / ②...           编号条目
 *   ◆name——desc                  评价标签（义/限/例/应/用/喻）
 *   裸 <strong>/<em>              直接穿透
 *
 * 与 v1 的差异：
 *   - 不做 _linkifyTheories (学者/KP 交叉链接)，theories 字段当 plain text
 *   - 不调用外部全局（DATA / KNOWLEDGE），纯函数
 *
 * 交互：元素上带 inline onclick="this.classList.toggle('...')"，
 *   样式定义在 src/styles/components.css。
 *
 * XSS 防护（v0.3.3 修 A9）：
 *   所有用户数据字段（来自 D1 / JSON）在插入 HTML 前经 escInline：
 *     - `& < > " '` → HTML entity
 *     - 白名单 tag（strong / em / br，无属性）还原
 *   未来多 admin / 用户笔记上线前必须保持此不变式。
 */

/** 基础 HTML escape — 五字符全 encode。 */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Inline-safe escape — 除白名单 inline tag 外全部转义。
 *
 * 白名单（无属性版本）：<strong> </strong> <em> </em> <br> <br/> <br />
 * `<strong onclick=...>` 不会通过（不匹配精确形式）。
 */
export function escInline(s: unknown): string {
  const escaped = escapeHtml(s);
  return escaped
    .replace(/&lt;strong&gt;/g, '<strong>')
    .replace(/&lt;\/strong&gt;/g, '</strong>')
    .replace(/&lt;em&gt;/g, '<em>')
    .replace(/&lt;\/em&gt;/g, '</em>')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>');
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮'];
const NUM_MAP: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
  '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
  '⑪': '11', '⑫': '12', '⑬': '13', '⑭': '14', '⑮': '15',
};
const LABEL_WORDS: Record<string, true> = {
  意义: true, 局限: true, 企业例: true, 例子: true, 应对: true, 应用: true, 比喻: true, 例: true,
  意義: true, 限界: true,
};
const LABEL_SHORT: Record<string, string> = {
  意义: '义', 局限: '限', 企业例: '例', 例子: '例', 应对: '应', 应用: '用', 比喻: '喻', 例: '例',
  意義: '義', 限界: '限',
};

function hexRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function renderCompareCards(lead: string, data: string, accent: string): string {
  const rgb = hexRgb(accent);
  const cols = data.split('||').map((c) => c.trim()).filter(Boolean);
  let html = '';
  if (lead) html += `<div class="body-lead">${escInline(lead)}</div>`;
  html += `<div class="compare-grid" style="grid-template-columns:repeat(${cols.length},1fr);--accent:${accent};--accent-bg:rgba(${rgb},.08)">`;
  cols.forEach((col, i) => {
    const f = col.split('|').map((s) => s.trim());
    const title = f[0] ?? '';
    const keyword = f[1] ?? '';
    const desc = f[2] ?? '';
    const type = f[3] ?? '';
    const theories = f[4] ?? '';
    const detail = f[5] ?? '';
    const theoriesHtml = theories
      ? theories.split(',').map((t) => `<span>${escInline(t.trim())}</span>`).join('')
      : '';
    html +=
      `<div class="compare-col" onclick="this.classList.toggle('flipped')">` +
      `<div class="compare-col-inner">` +
      `<div class="compare-front">` +
      `<div class="compare-num">${i + 1}</div>` +
      `<div class="compare-title">${escInline(title)}</div>` +
      `<div class="compare-keyword">${escInline(keyword)}</div>` +
      `<div class="compare-desc">${escInline(desc)}</div>` +
      `<div class="compare-theories">${theoriesHtml}</div>` +
      `</div>` +
      (detail
        ? `<div class="compare-back">` +
          `<div class="compare-back-title">${escInline(title)}${type ? ` · ${escInline(type)}` : ''}</div>` +
          `<div class="compare-back-text">${escInline(detail)}</div>` +
          `</div>`
        : '') +
      `</div></div>`;
  });
  html += '</div>';
  return html;
}

interface QuadCell {
  simple: boolean;
  name: string;
  emoji?: string;
  sub?: string;
  detail?: string;
}

function renderQuadChart(lead: string, data: string, accent: string): string {
  const rgb = hexRgb(accent);
  const parts = data.split('||');
  const axes = (parts[0] ?? '').split(',').map((s) => s.trim());
  const yAxis = axes[0] ?? '';
  const xAxis = axes[1] ?? '';
  const isBinary = yAxis.includes('/');
  const cells: QuadCell[] = [];
  for (let i = 1; i < parts.length; i++) {
    const f = parts[i].split('|').map((s) => s.trim());
    if (isBinary && f.length <= 1) {
      cells.push({ simple: true, name: parts[i].trim() });
    } else {
      cells.push({
        simple: false,
        name: f[0] ?? '',
        emoji: f[1] ?? '',
        sub: f[2] ?? '',
        detail: f[3] ?? '',
      });
    }
  }

  let yBin: string[] = [];
  let xBin: string[] = [];
  let yName = '';
  let xName = '';
  if (isBinary) {
    yBin = yAxis.split('/').map((s) => s.trim());
    xBin = xAxis.split('/').map((s) => s.trim());
  } else {
    yName = yAxis.replace(/\s*低?\s*→\s*高?\s*$/, '').trim();
    xName = xAxis.replace(/\s*低?\s*→\s*高?\s*$/, '').trim();
  }

  let html = '';
  if (lead) html += `<div class="body-lead">${escInline(lead)}</div>`;
  html += `<div class="quad-wrap" style="--accent:${accent};--accent-bg:rgba(${rgb},.08)">`;
  if (yAxis) {
    if (isBinary) {
      html +=
        `<div class="quad-y-axis">` +
        `<span class="quad-axis-label">${escInline(yBin[0] ?? '')}</span>` +
        `<span class="quad-axis-label">${escInline(yBin[1] ?? '')}</span>` +
        `</div>`;
    } else {
      html +=
        `<div class="quad-y-axis-3">` +
        `<span class="quad-axis-label">高</span>` +
        `<span class="quad-axis-label" style="font-size:8px;opacity:.6">${escInline(yName)}</span>` +
        `<span class="quad-axis-label">低</span>` +
        `</div>`;
    }
  }
  html += `<div class="quad-main"><div class="quad-grid">`;
  cells.forEach((c) => {
    if (c.simple) {
      html +=
        `<div class="quad-cell" style="cursor:default">` +
        `<div class="quad-front" style="height:100%">` +
        `<div class="quad-back-text" style="font-size:11.5px;color:#4a4a4a;line-height:1.75">${escInline(c.name)}</div>` +
        `</div></div>`;
    } else {
      html +=
        `<div class="quad-cell" onclick="this.classList.toggle('flipped')">` +
        `<div class="quad-cell-inner">` +
        `<div class="quad-front">` +
        `<div class="quad-emoji">${escInline(c.emoji ?? '')}</div>` +
        `<div class="quad-name">${escInline(c.name)}</div>` +
        `<div class="quad-sub">${escInline(c.sub ?? '')}</div>` +
        `</div>` +
        (c.detail
          ? `<div class="quad-back">` +
            `<div class="quad-back-title">${escInline(c.name)}</div>` +
            `<div class="quad-back-text">${escInline(c.detail)}</div>` +
            `</div>`
          : '') +
        `</div></div>`;
    }
  });
  html += `</div>`;
  if (xAxis) {
    if (isBinary) {
      html +=
        `<div class="quad-x-axis">` +
        `<span class="quad-axis-label">${escInline(xBin[0] ?? '')}</span>` +
        `<span class="quad-axis-label">${escInline(xBin[1] ?? '')}</span>` +
        `</div>`;
    } else {
      html +=
        `<div class="quad-x-axis-3">` +
        `<span class="quad-axis-label" style="visibility:hidden">低</span>` +
        `<span class="quad-axis-label" style="font-size:8px;opacity:.6">${escInline(xName)}</span>` +
        `<span class="quad-axis-label">高</span>` +
        `</div>`;
    }
  }
  html += `</div></div>`;
  return html;
}

function renderBodyCard(item: string, accent: string, rgb: string): string {
  item = item.trim().replace(/[；;]\s*$/, '');
  const m = item.match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|S[1-4])([\s\S]*)/);
  if (!m) {
    return `<div style="font-size:12px;color:#6a6460;line-height:1.65">${escInline(item)}</div>`;
  }
  const num = m[1];
  let displayNum = NUM_MAP[num] ?? num;
  const rest = m[2].trim();
  let di = rest.indexOf('——');
  if (di < 0) {
    const cm = rest.match(/^([^：]+(?:）|》|\)))\s*：\s*/);
    if (cm) di = cm[0].length - 1;
  }
  let name: string;
  let desc: string;
  if (di >= 0 && rest.indexOf('——') === di) {
    name = rest.slice(0, di).trim();
    desc = rest.slice(di + 2).trim();
  } else if (di >= 0) {
    const cm2 = rest.match(/^([^：]+(?:）|》|\)))\s*：\s*/);
    name = cm2 ? cm2[1].trim() : rest;
    desc = cm2 ? rest.slice(cm2[0].length).trim() : '';
  } else {
    name = rest;
    desc = '';
  }
  const labelName = name.replace(/[（(].*/, '').replace(/[：:].*/, '').trim();
  const isLabel = LABEL_WORDS[labelName];
  if (isLabel) {
    displayNum = LABEL_SHORT[labelName] ?? labelName;
    name = '';
  }
  const numStyle = `background:rgba(${rgb},.1);border-color:rgba(${rgb},.25);color:${accent};${isLabel ? 'font-size:9px;min-width:28px;padding:0 4px' : ''}`;
  const descStyle = isLabel ? ' style="color:#3a3632;font-weight:400"' : '';
  return (
    `<div class="body-card" style="--accent:${accent}">` +
    `<span class="body-num" style="${numStyle}">${escInline(displayNum)}</span>` +
    `<div class="body-card-content">` +
    `<div class="body-item-name">${escInline(name)}</div>` +
    (desc ? `<div class="body-item-desc"${descStyle}>${escInline(desc)}</div>` : '') +
    `</div></div>`
  );
}

function renderGroupedBody(lead: string, items: string[], accent: string, rgb: string): string {
  const evalWords: Record<string, true> = {
    意义: true, 局限: true, 企业例: true, 应对: true, 应用: true, 比喻: true, 例子: true, 例: true,
    意義: true, 限界: true,
  };
  let html = `<div class="body-lead">${escInline(lead)}</div><div class="body-items">`;
  let inGroup = false;
  items.forEach((raw) => {
    const item = raw.trim();
    const gm = item.match(/^【(.+?)】$/);
    if (gm) {
      if (inGroup) html += '</div></div>';
      html +=
        `<div class="body-group">` +
        `<div class="body-group-title" onclick="this.parentElement.classList.toggle('open')">${escInline(gm[1])}</div>` +
        `<div class="body-group-items" style="border-color:rgba(${rgb},.15)">`;
      inGroup = true;
    } else {
      const em = item.match(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*([^：:——]+)/);
      let evalName = em ? em[1].replace(/[（(].*/, '').trim() : '';
      if (!evalName) {
        const dm = item.match(/^◆\s*([^：:——]+)/);
        evalName = dm ? dm[1].replace(/[（(].*/, '').trim() : '';
      }
      if (inGroup && evalWords[evalName]) {
        html += '</div></div>';
        inGroup = false;
      }
      let normalized = item;
      if (/^◆/.test(normalized)) {
        normalized = '①' + normalized.slice(1);
      }
      html += renderBodyCard(normalized, accent, rgb);
    }
  });
  if (inGroup) html += '</div></div>';
  html += '</div>';
  return html;
}

/**
 * Main entry point — 接受 body 字符串和已解析好的 hex accent 色（来自 tagColor()），
 * 返回结构化 HTML。
 *
 * accent 默认 '#8a7a6a'（warm taupe, fallback）。
 */
export function renderBody(body: string, accent: string = '#8a7a6a'): string {
  const rgb = hexRgb(accent);

  const quadMatch = body.match(/^([\s\S]*?)<quad>([\s\S]+)<\/quad>/);
  if (quadMatch) {
    return renderQuadChart(quadMatch[1].trim(), quadMatch[2].trim(), accent);
  }

  const cmpMatch = body.match(/^([\s\S]*?)<compare>([\s\S]+)<\/compare>([\s\S]*)/);
  if (cmpMatch) {
    let html = renderCompareCards(cmpMatch[1].trim(), cmpMatch[2].trim(), accent);
    const tail = cmpMatch[3]?.trim() ?? '';
    if (tail) {
      const tailItems = tail.split(/◆\s*/).filter((p) => p.trim());
      tailItems.forEach((item) => {
        html += renderBodyCard('①' + item.trim(), accent, rgb);
      });
    }
    return html;
  }

  let items: string[] = [];
  let lead = '';
  if (body.includes('<br>')) {
    const parts = body.split('<br>');
    lead = parts[0];
    items = parts.slice(1).filter((p) => p.trim());
    if (!items.length || !/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮【]|^S[1-4]/.test(items[0].trim())) {
      return escInline(body);
    }
  } else if (/◆/.test(body)) {
    const splitParts = body.split(/◆\s*/);
    lead = splitParts[0].replace(/[：:；，,]\s*$/, '');
    items = splitParts.slice(1).filter((p) => p.trim());
    if (items.length < 2) return escInline(body);
    items = items.map((it, idx) => CIRCLED[idx % CIRCLED.length] + it.replace(/[；;]\s*$/, ''));
  } else if (/[①②③]/.test(body)) {
    const splitParts = body.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])/);
    lead = splitParts[0].replace(/[：:；]\s*$/, '');
    items = splitParts.slice(1).filter((p) => p.trim());
    if (items.length < 2) return escInline(body);
    const last = items[items.length - 1];
    const lastPeriod = last.lastIndexOf('。');
    if (lastPeriod > 0 && lastPeriod < last.length - 1) {
      items[items.length - 1] = last.slice(0, lastPeriod + 1);
    }
  } else {
    return escInline(body);
  }

  const hasGroups = items.some((it) => /^【/.test(it.trim()));
  if (hasGroups) return renderGroupedBody(lead, items, accent, rgb);

  let html = `<div class="body-lead">${escInline(lead)}</div><div class="body-items">`;
  items.forEach((item) => {
    html += renderBodyCard(item, accent, rgb);
  });
  html += '</div>';
  return html;
}
