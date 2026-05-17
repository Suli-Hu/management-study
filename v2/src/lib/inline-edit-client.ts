/**
 * v0.11.71 KP 内联编辑 phase 2a — title.zh + 5 format body.zh + evaluations.zh
 *
 * 范围（用户拍板）：
 *   - title.zh（编辑 h2 → input）
 *   - body.zh 全 5 format（narrative / flat-list / accordion / compare / quad）
 *   - evaluations.zh（6 字段 meaning/limit/example/response/application/analogy）
 *
 * 留 phase 2b：ja 字段、schools/scholars/tags/year、format 切换
 *
 * 约束（不变）：
 *   - desktop only (>=1024px)
 *   - canEdit + !locked_at
 *   - explicit「保存」按钮
 *   - 切 KP / 离页前 alert 确认 unsaved
 *   - /[discipline]/kp/:id/edit 全屏页保留 fallback（编辑 ja / 切 format 用）
 */

import type { KpBody, KpEvaluationsLang, NarrativeBody, FlatListBody, AccordionBody, CompareBody, QuadBody } from '~/schemas/kp-body-structured';
import { mountNarrativeForm, type FormModule } from '~/lib/editor/forms/narrative';
import { mountFlatListForm } from '~/lib/editor/forms/flat-list';
import { mountAccordionForm } from '~/lib/editor/forms/accordion';
import { mountCompareForm } from '~/lib/editor/forms/compare';
import { mountQuadForm } from '~/lib/editor/forms/quad';
import { patchKp, type PatchPayload } from '~/lib/editor/api';

// ============================================================
// Types
// ============================================================

const EMPTY_EVAL: KpEvaluationsLang = {
  meaning: '', limit: '', example: '', response: '', application: '', analogy: '',
};

const EVAL_FIELDS: Array<{ key: keyof KpEvaluationsLang; label: string; hint: string }> = [
  { key: 'meaning', label: '义 · 意义', hint: 'KP 的学术 / 实务贡献' },
  { key: 'limit', label: '限 · 限制', hint: '理论的不足 / 边界 / 被批判' },
  { key: 'example', label: '例 · 案例', hint: '真实企业 / 事例' },
  { key: 'response', label: '应 · 应对', hint: '基于 KP 的应对策略 / 处方' },
  { key: 'application', label: '用 · 应用', hint: '实务应用场景' },
  { key: 'analogy', label: '喻 · 比喻', hint: '类比 / 记忆点' },
];

interface InlineEditState {
  kpId: string;
  // DOM refs (locked at enterEditMode)
  titleEl: HTMLElement;
  bodyContainer: HTMLElement;
  evalContainer: HTMLElement;
  // Restore HTML on cancel
  originalTitleHtml: string;
  originalBodyHtml: string;
  originalEvalHtml: string;
  // Mutable current values
  currentTitle: string;
  currentBody: KpBody;
  currentEval: KpEvaluationsLang;
  // Baseline (for dirty check)
  originalTitle: string;
  originalBody: KpBody;
  originalEval: KpEvaluationsLang;
  // Mounted children
  titleInput: HTMLInputElement | null;
  formModule: FormModule | null;
  evalEditor: { destroy: () => void } | null;
  // Buttons
  saveBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
}

let active: InlineEditState | null = null;

// ============================================================
// Public API (exposed to split-pane.js)
// ============================================================

export function inlineEditHasDirty(): boolean {
  return active ? isDirty(active) : false;
}

export function inlineEditForceExit(): void {
  if (!active) return;
  exitEditMode(active, /* restoreHtml */ true);
}

function isDesktop(): boolean {
  return window.matchMedia('(min-width: 1024px)').matches;
}

function isDirty(s: InlineEditState): boolean {
  if (s.currentTitle !== s.originalTitle) return true;
  if (JSON.stringify(s.currentBody) !== JSON.stringify(s.originalBody)) return true;
  if (JSON.stringify(s.currentEval) !== JSON.stringify(s.originalEval)) return true;
  return false;
}

function updateSaveBtnState(s: InlineEditState): void {
  if (s.saveBtn) s.saveBtn.disabled = !isDirty(s);
}

// ============================================================
// DOM lookup
// ============================================================

function findTitleEl(): HTMLElement | null {
  const pane = document.getElementById('kp-detail-pane');
  if (!pane) return null;
  return pane.querySelector('header.kp-head-bar h2');
}

function findBodyContainer(): HTMLElement | null {
  const pane = document.getElementById('kp-detail-pane');
  if (!pane) return null;
  const fmtEl = pane.querySelector('.body-fmt');
  return fmtEl?.parentElement ?? null;
}

function findEvalContainer(bodyContainer: HTMLElement): HTMLElement | null {
  // body 区域之后下一个 sibling 是 eval div（即便 content 为空 div 也在）
  return bodyContainer.nextElementSibling as HTMLElement | null;
}

// ============================================================
// Form module dispatcher
// ============================================================

function mountFormByFormat(
  host: HTMLElement,
  body: KpBody,
  onChange: (body: KpBody) => void,
): FormModule {
  switch (body.format) {
    case 'narrative':
      return mountNarrativeForm(host, body, onChange as (b: NarrativeBody) => void);
    case 'flat-list':
      return mountFlatListForm(host, body, onChange as (b: FlatListBody) => void);
    case 'accordion':
      return mountAccordionForm(host, body, onChange as (b: AccordionBody) => void);
    case 'compare':
      return mountCompareForm(host, body, onChange as (b: CompareBody) => void);
    case 'quad':
      return mountQuadForm(host, body, onChange as (b: QuadBody) => void);
  }
}

// ============================================================
// Title editor
// ============================================================

function mountTitleEditor(
  titleEl: HTMLElement,
  initialTitle: string,
  onChange: (title: string) => void,
): { input: HTMLInputElement; destroy: () => void } {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = initialTitle;
  input.className = 'kpe-inline-title-input';
  input.placeholder = '标题（必填）';
  input.addEventListener('input', () => onChange(input.value));

  titleEl.style.display = 'none';
  titleEl.parentElement?.insertBefore(input, titleEl);

  return {
    input,
    destroy: () => {
      input.remove();
      titleEl.style.display = '';
    },
  };
}

// ============================================================
// Evaluations editor
// ============================================================

function mountEvalEditor(
  host: HTMLElement,
  initialEval: KpEvaluationsLang,
  onChange: (evals: KpEvaluationsLang) => void,
): { destroy: () => void } {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'kp-editor-v08 kpe-inline-eval';

  const heading = document.createElement('h4');
  heading.textContent = '评价（6 字段）';
  heading.className = 'kpe-inline-eval-heading';
  wrap.appendChild(heading);

  const current: KpEvaluationsLang = { ...initialEval };

  EVAL_FIELDS.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'kpe-inline-eval-row';

    const labelEl = document.createElement('label');
    labelEl.className = 'kpe-inline-eval-label';
    labelEl.textContent = f.label;
    row.appendChild(labelEl);

    const ta = document.createElement('textarea');
    ta.className = 'kpe-textarea kpe-inline-eval-textarea';
    ta.rows = 2;
    ta.placeholder = f.hint;
    ta.value = current[f.key];
    ta.addEventListener('input', () => {
      current[f.key] = ta.value;
      onChange({ ...current });
    });
    row.appendChild(ta);

    wrap.appendChild(row);
  });

  host.appendChild(wrap);

  return {
    destroy: () => {
      host.innerHTML = '';
    },
  };
}

// ============================================================
// Enter / exit
// ============================================================

function exitEditMode(state: InlineEditState, restoreHtml: boolean): void {
  // Destroy mounted children
  state.formModule?.destroy();
  state.evalEditor?.destroy();
  // Restore HTML on cancel; on save we let location.reload re-SSR everything
  if (restoreHtml) {
    state.bodyContainer.innerHTML = state.originalBodyHtml;
    state.evalContainer.innerHTML = state.originalEvalHtml;
    // Title: 移除 input + h2 显示恢复
    state.titleInput?.remove();
    state.titleEl.style.display = '';
    // Title innerHTML 不需要 restore（h2 一直在，只是被 hide）
  }
  // Remove buttons + restore toggle
  state.saveBtn?.remove();
  state.cancelBtn?.remove();
  const toggle = document.querySelector<HTMLButtonElement>('[data-inline-edit-toggle]');
  if (toggle) {
    toggle.style.display = '';
    toggle.dataset.active = 'false';
  }
  active = null;
}

async function enterEditMode(kpId: string, toggle: HTMLButtonElement): Promise<void> {
  if (!isDesktop()) {
    alert('内联编辑仅 desktop 支持，请使用全屏编辑器（点 ✎）');
    return;
  }

  toggle.disabled = true;
  toggle.textContent = '载入中…';

  // Fetch full KP data
  let kp: { title: { zh: string; ja?: string }; body: { zh: KpBody; ja?: KpBody }; evaluations?: { zh?: KpEvaluationsLang } };
  try {
    const res = await fetch(`/api/kps/${encodeURIComponent(kpId)}`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const data = (await res.json()) as { ok: boolean; kp: typeof kp };
    kp = data.kp;
  } catch (e) {
    alert(`载入 KP 失败：${e}`);
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

  // Race: 用户切走 KP 时静默 abort
  const currentActiveKpId = new URLSearchParams(location.search).get('kp');
  if (currentActiveKpId && currentActiveKpId !== kpId) {
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

  // Find DOM elements
  const titleEl = findTitleEl();
  const bodyContainer = findBodyContainer();
  if (!titleEl || !bodyContainer) {
    alert('找不到 KP 编辑区域 — 可能页面刚切换，请稍候重试');
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }
  const evalContainer = findEvalContainer(bodyContainer);
  if (!evalContainer) {
    alert('找不到评价区域容器');
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

  const initialBody = kp.body.zh;
  const initialEval: KpEvaluationsLang = kp.evaluations?.zh ?? { ...EMPTY_EVAL };
  const initialTitle = kp.title.zh ?? '';

  const state: InlineEditState = {
    kpId,
    titleEl,
    bodyContainer,
    evalContainer,
    originalTitleHtml: titleEl.innerHTML,
    originalBodyHtml: bodyContainer.innerHTML,
    originalEvalHtml: evalContainer.innerHTML,
    currentTitle: initialTitle,
    currentBody: initialBody,
    currentEval: initialEval,
    originalTitle: initialTitle,
    originalBody: initialBody,
    originalEval: initialEval,
    titleInput: null,
    formModule: null,
    evalEditor: null,
    saveBtn: null,
    cancelBtn: null,
  };

  // 1. Mount title input
  const titleMount = mountTitleEditor(titleEl, initialTitle, (v) => {
    state.currentTitle = v;
    updateSaveBtnState(state);
  });
  state.titleInput = titleMount.input;

  // 2. Mount body form (switch by format)
  bodyContainer.innerHTML = '';
  const editorHost = document.createElement('div');
  editorHost.className = 'kp-editor-v08 kpe-inline-host';
  bodyContainer.appendChild(editorHost);
  state.formModule = mountFormByFormat(editorHost, initialBody, (newBody) => {
    state.currentBody = newBody;
    updateSaveBtnState(state);
  });

  // 3. Mount eval editor
  state.evalEditor = mountEvalEditor(evalContainer, initialEval, (newEval) => {
    state.currentEval = newEval;
    updateSaveBtnState(state);
  });

  // 4. Save / Cancel buttons next to toggle
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'kp-inline-edit-save';
  saveBtn.textContent = '保存';
  saveBtn.disabled = true;
  saveBtn.addEventListener('click', () => handleSave(state));
  toggle.parentElement?.insertBefore(saveBtn, toggle);
  state.saveBtn = saveBtn;

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'kp-inline-edit-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => handleCancel(state));
  toggle.parentElement?.insertBefore(cancelBtn, toggle);
  state.cancelBtn = cancelBtn;

  // 5. Hide toggle
  toggle.style.display = 'none';
  toggle.dataset.active = 'true';
  toggle.disabled = false;
  toggle.textContent = '编辑';

  active = state;
}

function handleCancel(state: InlineEditState): void {
  if (isDirty(state)) {
    if (!confirm('有未保存改动，确认放弃？')) return;
  }
  exitEditMode(state, /* restoreHtml */ true);
}

async function handleSave(state: InlineEditState): Promise<void> {
  if (!state.saveBtn) return;
  state.saveBtn.disabled = true;
  state.saveBtn.textContent = '保存中…';

  // 拼 payload — 只送实际变化的字段
  const payload: PatchPayload = {};
  if (state.currentTitle !== state.originalTitle) {
    payload.title = { zh: state.currentTitle };
  }
  if (JSON.stringify(state.currentBody) !== JSON.stringify(state.originalBody)) {
    payload.body = { zh: state.currentBody };
  }
  if (JSON.stringify(state.currentEval) !== JSON.stringify(state.originalEval)) {
    // 直接送当前 6 字段；server hasEvaluationsContent 检测全空会自动写 NULL
    payload.evaluations = { zh: state.currentEval };
  }

  const result = await patchKp(state.kpId, payload);

  if (!result.ok) {
    state.saveBtn.disabled = false;
    state.saveBtn.textContent = '保存';
    alert(`保存失败：${result.message}\nreason: ${result.reason}`);
    return;
  }

  // 成功 — reload 拿最新 SSR
  exitEditMode(state, /* restoreHtml */ false);
  location.reload();
}

// ============================================================
// Mount entry
// ============================================================

export function mountInlineEditClient(): void {
  if (!isDesktop()) return;

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const toggle = target.closest<HTMLButtonElement>('[data-inline-edit-toggle]');
    if (!toggle) return;

    e.preventDefault();
    const kpId = toggle.dataset.kpId;
    if (!kpId) return;

    if (toggle.dataset.active === 'true') {
      if (active) handleCancel(active);
    } else {
      enterEditMode(kpId, toggle);
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (active && isDirty(active)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// Expose to split-pane.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__inlineEditHasDirty = inlineEditHasDirty;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__inlineEditForceExit = inlineEditForceExit;
