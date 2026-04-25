/**
 * Format-aware KP body editor (v0.4.8)
 *
 * 浏览器端组件：渲染 5 种 format 各自结构化表单。
 *   - mountBodyEditor(container, opts) → { getBody, getFormat, setData, destroy }
 *   - 内部双语状态（zh/ja 各 ParsedBody），切 lang 不丢另一份
 *   - 切 format 通过 changeFormat 序列化 + 重解析（lossy 但保 lead/eval）
 *   - onChange 回调收 (body, format)，编辑器外可用 renderBody 实时预览
 */

import {
  parseBody, serializeBody, changeFormat, emptyParsed,
  type Format, type ParsedBody, type Item, type Group, type CompareCol, type QuadCell,
} from './body-parser';

const FORMATS: Array<{ key: Format; label: string }> = [
  { key: 'narrative', label: '叙述' },
  { key: 'flat-list', label: '平铺' },
  { key: 'accordion', label: '手风琴' },
  { key: 'compare', label: '对比卡片' },
  { key: 'quad', label: '四象限' },
];

export interface BodyEditorOptions {
  /** 初始 format */
  initialFormat: Format;
  /** 初始中文 body */
  initialZhBody: string;
  /** 初始日文 body（可空） */
  initialJaBody: string;
  /** 内容/format 变化时回调（debounce 由调用方做） */
  onChange?: (zhBody: string, jaBody: string, format: Format) => void;
}

export interface BodyEditorAPI {
  getZhBody(): string;
  getJaBody(): string;
  getFormat(): Format;
  setLang(lang: 'zh' | 'ja'): void;
  destroy(): void;
}

export function mountBodyEditor(container: HTMLElement, opts: BodyEditorOptions): BodyEditorAPI {
  let format: Format = opts.initialFormat;
  let zhParsed: ParsedBody = parseBody(opts.initialZhBody, format);
  let jaParsed: ParsedBody = parseBody(opts.initialJaBody, format);
  let lang: 'zh' | 'ja' = 'zh';

  function fire() {
    opts.onChange?.(serializeBody(zhParsed), serializeBody(jaParsed), format);
  }

  function getCurrent(): ParsedBody {
    return lang === 'zh' ? zhParsed : jaParsed;
  }
  function setCurrent(p: ParsedBody) {
    if (lang === 'zh') zhParsed = p;
    else jaParsed = p;
    fire();
  }

  function render() {
    container.innerHTML = '';
    container.appendChild(buildFormatTabs(format, switchFormat));
    const langBar = el('div', 'flex items-center gap-2 mb-2');
    langBar.appendChild(buildLangTabs(lang, (l) => { lang = l; render(); }));
    container.appendChild(langBar);

    const formArea = el('div', 'space-y-3');
    container.appendChild(formArea);

    const cur = getCurrent();
    if (cur.format === 'narrative') renderNarrative(formArea, cur, setCurrent);
    else if (cur.format === 'flat-list') renderFlatList(formArea, cur, setCurrent);
    else if (cur.format === 'accordion') renderAccordion(formArea, cur, setCurrent);
    else if (cur.format === 'compare') renderCompare(formArea, cur, setCurrent);
    else if (cur.format === 'quad') renderQuad(formArea, cur, setCurrent);
  }

  function switchFormat(newF: Format) {
    if (newF === format) return;
    format = newF;
    zhParsed = changeFormat(zhParsed, newF);
    jaParsed = changeFormat(jaParsed, newF);
    fire();
    render();
  }

  render();
  fire(); // 初始一次

  return {
    getZhBody: () => serializeBody(zhParsed),
    getJaBody: () => serializeBody(jaParsed),
    getFormat: () => format,
    setLang: (l) => { lang = l; render(); },
    destroy: () => { container.innerHTML = ''; },
  };
}

// ============================================================
// DOM helpers
// ============================================================

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function input(opts: { value: string; placeholder?: string; onInput: (v: string) => void; cls?: string }): HTMLInputElement {
  const i = el('input');
  i.type = 'text';
  i.value = opts.value;
  if (opts.placeholder) i.placeholder = opts.placeholder;
  i.className = opts.cls ?? 'w-full px-2 py-1 rounded border text-sm';
  i.addEventListener('input', () => opts.onInput(i.value));
  return i;
}

function textarea(opts: { value: string; placeholder?: string; rows?: number; onInput: (v: string) => void; cls?: string }): HTMLTextAreaElement {
  const t = el('textarea');
  t.value = opts.value;
  if (opts.placeholder) t.placeholder = opts.placeholder;
  t.rows = opts.rows ?? 3;
  t.className = opts.cls ?? 'w-full px-2 py-1.5 rounded border text-sm leading-relaxed';
  t.addEventListener('input', () => opts.onInput(t.value));
  return t;
}

function button(text: string, onClick: () => void, cls = 'px-2 py-1 rounded border text-xs hover:bg-bg-tertiary'): HTMLButtonElement {
  const b = el('button');
  b.type = 'button';
  b.textContent = text;
  b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function deleteBtn(onClick: () => void): HTMLButtonElement {
  return button('×', onClick, 'shrink-0 w-7 h-7 rounded text-quaternary hover:text-accent-warning hover:bg-bg-tertiary text-base');
}

function buildFormatTabs(active: Format, onChange: (f: Format) => void): HTMLElement {
  const wrap = el('div', 'flex items-center gap-1 mb-3 border-b pb-2 flex-wrap');
  const lbl = el('span', 'text-xs text-quaternary mr-1');
  lbl.textContent = '格式';
  wrap.appendChild(lbl);
  FORMATS.forEach((f) => {
    const b = el('button');
    b.type = 'button';
    b.textContent = f.label;
    b.className = `px-3 py-1 text-xs rounded transition-colors ${
      f.key === active ? 'bg-accent-strategy text-white' : 'text-tertiary hover:bg-bg-tertiary'
    }`;
    b.addEventListener('click', () => onChange(f.key));
    wrap.appendChild(b);
  });
  return wrap;
}

function buildLangTabs(active: 'zh' | 'ja', onChange: (l: 'zh' | 'ja') => void): HTMLElement {
  const wrap = el('div', 'inline-flex border rounded overflow-hidden text-xs');
  (['zh', 'ja'] as const).forEach((l) => {
    const b = el('button');
    b.type = 'button';
    b.textContent = l === 'zh' ? '中' : '日';
    b.className = `px-3 py-1 ${l !== 'zh' ? 'border-l' : ''} ${l === active ? 'bg-accent-strategy text-white' : 'hover:bg-bg-tertiary'}`;
    b.addEventListener('click', () => onChange(l));
    wrap.appendChild(b);
  });
  return wrap;
}

function buildEvalSection(parsed: { meaning: string; limit: string }, onUpdate: (m: string, l: string) => void): HTMLElement {
  const wrap = el('section', 'border-t pt-3 mt-4 space-y-2');
  const lbl = el('div', 'text-xs text-quaternary');
  lbl.textContent = '评价（可选）';
  wrap.appendChild(lbl);

  const m = el('div');
  const mLbl = el('label', 'block text-xs text-tertiary mb-0.5');
  mLbl.textContent = '意义';
  m.appendChild(mLbl);
  m.appendChild(textarea({
    value: parsed.meaning, placeholder: '这个 KP 为什么重要', rows: 2,
    onInput: (v) => onUpdate(v, parsed.limit),
  }));
  wrap.appendChild(m);

  const l = el('div');
  const lLbl = el('label', 'block text-xs text-tertiary mb-0.5');
  lLbl.textContent = '局限';
  l.appendChild(lLbl);
  l.appendChild(textarea({
    value: parsed.limit, placeholder: '边界 / 不足', rows: 2,
    onInput: (v) => onUpdate(parsed.meaning, v),
  }));
  wrap.appendChild(l);
  return wrap;
}

// ============================================================
// Per-format renderers
// ============================================================

function renderNarrative(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'narrative' }>,
  setParsed: (p: ParsedBody) => void,
) {
  parent.appendChild(textarea({
    value: parsed.raw, rows: 14, placeholder: '原始文本（含 ◆ 评价、<br>【组】 等也可以）',
    cls: 'w-full px-3 py-2 rounded border text-sm font-mono leading-relaxed',
    onInput: (v) => setParsed({ format: 'narrative', raw: v }),
  }));
}

function renderFlatList(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'flat-list' }>,
  setParsed: (p: ParsedBody) => void,
) {
  const update = (patch: Partial<typeof parsed>) => setParsed({ ...parsed, ...patch });

  const leadSec = el('div');
  const leadLbl = el('label', 'block text-xs font-semibold text-tertiary mb-1');
  leadLbl.textContent = '导语';
  leadSec.appendChild(leadLbl);
  leadSec.appendChild(textarea({
    value: parsed.lead, rows: 2, placeholder: '一句话引入，会冒号分隔接条目',
    onInput: (v) => update({ lead: v }),
  }));
  parent.appendChild(leadSec);

  const itemsSec = el('div', 'space-y-2');
  const itemsLbl = el('label', 'block text-xs font-semibold text-tertiary');
  itemsLbl.textContent = `条目（${parsed.items.length}）`;
  itemsSec.appendChild(itemsLbl);
  parsed.items.forEach((it, i) => {
    const row = el('div', 'flex gap-2 items-start');
    const left = input({
      value: it.name, placeholder: '名称',
      cls: 'w-1/3 px-2 py-1.5 rounded border text-sm font-semibold',
      onInput: (v) => {
        const items = [...parsed.items];
        items[i] = { ...items[i], name: v };
        update({ items });
      },
    });
    const right = textarea({
      value: it.desc, placeholder: '说明', rows: 2,
      cls: 'flex-1 px-2 py-1.5 rounded border text-sm',
      onInput: (v) => {
        const items = [...parsed.items];
        items[i] = { ...items[i], desc: v };
        update({ items });
      },
    });
    row.appendChild(left); row.appendChild(right);
    row.appendChild(deleteBtn(() => {
      const items = parsed.items.filter((_, idx) => idx !== i);
      update({ items });
    }));
    itemsSec.appendChild(row);
  });
  itemsSec.appendChild(button('+ 添加条目', () => {
    update({ items: [...parsed.items, { name: '', desc: '' }] });
  }, 'w-full py-2 rounded border border-dashed text-xs text-tertiary hover:bg-bg-tertiary'));
  parent.appendChild(itemsSec);

  parent.appendChild(buildEvalSection(parsed, (m, l) => update({ meaning: m, limit: l })));
}

function renderAccordion(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'accordion' }>,
  setParsed: (p: ParsedBody) => void,
) {
  const update = (patch: Partial<typeof parsed>) => setParsed({ ...parsed, ...patch });

  const leadSec = el('div');
  const leadLbl = el('label', 'block text-xs font-semibold text-tertiary mb-1');
  leadLbl.textContent = '导语';
  leadSec.appendChild(leadLbl);
  leadSec.appendChild(textarea({
    value: parsed.lead, rows: 2, placeholder: '一句话引入，跟着各组',
    onInput: (v) => update({ lead: v }),
  }));
  parent.appendChild(leadSec);

  parsed.groups.forEach((g, gi) => {
    const groupBox = el('div', 'border rounded-md p-3 bg-bg-secondary space-y-2');
    const headRow = el('div', 'flex gap-2 items-center');
    headRow.appendChild(input({
      value: g.title, placeholder: '组标题（如「根本矛盾」）',
      cls: 'flex-1 px-2 py-1.5 rounded border text-sm font-semibold',
      onInput: (v) => {
        const groups = [...parsed.groups];
        groups[gi] = { ...groups[gi], title: v };
        update({ groups });
      },
    }));
    headRow.appendChild(deleteBtn(() => {
      update({ groups: parsed.groups.filter((_, i) => i !== gi) });
    }));
    groupBox.appendChild(headRow);

    g.items.forEach((it, ii) => {
      const row = el('div', 'flex gap-2 items-start');
      row.appendChild(input({
        value: it.name, placeholder: '条目名',
        cls: 'w-1/3 px-2 py-1.5 rounded border text-sm font-semibold',
        onInput: (v) => {
          const groups = [...parsed.groups];
          const items = [...groups[gi].items];
          items[ii] = { ...items[ii], name: v };
          groups[gi] = { ...groups[gi], items };
          update({ groups });
        },
      }));
      row.appendChild(textarea({
        value: it.desc, placeholder: '说明', rows: 2,
        cls: 'flex-1 px-2 py-1.5 rounded border text-sm',
        onInput: (v) => {
          const groups = [...parsed.groups];
          const items = [...groups[gi].items];
          items[ii] = { ...items[ii], desc: v };
          groups[gi] = { ...groups[gi], items };
          update({ groups });
        },
      }));
      row.appendChild(deleteBtn(() => {
        const groups = [...parsed.groups];
        groups[gi] = { ...groups[gi], items: g.items.filter((_, x) => x !== ii) };
        update({ groups });
      }));
      groupBox.appendChild(row);
    });
    groupBox.appendChild(button('+ 条目', () => {
      const groups = [...parsed.groups];
      groups[gi] = { ...groups[gi], items: [...g.items, { name: '', desc: '' }] };
      update({ groups });
    }, 'w-full py-1 rounded border border-dashed text-xs text-tertiary hover:bg-bg-primary'));
    parent.appendChild(groupBox);
  });

  parent.appendChild(button('+ 添加组', () => {
    update({ groups: [...parsed.groups, { title: '', items: [] }] });
  }, 'w-full py-2 rounded border border-dashed text-xs text-tertiary hover:bg-bg-tertiary'));

  parent.appendChild(buildEvalSection(parsed, (m, l) => update({ meaning: m, limit: l })));
}

function renderCompare(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'compare' }>,
  setParsed: (p: ParsedBody) => void,
) {
  const update = (patch: Partial<typeof parsed>) => setParsed({ ...parsed, ...patch });

  parent.appendChild(textareaSection('导语', parsed.lead, (v) => update({ lead: v })));

  parsed.cols.forEach((c, ci) => {
    const card = el('div', 'border rounded-md p-3 bg-bg-secondary space-y-2 relative');
    const head = el('div', 'flex items-center justify-between mb-1');
    const title = el('span', 'text-xs font-semibold text-tertiary');
    title.textContent = `卡片 ${ci + 1}`;
    head.appendChild(title);
    head.appendChild(deleteBtn(() => update({ cols: parsed.cols.filter((_, x) => x !== ci) })));
    card.appendChild(head);

    const FIELDS: Array<{ key: keyof CompareCol; label: string; ph: string }> = [
      { key: 'title', label: 'title', ph: '卡片标题' },
      { key: 'keyword', label: 'keyword', ph: '关键词（顶部小字）' },
      { key: 'desc', label: 'desc', ph: '描述（正面主体）' },
      { key: 'type', label: 'type', ph: '类型（背面副标题）' },
      { key: 'theories', label: 'theories', ph: '理论列表（逗号分隔）' },
      { key: 'detail', label: 'detail', ph: '详情（背面，留空则无翻面）' },
    ];
    FIELDS.forEach((f) => {
      const row = el('div');
      const lbl = el('label', 'block text-xs text-tertiary mb-0.5');
      lbl.textContent = f.label;
      row.appendChild(lbl);
      row.appendChild(input({
        value: c[f.key], placeholder: f.ph,
        onInput: (v) => {
          const cols = [...parsed.cols];
          cols[ci] = { ...cols[ci], [f.key]: v };
          update({ cols });
        },
      }));
      card.appendChild(row);
    });
    parent.appendChild(card);
  });

  parent.appendChild(button('+ 添加卡片', () => {
    update({ cols: [...parsed.cols, { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' }] });
  }, 'w-full py-2 rounded border border-dashed text-xs text-tertiary hover:bg-bg-tertiary'));

  parent.appendChild(buildEvalSection(parsed, (m, l) => update({ meaning: m, limit: l })));
}

function renderQuad(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'quad' }>,
  setParsed: (p: ParsedBody) => void,
) {
  const update = (patch: Partial<typeof parsed>) => setParsed({ ...parsed, ...patch });

  parent.appendChild(textareaSection('导语', parsed.lead, (v) => update({ lead: v })));

  const axes = el('div', 'grid grid-cols-2 gap-3');
  const yWrap = el('div');
  const yLbl = el('label', 'block text-xs text-tertiary mb-1'); yLbl.textContent = 'Y 轴（含 / 即 binary 模式）';
  yWrap.appendChild(yLbl);
  yWrap.appendChild(input({ value: parsed.yAxis, placeholder: '新/旧 或 重要度', onInput: (v) => update({ yAxis: v }) }));
  axes.appendChild(yWrap);
  const xWrap = el('div');
  const xLbl = el('label', 'block text-xs text-tertiary mb-1'); xLbl.textContent = 'X 轴';
  xWrap.appendChild(xLbl);
  xWrap.appendChild(input({ value: parsed.xAxis, placeholder: '东/西 或 紧急度', onInput: (v) => update({ xAxis: v }) }));
  axes.appendChild(xWrap);
  parent.appendChild(axes);

  // 4 cells (固定 4 个，渲染时不足补空)
  const padded = [...parsed.cells];
  while (padded.length < 4) padded.push({ name: '', emoji: '', sub: '', detail: '' });

  const grid = el('div', 'grid grid-cols-2 gap-3');
  ['左上', '右上', '左下', '右下'].forEach((pos, i) => {
    const card = el('div', 'border rounded-md p-3 bg-bg-secondary space-y-2');
    const head = el('span', 'text-xs font-semibold text-tertiary');
    head.textContent = `${pos}（cell ${i + 1}）`;
    card.appendChild(head);
    const FIELDS: Array<{ key: keyof QuadCell; ph: string }> = [
      { key: 'name', ph: '名称' },
      { key: 'emoji', ph: 'emoji（如 🔥）' },
      { key: 'sub', ph: '副标题' },
      { key: 'detail', ph: '详情（点击翻面，留空无翻面）' },
    ];
    FIELDS.forEach((f) => {
      card.appendChild(input({
        value: padded[i][f.key], placeholder: f.ph,
        onInput: (v) => {
          const cells = [...padded];
          cells[i] = { ...cells[i], [f.key]: v };
          update({ cells: cells.slice(0, 4) });
        },
      }));
    });
    grid.appendChild(card);
  });
  parent.appendChild(grid);

  parent.appendChild(buildEvalSection(parsed, (m, l) => update({ meaning: m, limit: l })));
}

function textareaSection(label: string, value: string, onInput: (v: string) => void): HTMLElement {
  const wrap = el('div');
  const lbl = el('label', 'block text-xs font-semibold text-tertiary mb-1');
  lbl.textContent = label;
  wrap.appendChild(lbl);
  wrap.appendChild(textarea({ value, rows: 2, placeholder: '一句话引入', onInput }));
  return wrap;
}
