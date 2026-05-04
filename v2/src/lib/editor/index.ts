/**
 * KP 编辑器 v0.8 — 入口（initEditor）
 *
 * 在 edit.astro / new.astro 客户端 hydration 时调一次，把 server-side render 的
 * `EditorState` JSON 接管 form。所有 module 通过 EditorStore 共享状态。
 *
 * 见 KP-EDITOR-V0.8-PRD.md §7.2。
 */

import type { KpBody } from '~/schemas/kp-body-structured';
import { EditorStore } from './state';
import type { EditorMetadata, EditorState, Format, Lang } from './state';
import { hasEvaluationContent, buildTitlePayload, emptyEvaluationsLang } from './state';
import {
  mountTitleAndYearFields,
  mountSchoolsField,
  mountScholarsField,
  mountTagsField,
} from './relations-panel';
import { mountLangTabs } from './lang-tabs';
import { mountFormatChangeButton, FORMAT_LABELS } from './format-switcher';
import { mountEvalPanel } from './eval-panel';
import { el, button, toastSuccess, toastError, section } from './dom-helpers';
import { mountNarrativeForm } from './forms/narrative';
import { mountFlatListForm } from './forms/flat-list';
import { mountAccordionForm } from './forms/accordion';
import { mountCompareForm } from './forms/compare';
import { mountQuadForm } from './forms/quad';
import type { FormModule } from './forms/narrative';
import { createKp, patchKp, type CreatePayload, type PatchPayload, type SaveResult } from './api';

export interface InitEditorOptions {
  root: HTMLElement;
  initialState: EditorState;
  metadata: EditorMetadata;
  /** 编辑模式 = 已有 KP id，新建模式 = null */
  mode: 'edit' | 'new';
}

export function initEditor(opts: InitEditorOptions): void {
  const store = new EditorStore(opts.initialState);

  // ─── shell ────────────────────────────────────────────────────
  opts.root.innerHTML = '';
  const root = el('div', 'kpe-root');
  opts.root.appendChild(root);

  // top bar
  root.appendChild(buildTopBar(store, opts));

  // body container
  const body = el('div', 'kpe-body');
  root.appendChild(body);

  // ─── 基本信息 section ─────────────────────────────────────────
  const titleHost = el('div');
  body.appendChild(
    section({
      title: '基本信息',
      hint: '中文标题必填，其它可空',
      body: titleHost,
    }),
  );
  mountTitleAndYearFields(titleHost, { store, metadata: opts.metadata });

  // ─── 关联 section ────────────────────────────────────────────
  const relWrap = el('div');
  const schoolsHost = el('div');
  const scholarsHost = el('div');
  const tagsHost = el('div');
  relWrap.appendChild(buildLabeledField('所属学派 *', schoolsHost));
  relWrap.appendChild(buildLabeledField('关联学者', scholarsHost));
  relWrap.appendChild(buildLabeledField('标签', tagsHost));
  mountSchoolsField(schoolsHost, { store, metadata: opts.metadata });
  mountScholarsField(scholarsHost, { store, metadata: opts.metadata });
  mountTagsField(tagsHost, { store, metadata: opts.metadata });
  body.appendChild(
    section({
      title: '关联',
      body: relWrap,
    }),
  );

  // ─── 主体 section（含 format selector + lang tab + body form）─
  const bodySectionWrap = el('div', 'kpe-body-section-inner');

  // format selector — section header right
  const formatSelectorHost = el('div', 'kpe-format-selector-host');
  mountFormatChangeButton(formatSelectorHost, { store });

  // lang tabs — body section header
  const langTabsHost = el('div');
  mountLangTabs(langTabsHost, {
    store,
    onLangChange: () => renderActiveForm(),
  });

  bodySectionWrap.appendChild(langTabsHost);

  // body form mount point
  const formHost = el('div', 'kpe-body-form-host');
  bodySectionWrap.appendChild(formHost);

  let formModule: FormModule | null = null;
  let lastFormatRendered: Format | null = null;
  let lastLangRendered: Lang | null = null;

  function renderActiveForm(): void {
    const state = store.get();
    const lang = state.activeLang;
    const body = lang === 'ja' ? state.body.ja : state.body.zh;
    if (lang === 'ja' && body === null) {
      formHost.innerHTML = '';
      const placeholder = el('div', 'kpe-ja-placeholder');
      const text = el('p', 'kpe-ja-placeholder-text');
      text.textContent = '日本語版尚未填写。在下方输入框开始填，将自动创建 ja body（与 zh 同 format）。';
      placeholder.appendChild(text);
      const startBtn = button({
        text: `开始填 ja（format = ${FORMAT_LABELS[state.body.zh.format]}）`,
        cls: 'btn btn-ghost',
        onClick: () => {
          // 创建空 ja body 同 zh.format
          const empty = emptyBodyForFormat(state.body.zh.format);
          store.setBody('ja', empty);
        },
      });
      placeholder.appendChild(startBtn);
      formHost.appendChild(placeholder);
      formModule?.destroy();
      formModule = null;
      lastFormatRendered = null;
      lastLangRendered = lang;
      return;
    }
    const targetBody = body!;
    if (lastFormatRendered === targetBody.format && lastLangRendered === lang && formModule) {
      // same format + lang — skip remount（避免 user input 时 caret 丢）
      return;
    }
    formModule?.destroy();
    formModule = mountForm(formHost, targetBody, (newBody) => {
      store.setBody(lang, newBody);
    });
    lastFormatRendered = targetBody.format;
    lastLangRendered = lang;
  }
  renderActiveForm();

  // re-render form when format changes (zh/ja both reset)
  let lastFmt = store.get().body.zh.format;
  store.subscribe((s) => {
    if (s.body.zh.format !== lastFmt) {
      lastFmt = s.body.zh.format;
      renderActiveForm();
    }
  });

  body.appendChild(
    section({
      title: '主体',
      hint: 'zh/ja 必同 format（F5 强制）',
      action: formatSelectorHost,
      body: bodySectionWrap,
    }),
  );

  // ─── 评价 section ────────────────────────────────────────────
  const evalHost = el('div');
  mountEvalPanel(evalHost, { store });
  body.appendChild(
    section({
      title: '评价（义/限/例/应/用/喻）',
      hint: '跟当前语言 tab 切换；全空时该语种不送',
      body: evalHost,
    }),
  );

  // ─── error banner ────────────────────────────────────────────
  const errorBanner = el('div', 'kpe-error-banner');
  errorBanner.style.display = 'none';
  errorBanner.setAttribute('role', 'alert');
  errorBanner.setAttribute('aria-live', 'assertive');
  body.appendChild(errorBanner);
  store.subscribe((s) => {
    if (s.errorDetail) {
      errorBanner.style.display = '';
      errorBanner.innerHTML = '';
      const icon = el('span', 'kpe-error-icon');
      icon.textContent = '✗';
      errorBanner.appendChild(icon);
      const content = el('div', 'kpe-error-content');
      const title = el('div', 'kpe-error-title');
      title.textContent = '保存失败';
      content.appendChild(title);
      const detail = el('div', 'kpe-error-detail');
      detail.textContent = s.errorDetail.message;
      content.appendChild(detail);
      const code = el('span', 'kpe-error-code');
      code.textContent = s.errorDetail.reason;
      content.appendChild(code);
      errorBanner.appendChild(content);
    } else {
      errorBanner.style.display = 'none';
    }
  });
}

// ============================================================
// Top bar (返回 + 保存)
// ============================================================

function buildTopBar(store: EditorStore, opts: InitEditorOptions): HTMLElement {
  const bar = el('div', 'kpe-topbar');
  const left = el('div', 'kpe-topbar-l');
  const back = el('a', 'kpe-back');
  back.href = opts.metadata.fromPath;
  back.textContent = `← 返回${opts.metadata.fromLabel}`;
  left.appendChild(back);
  bar.appendChild(left);

  const right = el('div', 'kpe-topbar-r');
  const saveBtn = button({
    text: opts.mode === 'new' ? '创建' : '保存',
    cls: 'btn btn-primary',
    onClick: () => save(store, opts),
  });
  right.appendChild(saveBtn);
  bar.appendChild(right);

  // wire save button enable state
  store.subscribe((s) => {
    const titleOk = s.title.zh.trim().length > 0;
    const schoolsOk = s.schools.length > 0;
    const isSaving = s.saveStatus === 'saving';
    saveBtn.disabled = !titleOk || !schoolsOk || isSaving;
    if (isSaving) {
      saveBtn.classList.add('is-loading');
      saveBtn.textContent = '保存中...';
    } else {
      saveBtn.classList.remove('is-loading');
      saveBtn.textContent = opts.mode === 'new' ? '创建' : '保存';
    }
  });

  return bar;
}

function buildLabeledField(label: string, host: HTMLElement): HTMLElement {
  const wrap = el('div', 'kpe-field');
  const head = el('div', 'kpe-field-row');
  const labelEl = el('label', 'kpe-label');
  labelEl.textContent = label;
  head.appendChild(labelEl);
  wrap.appendChild(head);
  wrap.appendChild(host);
  return wrap;
}

// ============================================================
// Form selector
// ============================================================

function mountForm(
  host: HTMLElement,
  body: KpBody,
  onChange: (body: KpBody) => void,
): FormModule {
  if (body.format === 'narrative') return mountNarrativeForm(host, body, onChange as (b: typeof body) => void);
  if (body.format === 'flat-list') return mountFlatListForm(host, body, onChange as (b: typeof body) => void);
  if (body.format === 'accordion') return mountAccordionForm(host, body, onChange as (b: typeof body) => void);
  if (body.format === 'compare') return mountCompareForm(host, body, onChange as (b: typeof body) => void);
  return mountQuadForm(host, body, onChange as (b: typeof body) => void);
}

function emptyBodyForFormat(format: Format): KpBody {
  switch (format) {
    case 'narrative':
      return { format: 'narrative', prose: '' };
    case 'flat-list':
      return { format: 'flat-list', lead: '', items: [{ name: '', desc: '' }] };
    case 'accordion':
      return { format: 'accordion', lead: '', groups: [{ title: '', items: [] }] };
    case 'compare':
      return {
        format: 'compare',
        lead: '',
        cols: [
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
      };
    case 'quad':
      return {
        format: 'quad',
        lead: '',
        yAxis: '',
        xAxis: '',
        cells: [
          { name: '', emoji: '', sub: '', detail: '' },
          { name: '', emoji: '', sub: '', detail: '' },
          { name: '', emoji: '', sub: '', detail: '' },
          { name: '', emoji: '', sub: '', detail: '' },
        ],
      };
  }
}

// ============================================================
// Save
// ============================================================

async function save(store: EditorStore, opts: InitEditorOptions): Promise<void> {
  const state = store.get();
  if (state.title.zh.trim().length === 0) {
    toastError('中文标题必填');
    return;
  }
  if (state.schools.length === 0) {
    toastError('学派至少选 1 个');
    return;
  }

  store.setSaveStatus('saving');

  let result: SaveResult;
  if (opts.mode === 'new') {
    const payload = buildCreatePayload(state, opts.metadata.disciplineKey);
    result = await createKp(payload);
  } else {
    if (!state.id) {
      toastError('编辑模式但缺 KP id — 编辑器 bug');
      store.setSaveStatus('error', { reason: 'missing_id', message: '编辑模式但缺 KP id' });
      return;
    }
    const payload = buildPatchPayload(state);
    result = await patchKp(state.id, payload);
  }

  if (result.ok) {
    store.markSaved(result.kp.id);
    toastSuccess(opts.mode === 'new' ? '已创建' : '已保存');
    if (opts.mode === 'new') {
      // 跳到 edit 页 — server-side render 会拿到刚创建的 structured shape
      const url = `/${opts.metadata.disciplineKey}/kp/${encodeURIComponent(result.kp.id)}/edit?just-edited=${encodeURIComponent(result.kp.id)}`;
      window.location.href = url;
    }
    return;
  }

  // 错误处理
  const e = result;
  store.setSaveStatus('error', {
    reason: e.reason,
    message: e.message,
    field: e.fieldPath ? e.fieldPath.join('.') : undefined,
  });
  if (e.category === 'editor_bug') {
    toastError(`编辑器 bug：${e.reason}（请反馈）`);
    console.error('[kp-editor] legacy_* reason from API — editor构造了旧 contract', e);
    return;
  }
  if (e.category === 'version_conflict') {
    toastError('KP 已被其它会话更新 — 请刷新页面重新编辑');
    return;
  }
  if (e.category === 'forbidden') {
    toastError(`权限不足：${e.message}`);
    return;
  }
  if (e.category === 'not_found') {
    toastError('KP 不存在或已删除');
    return;
  }
  if (e.category === 'network') {
    toastError(`网络错误，请重试：${e.message}`);
    return;
  }
  // schema_invalid / body_invalid
  toastError(`字段校验失败：${e.message}`);
}

function buildCreatePayload(state: EditorState, discipline: string): CreatePayload {
  const evals: { zh?: import('~/schemas/kp-body-structured').KpEvaluationsLang; ja?: import('~/schemas/kp-body-structured').KpEvaluationsLang } = {};
  if (state.evaluations.zh && hasEvaluationContent(state.evaluations.zh)) evals.zh = state.evaluations.zh;
  if (state.evaluations.ja && hasEvaluationContent(state.evaluations.ja)) evals.ja = state.evaluations.ja;

  const payload: CreatePayload = {
    discipline,
    title: buildTitlePayload(state.title),
    body: { zh: state.body.zh, ...(state.body.ja ? { ja: state.body.ja } : {}) },
    schools: [...state.schools],
    scholars: [...state.scholars],
    tags: [...state.tags],
    year: state.year.trim(),
  };
  if (Object.keys(evals).length > 0) payload.evaluations = evals;
  return payload;
}

function buildPatchPayload(state: EditorState): PatchPayload {
  // evaluations PATCH 语义（v0.7.42 + Stage 4）：UI = D1 状态保持一致 — 永远送
  // zh evaluations 整 record（未填则全空字段）；ja 仅在 body.ja 存在时送。backend
  // hasEvaluationsContent 决定写 null fallback。这保证用户清空字段后 D1 也清。
  const evals: PatchPayload['evaluations'] = {
    zh: state.evaluations.zh ?? emptyEvaluationsLang(),
  };
  if (state.body.ja) {
    evals.ja = state.evaluations.ja ?? emptyEvaluationsLang();
  }

  return {
    title: buildTitlePayload(state.title),
    body: { zh: state.body.zh, ...(state.body.ja ? { ja: state.body.ja } : {}) },
    evaluations: evals,
    schools: [...state.schools],
    scholars: [...state.scholars],
    tags: [...state.tags],
    year: state.year.trim(),
  };
}

// re-export commonly used
export { EditorStore } from './state';
export type { EditorState, EditorMetadata } from './state';
