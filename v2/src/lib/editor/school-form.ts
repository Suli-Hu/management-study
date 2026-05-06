/**
 * School editor v0.8 — initSchoolEditor 入口
 *
 * 3 sections: 基本信息 / 内容 / 关联
 * D6=B 不暴露 concepts 字段（自动从 KP.schools[] 反向派生）
 *
 * v0.8.9: key input 删（server 端从 title.en slugify 生成）+ themeKey select 删
 *         （new.astro 默认 themes[0]，建好后跳 discipline overview 提示拖卡片）
 */

import {
  el,
  input,
  textarea,
  field,
  button,
  section,
  toastSuccess,
  toastError,
  mountChipPicker,
} from './dom-helpers';
import {
  SchoolEditorStore,
  buildI18nTitle,
  buildSummary,
  type SchoolEditorState,
  type SchoolEditorMetadata,
} from './school-state';
import {
  createSchool,
  patchSchool,
  type SchoolCreatePayload,
  type SchoolPatchPayload,
  type SchoolSaveResult,
} from './school-api';

export interface InitSchoolEditorOptions {
  root: HTMLElement;
  initialState: SchoolEditorState;
  metadata: SchoolEditorMetadata;
  mode: 'edit' | 'new';
}

export function initSchoolEditor(opts: InitSchoolEditorOptions): void {
  const store = new SchoolEditorStore(opts.initialState);

  opts.root.innerHTML = '';
  const root = el('div', 'kpe-root');
  opts.root.appendChild(root);

  root.appendChild(buildTopBar(store, opts));

  const body = el('div', 'kpe-body');
  root.appendChild(body);

  // ─── 基本信息 ──────────────────────────────
  const basicHost = el('div');
  body.appendChild(
    section({
      title: '基本信息',
      hint: '中文标题必填',
      body: basicHost,
    }),
  );
  buildBasicSection(basicHost, store, opts);

  // ─── 内容 ────────────────────────────────
  const contentHost = el('div');
  body.appendChild(
    section({
      title: '内容',
      body: contentHost,
    }),
  );
  buildContentSection(contentHost, store);

  // ─── 关联 ────────────────────────────────
  const relHost = el('div');
  body.appendChild(
    section({
      title: '关联',
      body: relHost,
    }),
  );
  buildRelationsSection(relHost, store, opts.metadata);

  // ─── error banner ────────────────────────
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
// Top bar
// ============================================================

function buildTopBar(store: SchoolEditorStore, opts: InitSchoolEditorOptions): HTMLElement {
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

  store.subscribe((s) => {
    const titleOk = s.title.zh.trim().length > 0;
    // v0.8.9: key + themeKey 不再前端校验
    //   - key: server 端从 title.en/title.zh slugify 自动生成
    //   - themeKey: new.astro 已 server-side 注入 themes[0]，永远非空
    const summaryOk = s.summary.zh.trim().length > 0;
    // v0.9.0 Stage C-1: tag 必填 (单 tag 单源色)
    const tagsOk = s.tags.length === 1;
    const isSaving = s.saveStatus === 'saving';
    saveBtn.disabled = !titleOk || !summaryOk || !tagsOk || isSaving;
    if (isSaving) {
      saveBtn.classList.add('is-loading');
      saveBtn.textContent = opts.mode === 'new' ? '创建中...' : '保存中...';
    } else {
      saveBtn.classList.remove('is-loading');
      saveBtn.textContent = opts.mode === 'new' ? '创建' : '保存';
    }
  });

  return bar;
}

// ============================================================
// Basic section: key (new only) + title.{zh,ja,en} + era
// ============================================================

function buildBasicSection(
  host: HTMLElement,
  store: SchoolEditorStore,
  _opts: InitSchoolEditorOptions,
): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  // v0.8.9: key 不渲染 — new mode server 自动 slugify；edit URL 带 key

  // title.zh (必填)
  wrap.appendChild(
    field({
      label: '中文标题',
      required: true,
      control: input({
        value: store.get().title.zh,
        placeholder: '中文标题',
        cls: 'kpe-input is-lg',
        ariaLabel: '中文标题',
        required: true,
        onInput: (v) => {
          const t = store.get().title;
          store.update({ title: { ...t, zh: v } });
        },
      }),
    }),
  );

  // title.ja
  wrap.appendChild(
    field({
      label: '日本語タイトル',
      control: input({
        value: store.get().title.ja,
        placeholder: '日本語タイトル（可空）',
        cls: 'kpe-input',
        ariaLabel: '日本語標題',
        onInput: (v) => {
          const t = store.get().title;
          store.update({ title: { ...t, ja: v } });
        },
      }),
    }),
  );

  // title.en
  wrap.appendChild(
    field({
      label: 'English title',
      control: input({
        value: store.get().title.en,
        placeholder: 'English title (optional)',
        cls: 'kpe-input',
        ariaLabel: 'English title',
        onInput: (v) => {
          const t = store.get().title;
          store.update({ title: { ...t, en: v } });
        },
      }),
    }),
  );

  // era
  wrap.appendChild(
    field({
      label: '时代',
      control: input({
        value: store.get().era,
        placeholder: '1947–',
        cls: 'kpe-input kpe-input-narrow',
        ariaLabel: '时代',
        onInput: (v) => store.update({ era: v }),
      }),
    }),
  );

  host.appendChild(wrap);
}

// ============================================================
// Content section: summary.zh (必填) + summary.ja
// ============================================================

function buildContentSection(host: HTMLElement, store: SchoolEditorStore): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  wrap.appendChild(
    field({
      label: '概述（中文）',
      required: true,
      control: textarea({
        value: store.get().summary.zh,
        placeholder: '学派核心定位 / 主张 / 影响范围',
        cls: 'kpe-textarea',
        rows: 8,
        ariaLabel: '概述 中文',
        required: true,
        onInput: (v) => {
          const s = store.get().summary;
          store.update({ summary: { ...s, zh: v } });
        },
      }),
    }),
  );

  wrap.appendChild(
    field({
      label: '概述（日本語）',
      control: textarea({
        value: store.get().summary.ja,
        placeholder: '日本語版概要（可空）',
        cls: 'kpe-textarea',
        rows: 6,
        ariaLabel: '概述 日本語',
        onInput: (v) => {
          const s = store.get().summary;
          store.update({ summary: { ...s, ja: v } });
        },
      }),
    }),
  );

  host.appendChild(wrap);
}

// ============================================================
// Relations section: tags (chip)
//
// v0.8.9: themeKey select 删 — new mode 由 new.astro server-side 注入 themes[0]，
// edit mode 由 store.themeKey 内部保留（PATCH 时仍传，server 端 noop merge）。
// 学派建好后跳 discipline overview，用户拖卡片到正确分组。
// ============================================================

function buildRelationsSection(
  host: HTMLElement,
  store: SchoolEditorStore,
  metadata: SchoolEditorMetadata,
): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  // tags — v0.9.0: 单选 + 必填 (Q2=① 单 tag 单源色)
  const tagsWrap = el('div', 'kpe-field');
  const tagsLabel = el('label', 'kpe-label kpe-label-required');
  tagsLabel.textContent = '标签';
  tagsWrap.appendChild(tagsLabel);
  const tagsHost = el('div');
  tagsWrap.appendChild(tagsHost);
  wrap.appendChild(tagsWrap);
  const tagOptions = metadata.tags.map((t) => ({ key: t.key, label: t.label }));
  const tagTokenMap = new Map(metadata.tags.map((t) => [t.key, t.color] as const));
  mountChipPicker(tagsHost, {
    current: store.get().tags,
    options: tagOptions,
    placeholder: '搜索 / 选 1 个标签（必填）',
    ariaLabel: '标签',
    colorize: (key) => tagTokenMap.get(key) ?? null,
    onChange: (next) => store.update({ tags: next }),
    singleSelect: true,
  });

  host.appendChild(wrap);
}

// ============================================================
// Save
// ============================================================

async function save(store: SchoolEditorStore, opts: InitSchoolEditorOptions): Promise<void> {
  const state = store.get();
  if (state.title.zh.trim().length === 0) {
    toastError('中文标题必填');
    return;
  }
  if (!state.summary.zh.trim()) {
    toastError('概述（中文）必填');
    return;
  }

  store.setSaveStatus('saving');

  let result: SchoolSaveResult;
  if (opts.mode === 'new') {
    // v0.8.9: key 不再前端传 — server 端 slugify 生成
    const payload: SchoolCreatePayload = {
      discipline: state.discipline,
      title: buildI18nTitle(state.title),
      era: state.era.trim(),
      summary: buildSummary(state.summary),
      themeKey: state.themeKey,
      tags: [...state.tags],
    };
    result = await createSchool(payload);
  } else {
    if (!state.key) {
      toastError('编辑模式但缺 key — 编辑器 bug');
      store.setSaveStatus('error', { reason: 'missing_key', message: '编辑模式但缺 key' });
      return;
    }
    const payload: SchoolPatchPayload = {
      discipline: state.discipline,
      title: buildI18nTitle(state.title),
      era: state.era.trim(),
      summary: buildSummary(state.summary),
      themeKey: state.themeKey,
      tags: [...state.tags],
    };
    result = await patchSchool(state.key, payload);
  }

  if (result.ok) {
    store.markSaved();
    toastSuccess(opts.mode === 'new' ? '已创建' : '已保存');
    if (opts.mode === 'new') {
      // v0.8.9 Fix 3c: 跳 discipline overview + flash 提示拖到正确分组
      const params = new URLSearchParams({
        just_created_school: result.school.key,
        theme: state.themeKey,
      });
      window.location.href = `/${opts.metadata.disciplineKey}?${params.toString()}`;
    }
    return;
  }

  const e = result;
  store.setSaveStatus('error', {
    reason: e.reason,
    message: e.message,
    field: e.fieldPath ? e.fieldPath.join('.') : undefined,
  });
  if (e.category === 'key_exists') toastError('key 已存在 — 请换一个');
  else if (e.category === 'theme_not_found') toastError('所选学派组不属于该学科');
  else if (e.category === 'forbidden') toastError(`权限不足：${e.message}`);
  else if (e.category === 'not_found') toastError('学派不存在或已删除');
  else if (e.category === 'network') toastError(`网络错误，请重试：${e.message}`);
  else toastError(`字段校验失败：${e.message}`);
}
