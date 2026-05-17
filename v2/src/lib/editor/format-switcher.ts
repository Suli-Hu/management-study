/**
 * KP 编辑器 v0.8 — format 切换 + Q5 lead carry-over
 *
 * 职责：
 *   1. UI: format selector pill bar（在 body section header）
 *   2. 切 format 时弹 native <dialog> confirm（首次填 body 不弹）
 *   3. 抽出 lead-equivalent text（narrative.prose / 其它 .lead）灌入新 format
 *   4. 触发 store.setFormat(newFmt, carryLead)，store 自动 pad zh + ja
 *
 * F5 强制：UI 上 format selector 全局唯一，zh/ja 同步切。
 * 见 KP-EDITOR-V0.8-PRD.md §5.4 + §6.5。
 */

import { el, confirmDialog } from './dom-helpers';
import type { EditorStore, Format } from './state';
import { extractLead, emptyKpBodyByFormat } from './state';

const FORMAT_OPTIONS: Array<{ key: Format; label: string; hint: string }> = [
  { key: 'narrative', label: '叙事', hint: '一段 prose' },
  { key: 'flat-list', label: '条目', hint: 'lead + 多条 name/desc' },
  { key: 'accordion', label: '折叠', hint: '多组，每组多条' },
  { key: 'compare', label: '对比', hint: 'N 列 6 字段' },
  { key: 'quad', label: '四象限', hint: '2×2 + 4 cells' },
];

export const FORMAT_LABELS: Record<Format, string> = {
  narrative: '叙事',
  'flat-list': '条目',
  accordion: '折叠',
  compare: '对比',
  quad: '四象限',
};

interface FormatSwitcherOptions {
  store: EditorStore;
  /** 触发切换前 caller 决定是否需要 confirm（新建 + body 空 → false 不弹） */
  shouldConfirm?: () => boolean;
}

/** Render compact "切" button (for body section header). */
export function mountFormatChangeButton(host: HTMLElement, opts: FormatSwitcherOptions): void {
  const render = () => {
    host.innerHTML = '';
    const cur = opts.store.get().body.zh.format;
    const wrap = el('div', 'kpe-fmt-bar');
    const label = el('span', 'kpe-fmt-label');
    label.textContent = '当前格式';
    wrap.appendChild(label);
    const badge = el('span', 'kpe-fmt-badge');
    badge.textContent = FORMAT_LABELS[cur];
    wrap.appendChild(badge);
    const spacer = el('div', 'kpe-fmt-spacer');
    wrap.appendChild(spacer);

    // 切 popup — 用 <details> 简易实现
    const details = el('details', 'kpe-fmt-change');
    const summary = el('summary', 'kpe-fmt-change-btn');
    summary.textContent = '切 ▾';
    details.appendChild(summary);
    const pop = el('div', 'kpe-fmt-change-pop');
    FORMAT_OPTIONS.forEach((f) => {
      const item = el('button', 'kpe-fmt-change-item');
      item.type = 'button';
      const name = el('div', 'kpe-fmt-change-name');
      name.textContent = `${f.label}${f.key === cur ? ' ✓' : ''}`;
      item.appendChild(name);
      const hint = el('div', 'kpe-fmt-change-hint');
      hint.textContent = f.hint;
      item.appendChild(hint);
      if (f.key === cur) item.classList.add('is-on');
      item.addEventListener('click', () => {
        details.removeAttribute('open');
        if (f.key === cur) return;
        triggerSwitch(f.key, opts);
      });
      pop.appendChild(item);
    });
    details.appendChild(pop);
    wrap.appendChild(details);
    host.appendChild(wrap);
  };

  render();
  opts.store.subscribe(render);
}

function triggerSwitch(newFmt: Format, opts: FormatSwitcherOptions): void {
  const state = opts.store.get();
  const cur = state.body.zh.format;
  const carryLead = extractLead(state.body.zh);

  // 是否需要 confirm
  const should =
    opts.shouldConfirm?.() ??
    (bodyHasContent(state.body.zh) ||
      (state.body.ja !== null && bodyHasContent(state.body.ja)));

  const apply = () => opts.store.setFormat(newFmt, carryLead);

  if (!should) {
    apply();
    return;
  }

  confirmDialog({
    title: '切换格式',
    description: `当前格式 "${FORMAT_LABELS[cur]}" 的内容（条目 / 列 / cells / 分组）将被清空。导语 lead 会保留为新格式的导语。`,
    note: '评价（义/限/例/应/用/喻）不受影响。',
    confirmText: `切换到 "${FORMAT_LABELS[newFmt]}"`,
    cancelText: '取消',
    onResolve: (action) => {
      if (action === 'confirm') apply();
    },
  });
}

/** body 是否含用户输入（lead/prose / items / cells / cols / groups 任一非空）。 */
function bodyHasContent(body: import('~/schemas/kp-body-structured').KpBody): boolean {
  if (body.format === 'narrative') return body.prose.trim().length > 0;
  if (body.lead.trim().length > 0) return true;
  if (body.format === 'flat-list')
    return body.items.some((it) => it.name.trim() || it.desc.trim());
  if (body.format === 'accordion')
    return body.groups.some((g) => g.title.trim() || g.items.some((it) => it.name.trim() || it.desc.trim()));
  if (body.format === 'compare') {
    // v0.11.82: 检查 legacy cols + 新 headers/rows 任一有内容
    if ((body.cols ?? []).some((c) => c.title.trim() || c.keyword.trim() || c.desc.trim() || c.type.trim() || c.theories.trim() || c.detail.trim())) {
      return true;
    }
    return (body.headers ?? []).some((h) => h.trim()) || (body.rows ?? []).some((r) => r.label.trim() || r.cells.some((cell) => cell.trim()));
  }
  if (body.format === 'quad')
    return (
      axisHasContent(body.yAxis) ||
      axisHasContent(body.xAxis) ||
      body.cells.some((c) => c.name.trim() || c.detail.trim() || c.sub.trim() || c.emoji.trim())
    );
  return false;
}

function axisHasContent(axis: import('~/schemas/kp-body-structured').QuadAxis): boolean {
  return axis.low.trim().length > 0 || axis.label.trim().length > 0 || axis.high.trim().length > 0;
}

// Re-export for tests
export { bodyHasContent, emptyKpBodyByFormat };
