/**
 * v0.11.72 KP 内联编辑 phase 2b-core — title/body/eval 双语 + year
 *
 * Phase 2a (v0.11.71) 仅 zh。Phase 2b-core 扩展：
 *   - title.ja / body.ja / evaluations.ja（lang tab 切换）
 *   - year（顶部 input）
 *
 * Phase 2b-extras (待续 PR)：schools / scholars / tags / format 切换
 *
 * 设计要点：
 *   - 编辑器顶部 mini lang tab（zh / ja），切换 mount target
 *   - body.ja == null 时切到 ja → 自动 init 空 body matching zh.format
 *   - PATCH partial：只送实际变化的字段（含语种粒度）
 *   - 切 lang 时把当前 lang input 已通过 onChange sync 到 state，安全
 */

import type {
  KpBody,
  KpEvaluationsLang,
  NarrativeBody,
  FlatListBody,
  AccordionBody,
  CompareBody,
  QuadBody,
} from '~/schemas/kp-body-structured';
import { mountNarrativeForm, type FormModule } from '~/lib/editor/forms/narrative';
import { mountFlatListForm } from '~/lib/editor/forms/flat-list';
import { mountAccordionForm } from '~/lib/editor/forms/accordion';
import { mountCompareForm } from '~/lib/editor/forms/compare';
import { mountQuadForm } from '~/lib/editor/forms/quad';
import { emptyKpBodyByFormat } from '~/lib/editor/state';
import { patchKp, type PatchPayload } from '~/lib/editor/api';

// ============================================================
// Constants
// ============================================================

type Lang = 'zh' | 'ja';

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

// ============================================================
// State
// ============================================================

interface InlineEditState {
  kpId: string;
  activeLang: Lang;

  // DOM refs (locked at enterEditMode)
  titleEl: HTMLElement;
  bodyContainer: HTMLElement;
  evalContainer: HTMLElement;
  editorHost: HTMLElement; // 内嵌在 bodyContainer 内，body form mount 在此
  langTabsEl: HTMLElement | null;

  // Restore HTML on cancel
  originalBodyHtml: string;
  originalEvalHtml: string;

  // Current values（双语）
  currentTitle: { zh: string; ja: string };
  currentBody: { zh: KpBody; ja: KpBody | null };
  currentEval: { zh: KpEvaluationsLang; ja: KpEvaluationsLang };
  currentYear: string;

  // Baseline for dirty check
  originalTitle: { zh: string; ja: string };
  originalBody: { zh: KpBody; ja: KpBody | null };
  originalEval: { zh: KpEvaluationsLang; ja: KpEvaluationsLang };
  originalYear: string;

  // Mounted children
  titleInput: HTMLInputElement | null;
  yearInput: HTMLInputElement | null;
  formModule: FormModule | null;
  evalEditor: { destroy: () => void } | null;

  // Buttons
  saveBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
}

let active: InlineEditState | null = null;

// ============================================================
// Public API
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
  if (s.currentTitle.zh !== s.originalTitle.zh) return true;
  if (s.currentTitle.ja !== s.originalTitle.ja) return true;
  if (s.currentYear !== s.originalYear) return true;
  if (JSON.stringify(s.currentBody.zh) !== JSON.stringify(s.originalBody.zh)) return true;
  if (JSON.stringify(s.currentBody.ja) !== JSON.stringify(s.originalBody.ja)) return true;
  if (JSON.stringify(s.currentEval.zh) !== JSON.stringify(s.originalEval.zh)) return true;
  if (JSON.stringify(s.currentEval.ja) !== JSON.stringify(s.originalEval.ja)) return true;
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
  return bodyContainer.nextElementSibling as HTMLElement | null;
}

// ============================================================
// Form dispatcher
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
// Lang tab + year toolbar
// ============================================================

function mountTopBar(
  bodyContainer: HTMLElement,
  initialLang: Lang,
  initialYear: string,
  onLangChange: (lang: Lang) => void,
  onYearChange: (year: string) => void,
): { el: HTMLElement; yearInput: HTMLInputElement; destroy: () => void } {
  const bar = document.createElement('div');
  bar.className = 'kpe-inline-topbar';

  // Lang tabs
  const tabs = document.createElement('div');
  tabs.className = 'kpe-inline-lang-tabs';
  (['zh', 'ja'] as Lang[]).forEach((lang) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kpe-inline-lang-btn';
    btn.dataset.langBtn = lang;
    btn.dataset.active = lang === initialLang ? 'true' : 'false';
    btn.textContent = lang === 'zh' ? '中文' : '日本語';
    btn.addEventListener('click', () => {
      tabs.querySelectorAll<HTMLButtonElement>('[data-lang-btn]').forEach((b) => {
        b.dataset.active = b.dataset.langBtn === lang ? 'true' : 'false';
      });
      onLangChange(lang);
    });
    tabs.appendChild(btn);
  });
  bar.appendChild(tabs);

  // Year input
  const yearWrap = document.createElement('label');
  yearWrap.className = 'kpe-inline-year';
  const yearLabel = document.createElement('span');
  yearLabel.textContent = '年份';
  yearLabel.className = 'kpe-inline-year-label';
  yearWrap.appendChild(yearLabel);
  const yearInput = document.createElement('input');
  yearInput.type = 'text';
  yearInput.value = initialYear;
  yearInput.className = 'kpe-inline-year-input';
  yearInput.placeholder = '如 1973';
  yearInput.addEventListener('input', () => onYearChange(yearInput.value));
  yearWrap.appendChild(yearInput);
  bar.appendChild(yearWrap);

  bodyContainer.parentElement?.insertBefore(bar, bodyContainer);

  return {
    el: bar,
    yearInput,
    destroy: () => bar.remove(),
  };
}

// ============================================================
// Body + Eval re-mount for lang switch
// ============================================================

/** 当前 lang 的 body — ja 若为 null 自动 init 空 body matching zh.format */
function getCurrentLangBody(state: InlineEditState): KpBody {
  if (state.activeLang === 'zh') return state.currentBody.zh;
  if (state.currentBody.ja) return state.currentBody.ja;
  // 自动 init 空 ja body matching zh format
  const empty = emptyKpBodyByFormat(state.currentBody.zh.format);
  state.currentBody = { ...state.currentBody, ja: empty };
  return empty;
}

function remountBody(state: InlineEditState): void {
  state.formModule?.destroy();
  state.editorHost.innerHTML = '';
  const body = getCurrentLangBody(state);
  state.formModule = mountFormByFormat(state.editorHost, body, (newBody) => {
    state.currentBody = { ...state.currentBody, [state.activeLang]: newBody };
    updateSaveBtnState(state);
  });
}

function remountEval(state: InlineEditState): void {
  state.evalEditor?.destroy();
  state.evalEditor = mountEvalEditor(state.evalContainer, state.currentEval[state.activeLang], (e) => {
    state.currentEval = { ...state.currentEval, [state.activeLang]: e };
    updateSaveBtnState(state);
  });
}

function updateTitleInputForLang(state: InlineEditState): void {
  if (!state.titleInput) return;
  state.titleInput.value = state.currentTitle[state.activeLang];
  state.titleInput.placeholder = state.activeLang === 'zh' ? '标题（中文必填）' : '标题（日本語）';
}

function switchLang(state: InlineEditState, newLang: Lang): void {
  if (state.activeLang === newLang) return;
  state.activeLang = newLang;
  updateTitleInputForLang(state);
  remountBody(state);
  remountEval(state);
}

// ============================================================
// Enter / exit
// ============================================================

function exitEditMode(state: InlineEditState, restoreHtml: boolean): void {
  state.formModule?.destroy();
  state.evalEditor?.destroy();
  if (restoreHtml) {
    state.bodyContainer.innerHTML = state.originalBodyHtml;
    state.evalContainer.innerHTML = state.originalEvalHtml;
    state.titleInput?.remove();
    state.titleEl.style.display = '';
  }
  state.langTabsEl?.remove();
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

  // Fetch full KP
  type FetchedKp = {
    year: string;
    title: { zh: string; ja?: string };
    body: { zh: KpBody; ja?: KpBody };
    evaluations?: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang };
  };
  let kp: FetchedKp;
  try {
    const res = await fetch(`/api/kps/${encodeURIComponent(kpId)}`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const data = (await res.json()) as { ok: boolean; kp: FetchedKp };
    kp = data.kp;
  } catch (e) {
    alert(`载入 KP 失败：${e}`);
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

  // Race check
  const currentActiveKpId = new URLSearchParams(location.search).get('kp');
  if (currentActiveKpId && currentActiveKpId !== kpId) {
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

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

  const initialTitle = { zh: kp.title.zh ?? '', ja: kp.title.ja ?? '' };
  const initialBody = { zh: kp.body.zh, ja: kp.body.ja ?? null };
  const initialEval = {
    zh: kp.evaluations?.zh ?? { ...EMPTY_EVAL },
    ja: kp.evaluations?.ja ?? { ...EMPTY_EVAL },
  };
  const initialYear = kp.year ?? '';

  // Capture HTML BEFORE wiping
  const capturedBodyHtml = bodyContainer.innerHTML;
  const capturedEvalHtml = evalContainer.innerHTML;

  // editorHost is a wrapper inside bodyContainer for form mounting
  bodyContainer.innerHTML = '';
  const editorHost = document.createElement('div');
  editorHost.className = 'kp-editor-v08 kpe-inline-host';
  bodyContainer.appendChild(editorHost);

  const state: InlineEditState = {
    kpId,
    activeLang: 'zh',
    titleEl,
    bodyContainer,
    evalContainer,
    editorHost,
    langTabsEl: null,
    originalBodyHtml: capturedBodyHtml,
    originalEvalHtml: capturedEvalHtml,
    currentTitle: { ...initialTitle },
    currentBody: { ...initialBody },
    currentEval: { zh: { ...initialEval.zh }, ja: { ...initialEval.ja } },
    currentYear: initialYear,
    originalTitle: { ...initialTitle },
    originalBody: { zh: initialBody.zh, ja: initialBody.ja ? { ...initialBody.ja } : null },
    originalEval: { zh: { ...initialEval.zh }, ja: { ...initialEval.ja } },
    originalYear: initialYear,
    titleInput: null,
    yearInput: null,
    formModule: null,
    evalEditor: null,
    saveBtn: null,
    cancelBtn: null,
  };

  // 1. Title editor
  const titleMount = mountTitleEditor(titleEl, initialTitle.zh, (v) => {
    state.currentTitle = { ...state.currentTitle, [state.activeLang]: v };
    updateSaveBtnState(state);
  });
  state.titleInput = titleMount.input;

  // 2. Top bar (lang tabs + year)
  const topBar = mountTopBar(
    bodyContainer,
    state.activeLang,
    initialYear,
    (newLang) => switchLang(state, newLang),
    (newYear) => {
      state.currentYear = newYear;
      updateSaveBtnState(state);
    },
  );
  state.langTabsEl = topBar.el;
  state.yearInput = topBar.yearInput;

  // 3. Mount body form (initial lang = zh)
  state.formModule = mountFormByFormat(editorHost, state.currentBody.zh, (newBody) => {
    state.currentBody = { ...state.currentBody, [state.activeLang]: newBody };
    updateSaveBtnState(state);
  });

  // 4. Mount eval editor (initial lang = zh)
  state.evalEditor = mountEvalEditor(evalContainer, state.currentEval.zh, (e) => {
    state.currentEval = { ...state.currentEval, [state.activeLang]: e };
    updateSaveBtnState(state);
  });

  // 5. Save / Cancel buttons next to toggle
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

  // 6. Hide toggle
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

  const payload: PatchPayload = {};

  // Title — 只送变化语种
  const titlePatch: { zh?: string; ja?: string } = {};
  if (state.currentTitle.zh !== state.originalTitle.zh) titlePatch.zh = state.currentTitle.zh;
  if (state.currentTitle.ja !== state.originalTitle.ja) titlePatch.ja = state.currentTitle.ja;
  if (Object.keys(titlePatch).length > 0) payload.title = titlePatch;

  // Body — 只送变化语种
  const bodyPatch: { zh?: KpBody; ja?: KpBody } = {};
  if (JSON.stringify(state.currentBody.zh) !== JSON.stringify(state.originalBody.zh)) {
    bodyPatch.zh = state.currentBody.zh;
  }
  if (JSON.stringify(state.currentBody.ja) !== JSON.stringify(state.originalBody.ja) && state.currentBody.ja) {
    bodyPatch.ja = state.currentBody.ja;
  }
  if (Object.keys(bodyPatch).length > 0) payload.body = bodyPatch;

  // Evaluations — 只送变化语种
  const evalPatch: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang } = {};
  if (JSON.stringify(state.currentEval.zh) !== JSON.stringify(state.originalEval.zh)) {
    evalPatch.zh = state.currentEval.zh;
  }
  if (JSON.stringify(state.currentEval.ja) !== JSON.stringify(state.originalEval.ja)) {
    evalPatch.ja = state.currentEval.ja;
  }
  if (Object.keys(evalPatch).length > 0) payload.evaluations = evalPatch;

  // Year
  if (state.currentYear !== state.originalYear) {
    payload.year = state.currentYear;
  }

  const result = await patchKp(state.kpId, payload);

  if (!result.ok) {
    state.saveBtn.disabled = false;
    state.saveBtn.textContent = '保存';
    alert(`保存失败：${result.message}\nreason: ${result.reason}`);
    return;
  }

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
