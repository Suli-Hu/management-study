/**
 * Theme (ThemeGroup) editor v0.8 — initThemeEditor 入口
 *
 * Flat layout: title.zh/ja/en / desc.zh/ja / tags
 * v0.8.9: key input 删 — new mode server 端从 title.en/title.zh slugify 自动生成
 * 不渲染 schools — backend PUT 不接受 schools 字段；schools 由 schools/new 时
 * 选 themeKey + reorder API 维护。
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
  ThemeEditorStore,
  buildI18nTitle,
  buildDesc,
  type ThemeEditorState,
  type ThemeEditorMetadata,
} from './theme-state';
import {
  createTheme,
  patchTheme,
  type ThemeCreatePayload,
  type ThemePatchPayload,
  type ThemeSaveResult,
} from './theme-api';

export interface InitThemeEditorOptions {
  root: HTMLElement;
  initialState: ThemeEditorState;
  metadata: ThemeEditorMetadata;
  mode: 'edit' | 'new';
}

export function initThemeEditor(opts: InitThemeEditorOptions): void {
  const store = new ThemeEditorStore(opts.initialState);

  opts.root.innerHTML = '';
  const root = el('div', 'kpe-root');
  opts.root.appendChild(root);

  root.appendChild(buildTopBar(store, opts));

  const body = el('div', 'kpe-body');
  root.appendChild(body);

  const formHost = el('div');
  body.appendChild(
    section({
      title: opts.mode === 'new' ? '新增学派组' : '编辑学派组',
      hint: '中文标题必填',
      body: formHost,
    }),
  );
  buildFormSection(formHost, store, opts);

  // error banner
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

function buildTopBar(store: ThemeEditorStore, opts: InitThemeEditorOptions): HTMLElement {
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
    // v0.8.9: key 不再前端校验 — server 端 slugify 自动生成
    const isSaving = s.saveStatus === 'saving';
    saveBtn.disabled = !titleOk || isSaving;
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
// Form section
// ============================================================

function buildFormSection(
  host: HTMLElement,
  store: ThemeEditorStore,
  opts: InitThemeEditorOptions,
): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  // v0.8.9: key 不渲染 — new mode server 端 slugify；edit URL 带 key

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

  // desc.zh
  wrap.appendChild(
    field({
      label: '副标题（中文）',
      control: textarea({
        value: store.get().desc.zh,
        placeholder: '可空，如：人格→态度→动机→判断偏误',
        cls: 'kpe-textarea',
        rows: 3,
        ariaLabel: '副标题 中文',
        onInput: (v) => {
          const d = store.get().desc;
          store.update({ desc: { ...d, zh: v } });
        },
      }),
    }),
  );

  // desc.ja
  wrap.appendChild(
    field({
      label: '副標題（日本語）',
      control: textarea({
        value: store.get().desc.ja,
        placeholder: '日本語版（可空）',
        cls: 'kpe-textarea',
        rows: 3,
        ariaLabel: '副標題 日本語',
        onInput: (v) => {
          const d = store.get().desc;
          store.update({ desc: { ...d, ja: v } });
        },
      }),
    }),
  );

  // tags chip
  const tagsWrap = el('div', 'kpe-field');
  const tagsLabel = el('label', 'kpe-label');
  tagsLabel.textContent = '标签';
  tagsWrap.appendChild(tagsLabel);
  const tagsHost = el('div');
  tagsWrap.appendChild(tagsHost);
  wrap.appendChild(tagsWrap);
  const tagOptions = opts.metadata.tags.map((t) => ({ key: t.key, label: t.label }));
  const tagTokenMap = new Map(opts.metadata.tags.map((t) => [t.key, t.color] as const));
  mountChipPicker(tagsHost, {
    current: store.get().tags,
    options: tagOptions,
    placeholder: '搜索标签（可空）',
    ariaLabel: '标签',
    colorize: (key) => tagTokenMap.get(key) ?? null,
    onChange: (next) => store.update({ tags: next }),
  });

  host.appendChild(wrap);
}

// ============================================================
// Save
// ============================================================

async function save(store: ThemeEditorStore, opts: InitThemeEditorOptions): Promise<void> {
  const state = store.get();
  if (state.title.zh.trim().length === 0) {
    toastError('中文标题必填');
    return;
  }

  store.setSaveStatus('saving');

  let result: ThemeSaveResult;
  if (opts.mode === 'new') {
    // v0.8.9: key 不再前端传 — server 端从 title slugify 生成
    const payload: ThemeCreatePayload = {
      discipline: state.discipline,
      json: {
        title: buildI18nTitle(state.title),
        ...(buildDesc(state.desc) ? { desc: buildDesc(state.desc) } : {}),
        tags: [...state.tags],
      },
    };
    result = await createTheme(payload);
  } else {
    if (!state.key) {
      toastError('编辑模式但缺 key — 编辑器 bug');
      store.setSaveStatus('error', { reason: 'missing_key', message: '编辑模式但缺 key' });
      return;
    }
    const payload: ThemePatchPayload = {
      discipline: state.discipline,
      key: state.key,
      title: buildI18nTitle(state.title),
      ...(buildDesc(state.desc) ? { desc: buildDesc(state.desc) } : {}),
      tags: [...state.tags],
    };
    result = await patchTheme(payload);
  }

  if (result.ok) {
    store.markSaved();
    toastSuccess(opts.mode === 'new' ? '已创建' : '已保存');
    if (opts.mode === 'new') {
      window.location.href = `/${opts.metadata.disciplineKey}`;
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
  else if (e.category === 'sha_conflict') toastError('远程已被更新，请刷新页面后重试');
  else if (e.category === 'forbidden') toastError(`权限不足：${e.message}`);
  else if (e.category === 'not_found') toastError('学派组不存在或已删除');
  else if (e.category === 'network') toastError(`网络错误，请重试：${e.message}`);
  else toastError(`字段校验失败：${e.message}`);
}
