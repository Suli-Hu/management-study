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
  parseBody, serializeBody, changeFormat, emptyParsed, EVAL_DEFS,
  type Format, type ParsedBody, type Item, type Group, type CompareCol, type QuadCell, type Evaluations,
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

    // v0.4.12 PM 方案 B：format 锁定 + 角落「更改」入口（不再 5 tab 平铺）
    const headerBar = el('div', 'flex items-center justify-between gap-2 mb-3 pb-2 border-b flex-wrap');
    headerBar.appendChild(buildFormatHeader(format, getCurrent, switchFormat));
    headerBar.appendChild(buildLangTabs(lang, (l) => { lang = l; render(); }));
    container.appendChild(headerBar);

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

/** 计算当前 parsed 在某 format 下的「内容容量」，用于切换提示损失程度。 */
function countContent(p: ParsedBody): number {
  if (p.format === 'narrative') return p.raw.trim().length > 0 ? 1 : 0;
  if (p.format === 'flat-list') return p.items.length;
  if (p.format === 'accordion') return p.groups.reduce((s, g) => s + g.items.length, 0);
  if (p.format === 'compare') return p.cols.length;
  if (p.format === 'quad') return p.cells.filter((c) => c.name || c.detail).length;
  return 0;
}

function previewFormatChange(parsed: ParsedBody, target: Format): { hint: string; lossy: boolean } {
  if (parsed.format === target) return { hint: '当前格式', lossy: false };
  const before = countContent(parsed);
  if (before === 0) return { hint: '当前空，可安全切换', lossy: false };
  // 同质转换无损：narrative 到任何（lead 留），任何到 narrative（保 raw）
  if (target === 'narrative') return { hint: '保为原始文本（无损）', lossy: false };
  if (parsed.format === 'narrative') return { hint: '将按新结构重新填写', lossy: false };
  // 其它跨结构 = lossy（除 accordion ⟷ flat-list 也丢，因结构不同）
  return { hint: `将丢失 ${before} 项结构内容（lead/eval 保留）`, lossy: true };
}

function buildFormatHeader(
  active: Format,
  getCurrent: () => ParsedBody,
  onChange: (f: Format) => void,
): HTMLElement {
  const wrap = el('div', 'flex items-center gap-2');
  const lbl = el('span', 'text-xs text-quaternary');
  lbl.textContent = '当前格式：';
  wrap.appendChild(lbl);
  const value = el('span', 'text-sm font-semibold text-primary');
  value.textContent = FORMATS.find((f) => f.key === active)?.label ?? active;
  wrap.appendChild(value);
  const changeBtn = el('button');
  changeBtn.type = 'button';
  changeBtn.textContent = '更改 ▾';
  changeBtn.className = 'ml-1 px-2 py-0.5 text-xs rounded border text-tertiary hover:bg-bg-tertiary';
  let closeMenu: (() => void) | null = null;
  changeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (closeMenu) { closeMenu(); closeMenu = null; return; }
    closeMenu = openFormatMenu(changeBtn, active, getCurrent(), (f) => {
      closeMenu = null;
      onChange(f);
    });
  });
  wrap.appendChild(changeBtn);
  return wrap;
}

function openFormatMenu(
  anchor: HTMLElement,
  currentFormat: Format,
  currentParsed: ParsedBody,
  onPick: (f: Format) => void,
): () => void {
  const menu = el('div', 'fixed z-30 w-72 max-w-[90vw] border rounded-md bg-bg-primary shadow-card overflow-hidden');
  FORMATS.forEach((f, idx) => {
    const row = el('button');
    row.type = 'button';
    row.className = `block w-full text-left px-3 py-2 hover:bg-bg-tertiary ${idx < FORMATS.length - 1 ? 'border-b' : ''} ${
      f.key === currentFormat ? 'bg-bg-secondary' : ''
    }`;
    const head = el('div', 'flex items-center gap-2');
    const name = el('span', 'text-sm font-semibold');
    name.textContent = f.label;
    head.appendChild(name);
    if (f.key === currentFormat) {
      const cur = el('span', 'text-xs text-accent-strategy');
      cur.textContent = '✓ 当前';
      head.appendChild(cur);
    }
    row.appendChild(head);
    const preview = previewFormatChange(currentParsed, f.key);
    const hint = el('div', `text-xs mt-0.5 ${preview.lossy ? 'text-accent-warning' : 'text-quaternary'}`);
    hint.textContent = preview.hint;
    row.appendChild(hint);
    row.addEventListener('click', () => {
      if (f.key === currentFormat) { close(); return; }
      if (preview.lossy && !confirm(`切换到「${f.label}」：\n${preview.hint}\n\n继续？`)) return;
      onPick(f.key);
      close();
    });
    menu.appendChild(row);
  });

  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);

  function close() {
    menu.remove();
    document.removeEventListener('click', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onOutside(e: MouseEvent) {
    if (menu.contains(e.target as Node) || anchor.contains(e.target as Node)) return;
    close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
  setTimeout(() => {
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
  return close;
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

interface EvalPlaceholders { [k: string]: string }
const EVAL_PLACEHOLDERS: EvalPlaceholders = {
  meaning: '学术贡献 / 实务价值（论述题必答）',
  limit: '不足 / 边界 / 被批判（论述题必答）',
  example: '企业案例 / 历史事例',
  response: '面对相关问题，这理论建议怎么办',
  application: '实务场景下的具体用法',
  analogy: '帮自己记忆的比喻 / 类比',
};

function buildEvalSection(
  parsed: Evaluations,
  onUpdate: (key: keyof Evaluations, value: string) => void,
): HTMLElement {
  const wrap = el('section', 'border-t pt-4 mt-4 space-y-3');
  const head = el('div', 'flex items-baseline gap-2');
  const lbl = el('span', 'text-xs font-semibold text-tertiary');
  lbl.textContent = '评价标签（论述题答题骨架，简单概念可全空）';
  head.appendChild(lbl);
  wrap.appendChild(head);

  EVAL_DEFS.forEach((def) => {
    const row = el('div', 'flex gap-2 items-start');
    const tag = el('span',
      'shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-xs font-semibold border bg-bg-secondary text-tertiary mt-1.5'
    );
    tag.textContent = def.short;
    tag.title = def.zhFull;
    row.appendChild(tag);
    const label = el('label', 'shrink-0 text-xs text-tertiary mt-2 w-12');
    label.textContent = def.zhFull;
    row.appendChild(label);
    row.appendChild(textarea({
      value: parsed[def.key],
      placeholder: EVAL_PLACEHOLDERS[def.key] ?? '',
      rows: 2,
      cls: 'flex-1 px-2 py-1.5 rounded border text-sm leading-relaxed',
      onInput: (v) => onUpdate(def.key, v),
    }));
    wrap.appendChild(row);
  });
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

  parent.appendChild(buildEvalSection(parsed, (key, value) => update({ [key]: value } as Partial<typeof parsed>)));
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

  parent.appendChild(buildEvalSection(parsed, (key, value) => update({ [key]: value } as Partial<typeof parsed>)));
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

  parent.appendChild(buildEvalSection(parsed, (key, value) => update({ [key]: value } as Partial<typeof parsed>)));
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

  parent.appendChild(buildEvalSection(parsed, (key, value) => update({ [key]: value } as Partial<typeof parsed>)));
}

function textareaSection(label: string, value: string, onInput: (v: string) => void): HTMLElement {
  const wrap = el('div');
  const lbl = el('label', 'block text-xs font-semibold text-tertiary mb-1');
  lbl.textContent = label;
  wrap.appendChild(lbl);
  wrap.appendChild(textarea({ value, rows: 2, placeholder: '一句话引入', onInput }));
  return wrap;
}
