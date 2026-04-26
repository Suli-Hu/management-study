/**
 * body-editor-client.ts — KP body 5 种 format 结构化编辑器（v0.5.2 设计稿对齐）
 *
 * 公开 API（保持向后兼容 edit.astro / new.astro）：
 *   mountBodyEditor(container, opts) → { getZhBody, getJaBody, getFormat, setLang, destroy }
 *
 * 内部组合：
 *   [.kpedit-fmt-bar] 当前格式 + 更改菜单 + 中/日 segmented + 从中文复制
 *   [editor area] 按 format + lang 渲染对应结构化 form
 *
 * 与 v0.4.x 旧版区别（v0.5.1+ OptionC）：
 *   - 不再嵌入 EvalSection（评价已独立到 OptionC sec-tags）
 *   - 用 .kpedit-fmt-* / .kpedit-cmp-* / .kpedit-langseg 类（替代 Tailwind utility）
 *   - 同时维护 zhParsed / jaParsed 两份 ParsedBody，切 lang 不丢另一份
 */

import {
  parseBody, serializeBody, changeFormat,
  type Format, type ParsedBody, type CompareCol, type QuadCell,
} from './body-parser';

const FORMATS: Array<{ key: Format; label: string; hint: string }> = [
  { key: 'narrative', label: '叙述',     hint: '一段连续的散文' },
  { key: 'flat-list', label: '条目列表', hint: '◆ 分隔的条目，每项 name——desc 或纯 desc' },
  { key: 'accordion', label: '折叠分节', hint: '【组名】分节，每节 N 条 label——content 配对' },
  { key: 'compare',   label: '对比卡片', hint: 'N 张并排卡，每张 6 字段（标题/关键词/描述/类型/理论/详情）' },
  { key: 'quad',      label: '四象限',   hint: '2×2 矩阵，X/Y 轴 + 4 个 cell' },
];

export interface BodyEditorOptions {
  initialFormat: Format;
  initialZhBody: string;
  initialJaBody: string;
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
  function switchFormat(newF: Format) {
    if (newF === format) return;
    format = newF;
    zhParsed = changeFormat(zhParsed, newF);
    jaParsed = changeFormat(jaParsed, newF);
    fire();
    render();
  }

  function render() {
    container.innerHTML = '';
    container.appendChild(buildFormatBar(format, getCurrent, switchFormat, lang, (l) => {
      lang = l;
      render();
    }, copyZhToJa));
    const formArea = el('div', 'kpedit-fmt-editor');
    container.appendChild(formArea);

    const cur = getCurrent();
    if (cur.format === 'narrative')      renderNarrative(formArea, cur, setCurrent);
    else if (cur.format === 'flat-list') renderFlatList(formArea, cur, setCurrent);
    else if (cur.format === 'accordion') renderAccordion(formArea, cur, setCurrent);
    else if (cur.format === 'compare')   renderCompare(formArea, cur, setCurrent);
    else if (cur.format === 'quad')      renderQuad(formArea, cur, setCurrent);
  }

  function copyZhToJa() {
    if (lang !== 'ja') return;
    if (!confirm('从中文复制 body？\n\n这会覆盖当前日文编辑内容。')) return;
    jaParsed = parseBody(serializeBody(zhParsed), format);
    fire();
    render();
  }

  render();
  fire();

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
  i.className = opts.cls ?? 'kpedit-input';
  i.addEventListener('input', () => opts.onInput(i.value));
  return i;
}

function textarea(opts: { value: string; placeholder?: string; rows?: number; onInput: (v: string) => void; cls?: string }): HTMLTextAreaElement {
  const t = el('textarea');
  t.value = opts.value;
  if (opts.placeholder) t.placeholder = opts.placeholder;
  t.rows = opts.rows ?? 2;
  t.className = opts.cls ?? 'kpedit-input';
  t.addEventListener('input', () => opts.onInput(t.value));
  return t;
}

function deleteX(onClick: () => void): HTMLButtonElement {
  const b = el('button', 'kpedit-fmt-x');
  b.type = 'button';
  b.textContent = '×';
  b.setAttribute('aria-label', '删除');
  b.addEventListener('click', onClick);
  return b;
}

function addBtn(text: string, onClick: () => void, block = false): HTMLButtonElement {
  const b = el('button', `kpedit-fmt-add${block ? ' is-block' : ''}`);
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function fmtBlock(label: string, child: HTMLElement): HTMLElement {
  const w = el('div', 'kpedit-fmt-block');
  const lbl = el('label', 'kpedit-fmt-blabel');
  lbl.textContent = label;
  w.appendChild(lbl);
  w.appendChild(child);
  return w;
}


// ============================================================
// Format bar (top of editor)
// ============================================================

function countContent(p: ParsedBody): number {
  if (p.format === 'narrative') return p.raw.trim().length > 0 ? 1 : 0;
  if (p.format === 'flat-list') return p.items.length;
  if (p.format === 'accordion') return p.groups.reduce((s, g) => s + g.items.length, 0);
  if (p.format === 'compare') return p.cols.length;
  if (p.format === 'quad') return p.cells.filter((c) => c.name || c.detail).length;
  return 0;
}
function previewLossy(parsed: ParsedBody, target: Format): { hint: string; lossy: boolean } {
  if (parsed.format === target) return { hint: '当前格式', lossy: false };
  const before = countContent(parsed);
  if (before === 0) return { hint: '当前空，可安全切换', lossy: false };
  if (target === 'narrative') return { hint: '保为原始文本（无损）', lossy: false };
  if (parsed.format === 'narrative') return { hint: '将按新结构重新填写', lossy: false };
  return { hint: `将丢失 ${before} 项结构内容（lead 保留）`, lossy: true };
}

function buildFormatBar(
  active: Format,
  getCurrent: () => ParsedBody,
  onFormat: (f: Format) => void,
  lang: 'zh' | 'ja',
  onLang: (l: 'zh' | 'ja') => void,
  onCopyZh: () => void,
): HTMLElement {
  const bar = el('div', 'kpedit-fmt-bar');
  const fmtMeta = FORMATS.find((f) => f.key === active);

  // Left: current format display
  const leftSpan = el('span', 'kpedit-fmt-bar-l');
  leftSpan.innerHTML = `当前格式：<strong>${fmtMeta?.label ?? active} (${active})</strong>`;
  bar.appendChild(leftSpan);

  // Change menu (<details>)
  const changeDetails = el('details', 'kpedit-fmt-change');
  const summary = el('summary');
  summary.textContent = '更改 ▾';
  changeDetails.appendChild(summary);
  const pop = el('div', 'kpedit-fmt-change-pop');
  FORMATS.forEach((f) => {
    const row = el('button');
    row.type = 'button';
    row.className = `block w-full text-left px-3 py-2 text-sm hover:bg-bg-secondary ${f.key === active ? 'bg-bg-tertiary' : ''}`;
    const preview = previewLossy(getCurrent(), f.key);
    row.innerHTML = `
      <div style="font-weight:600">${f.label}${f.key === active ? ' ✓' : ''}</div>
      <div style="font-size:11px;color:var(--color-text-quaternary);margin-top:2px">${f.hint}</div>
      <div style="font-size:11px;margin-top:2px;color:${preview.lossy ? 'var(--accent-warning)' : 'var(--color-text-quaternary)'}">${preview.hint}</div>
    `;
    row.addEventListener('click', () => {
      if (f.key === active) { changeDetails.removeAttribute('open'); return; }
      if (preview.lossy && !confirm(`切换到「${f.label}」：\n${preview.hint}\n\n继续？`)) return;
      changeDetails.removeAttribute('open');
      onFormat(f.key);
    });
    pop.appendChild(row);
  });
  changeDetails.appendChild(pop);
  bar.appendChild(changeDetails);

  bar.appendChild(el('div', 'kpedit-fmt-bar-spacer'));

  // Lang segmented
  const langSeg = el('div', 'kpedit-langseg');
  (['zh', 'ja'] as const).forEach((l) => {
    const b = el('button', `kpedit-langseg-b${l === lang ? ' is-on' : ''}`);
    b.type = 'button';
    b.textContent = l === 'zh' ? '中' : '日';
    // Dot if other lang has content (visual hint that the other side is non-empty)
    const otherHas = (() => {
      const other = l === 'zh' ? getCurrent() : getCurrent(); // best-effort; full check happens in render-time check below
      return false; // implementation: parent re-renders bar per render, dot computed from outside scope omitted for simplicity
    })();
    if (otherHas) {
      const dot = el('span', 'kpedit-langseg-dot');
      b.appendChild(dot);
    }
    b.addEventListener('click', () => onLang(l));
    langSeg.appendChild(b);
  });
  bar.appendChild(langSeg);

  // 从中文复制 button (only show in ja mode)
  if (lang === 'ja') {
    const copyBtn = el('button', 'kpedit-fmt-add');
    copyBtn.type = 'button';
    copyBtn.textContent = '从中文复制';
    copyBtn.style.padding = '4px 10px';
    copyBtn.style.fontSize = '11.5px';
    copyBtn.addEventListener('click', onCopyZh);
    bar.appendChild(copyBtn);
  }

  // Format hint (small italic to far right)
  if (fmtMeta?.hint) {
    const hint = el('span', 'kpedit-fmt-hint');
    hint.textContent = fmtMeta.hint;
    hint.style.maxWidth = '320px';
    hint.style.overflow = 'hidden';
    hint.style.textOverflow = 'ellipsis';
    hint.style.whiteSpace = 'nowrap';
    bar.appendChild(hint);
  }

  return bar;
}


// ============================================================
// 5 Editors
// ============================================================

function renderNarrative(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'narrative' }>,
  setParsed: (p: ParsedBody) => void,
) {
  parent.appendChild(textarea({
    value: parsed.raw,
    rows: 14,
    placeholder: '原始文本（含 <strong>、<em>、<br> 标签也可以）',
    cls: 'kpedit-input is-textarea',
    onInput: (v) => setParsed({ format: 'narrative', raw: v }),
  }));
}

function renderFlatList(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'flat-list' }>,
  setParsed: (p: ParsedBody) => void,
) {
  const update = (patch: Partial<typeof parsed>) => setParsed({ ...parsed, ...patch });

  // 导语
  parent.appendChild(fmtBlock('导语', textarea({
    value: parsed.lead, rows: 2, placeholder: '一句话引出，可空',
    onInput: (v) => update({ lead: v }),
  })));

  // 条目
  const itemsBlock = el('div', 'kpedit-fmt-block');
  const itemsLbl = el('label', 'kpedit-fmt-blabel');
  itemsLbl.textContent = `条目（${parsed.items.length}）`;
  itemsBlock.appendChild(itemsLbl);
  const list = el('div', 'kpedit-fmt-items');
  parsed.items.forEach((it, i) => {
    const row = el('div', 'kpedit-fmt-item');
    const bullet = el('span', 'kpedit-fmt-bullet');
    bullet.textContent = '◆';
    row.appendChild(bullet);
    const wrap = el('div', 'flex-1 grid grid-cols-3 gap-2');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '1fr 2fr';
    wrap.style.gap = '6px';
    wrap.style.flex = '1';
    wrap.appendChild(input({
      value: it.name, placeholder: '名称（可空）',
      cls: 'kpedit-input',
      onInput: (v) => {
        const items = [...parsed.items];
        items[i] = { ...items[i], name: v };
        update({ items });
      },
    }));
    wrap.appendChild(textarea({
      value: it.desc, placeholder: '描述（必填）', rows: 2,
      cls: 'kpedit-input',
      onInput: (v) => {
        const items = [...parsed.items];
        items[i] = { ...items[i], desc: v };
        update({ items });
      },
    }));
    row.appendChild(wrap);
    row.appendChild(deleteX(() => update({ items: parsed.items.filter((_, idx) => idx !== i) })));
    list.appendChild(row);
  });
  list.appendChild(addBtn('+ 添加条目', () => update({ items: [...parsed.items, { name: '', desc: '' }] })));
  itemsBlock.appendChild(list);
  parent.appendChild(itemsBlock);
}

function renderAccordion(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'accordion' }>,
  setParsed: (p: ParsedBody) => void,
) {
  const update = (patch: Partial<typeof parsed>) => setParsed({ ...parsed, ...patch });

  parent.appendChild(fmtBlock('导语', textarea({
    value: parsed.lead, rows: 2, placeholder: '总论 / 串场（可空）',
    onInput: (v) => update({ lead: v }),
  })));

  parsed.groups.forEach((g, gi) => {
    const groupBox = el('div', 'kpedit-fmt-group');
    const groupH = el('div', 'kpedit-fmt-grouph');
    groupH.appendChild(input({
      value: g.title, placeholder: '分组名（如「根本矛盾」）',
      cls: 'kpedit-input is-group-name',
      onInput: (v) => {
        const groups = [...parsed.groups];
        groups[gi] = { ...groups[gi], title: v };
        update({ groups });
      },
    }));
    groupH.appendChild(deleteX(() => update({ groups: parsed.groups.filter((_, x) => x !== gi) })));
    groupBox.appendChild(groupH);

    g.items.forEach((it, ii) => {
      const pair = el('div', 'kpedit-fmt-pair');
      pair.appendChild(input({
        value: it.name, placeholder: '标签（可空）',
        cls: 'kpedit-input is-pair-label',
        onInput: (v) => {
          const groups = [...parsed.groups];
          const items = [...groups[gi].items];
          items[ii] = { ...items[ii], name: v };
          groups[gi] = { ...groups[gi], items };
          update({ groups });
        },
      }));
      pair.appendChild(textarea({
        value: it.desc, placeholder: '内容', rows: 2,
        cls: 'kpedit-input',
        onInput: (v) => {
          const groups = [...parsed.groups];
          const items = [...groups[gi].items];
          items[ii] = { ...items[ii], desc: v };
          groups[gi] = { ...groups[gi], items };
          update({ groups });
        },
      }));
      pair.appendChild(deleteX(() => {
        const groups = [...parsed.groups];
        groups[gi] = { ...groups[gi], items: g.items.filter((_, x) => x !== ii) };
        update({ groups });
      }));
      groupBox.appendChild(pair);
    });
    groupBox.appendChild(addBtn('+ 条目', () => {
      const groups = [...parsed.groups];
      groups[gi] = { ...groups[gi], items: [...g.items, { name: '', desc: '' }] };
      update({ groups });
    }));
    parent.appendChild(groupBox);
  });

  parent.appendChild(addBtn('+ 添加分组', () => {
    update({ groups: [...parsed.groups, { title: '', items: [{ name: '', desc: '' }] }] });
  }, true));
}

function renderCompare(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'compare' }>,
  setParsed: (p: ParsedBody) => void,
) {
  const update = (patch: Partial<typeof parsed>) => setParsed({ ...parsed, ...patch });

  parent.appendChild(fmtBlock('导语', textarea({
    value: parsed.lead, rows: 2, placeholder: '对对比关系的引言（可空）',
    onInput: (v) => update({ lead: v }),
  })));

  const colsBlock = el('div', 'kpedit-fmt-block');
  const colsLbl = el('label', 'kpedit-fmt-blabel');
  colsLbl.textContent = '对比卡片（每张卡是一列）';
  colsBlock.appendChild(colsLbl);

  const cols = el('div', 'kpedit-cmp-cols');
  parsed.cols.forEach((col, ci) => {
    const card = el('div', 'kpedit-cmp-col');
    const colH = el('div', 'kpedit-cmp-colh');
    const num = el('span', 'kpedit-cmp-num');
    num.textContent = String(ci + 1);
    colH.appendChild(num);
    colH.appendChild(input({
      value: col.title, placeholder: '标题',
      cls: 'kpedit-input is-cmp-title',
      onInput: (v) => {
        const cs = [...parsed.cols];
        cs[ci] = { ...cs[ci], title: v };
        update({ cols: cs });
      },
    }));
    colH.appendChild(deleteX(() => update({ cols: parsed.cols.filter((_, x) => x !== ci) })));
    card.appendChild(colH);

    const fields = el('div', 'kpedit-cmp-fields');
    const FIELDS: Array<{ key: keyof CompareCol; label: string; ph: string; multiline?: boolean }> = [
      { key: 'keyword',  label: '关键词',     ph: 'What / How / Why' },
      { key: 'desc',     label: '描述',       ph: '一句话说明' },
      { key: 'type',     label: '类型',       ph: '如：内容理论' },
      { key: 'theories', label: '理论 (逗号分隔)', ph: "Maslow '43, Herzberg '59" },
      { key: 'detail',   label: '详情（背面）', ph: '点击翻转后显示的详细文字', multiline: true },
    ];
    FIELDS.forEach((f) => {
      const fb = el('div', 'kpedit-cmp-field');
      const lbl = el('label', 'kpedit-cmp-flabel');
      lbl.textContent = f.label;
      fb.appendChild(lbl);
      const onIn = (v: string) => {
        const cs = [...parsed.cols];
        cs[ci] = { ...cs[ci], [f.key]: v };
        update({ cols: cs });
      };
      fb.appendChild(f.multiline
        ? textarea({ value: col[f.key], placeholder: f.ph, rows: 2, onInput: onIn })
        : input({ value: col[f.key], placeholder: f.ph, onInput: onIn }));
      fields.appendChild(fb);
    });
    card.appendChild(fields);
    cols.appendChild(card);
  });
  colsBlock.appendChild(cols);
  colsBlock.appendChild(addBtn('+ 添加对比列', () => {
    update({ cols: [...parsed.cols, { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' }] });
  }));
  parent.appendChild(colsBlock);
}

function renderQuad(
  parent: HTMLElement,
  parsed: Extract<ParsedBody, { format: 'quad' }>,
  setParsed: (p: ParsedBody) => void,
) {
  const update = (patch: Partial<typeof parsed>) => setParsed({ ...parsed, ...patch });

  parent.appendChild(fmtBlock('导语', textarea({
    value: parsed.lead, rows: 2, placeholder: '对四象限的引言（可空）',
    onInput: (v) => update({ lead: v }),
  })));

  // X / Y axis labels
  const axes = el('div', 'kpedit-fmt-row');
  axes.style.display = 'grid';
  axes.style.gridTemplateColumns = '1fr 1fr';
  axes.style.gap = '8px';
  axes.appendChild(fmtBlock('X 轴标签', input({
    value: parsed.xAxis, placeholder: '如：紧急度',
    onInput: (v) => update({ xAxis: v }),
  })));
  axes.appendChild(fmtBlock('Y 轴标签', input({
    value: parsed.yAxis, placeholder: '如：重要度',
    onInput: (v) => update({ yAxis: v }),
  })));
  parent.appendChild(axes);

  // 4 cells (固定 4，渲染时不足补空)
  const padded: QuadCell[] = [...parsed.cells];
  while (padded.length < 4) padded.push({ name: '', emoji: '', sub: '', detail: '' });

  const cellsBlock = el('div', 'kpedit-fmt-block');
  const cellsLbl = el('label', 'kpedit-fmt-blabel');
  cellsLbl.textContent = '四象限 cell（左上 / 右上 / 左下 / 右下）';
  cellsBlock.appendChild(cellsLbl);

  const grid = el('div', 'kpedit-fmt-quad');
  ['左上', '右上', '左下', '右下'].forEach((pos, i) => {
    const cell = el('div', 'kpedit-fmt-cell');

    // header row: emoji + name
    const cellH = el('div', 'kpedit-fmt-cell-h');
    cellH.appendChild(input({
      value: padded[i].emoji, placeholder: '🎯',
      cls: 'kpedit-input is-icon',
      onInput: (v) => {
        const cells = [...padded];
        cells[i] = { ...cells[i], emoji: v };
        update({ cells: cells.slice(0, 4) });
      },
    }));
    cellH.appendChild(input({
      value: padded[i].name, placeholder: `${pos} 象限名`,
      cls: 'kpedit-input',
      onInput: (v) => {
        const cells = [...padded];
        cells[i] = { ...cells[i], name: v };
        update({ cells: cells.slice(0, 4) });
      },
    }));
    cell.appendChild(cellH);

    // tag (sub)
    cell.appendChild(input({
      value: padded[i].sub, placeholder: '标签（小字）',
      cls: 'kpedit-input',
      onInput: (v) => {
        const cells = [...padded];
        cells[i] = { ...cells[i], sub: v };
        update({ cells: cells.slice(0, 4) });
      },
    }));

    // desc (detail)
    cell.appendChild(textarea({
      value: padded[i].detail, placeholder: '描述', rows: 3,
      cls: 'kpedit-input',
      onInput: (v) => {
        const cells = [...padded];
        cells[i] = { ...cells[i], detail: v };
        update({ cells: cells.slice(0, 4) });
      },
    }));
    grid.appendChild(cell);
  });
  cellsBlock.appendChild(grid);
  parent.appendChild(cellsBlock);
}
