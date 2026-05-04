/**
 * Scholar editor v0.8 — initScholarEditor 入口
 *
 * 4 sections:
 *   - 基本信息: key (new only) + name.zh/ja/en
 *   - 学术身份: schools (chip autocomplete) + contribution.zh/ja + field + institution
 *   - 生平: lifespan + born + died + nationality + flag (emoji maxlen=8) + origin
 *   - 关联: tags (chip) + nobel (折叠区: year + detail)
 *
 * D6=B 不暴露 kpsOrder（自动派生 + 字典序）
 *
 * 见 v2/docs/SCHOOL-SCHOLAR-THEME-EDITOR-V0.8-PRD.md §5.2 + §6.3
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
  ScholarEditorStore,
  buildI18nName,
  buildContribution,
  type ScholarEditorState,
  type ScholarEditorMetadata,
} from './scholar-state';
import {
  createScholar,
  patchScholar,
  type ScholarCreatePayload,
  type ScholarPatchPayload,
  type ScholarSaveResult,
} from './scholar-api';

export interface InitScholarEditorOptions {
  root: HTMLElement;
  initialState: ScholarEditorState;
  metadata: ScholarEditorMetadata;
  mode: 'edit' | 'new';
}

export function initScholarEditor(opts: InitScholarEditorOptions): void {
  const store = new ScholarEditorStore(opts.initialState);

  opts.root.innerHTML = '';
  const root = el('div', 'kpe-root');
  opts.root.appendChild(root);

  root.appendChild(buildTopBar(store, opts));

  const body = el('div', 'kpe-body');
  root.appendChild(body);

  // 基本信息
  const basicHost = el('div');
  body.appendChild(
    section({
      title: '基本信息',
      hint: opts.mode === 'new' ? 'key 不可改 / 中文名必填' : '中文名必填',
      body: basicHost,
    }),
  );
  buildBasicSection(basicHost, store, opts);

  // 学术身份
  const academicHost = el('div');
  body.appendChild(
    section({
      title: '学术身份',
      body: academicHost,
    }),
  );
  buildAcademicSection(academicHost, store, opts.metadata);

  // 生平
  const lifeHost = el('div');
  body.appendChild(
    section({
      title: '生平（可选）',
      body: lifeHost,
    }),
  );
  buildLifeSection(lifeHost, store);

  // 关联
  const relHost = el('div');
  body.appendChild(
    section({
      title: '关联',
      body: relHost,
    }),
  );
  buildRelationsSection(relHost, store, opts.metadata);

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

function buildTopBar(store: ScholarEditorStore, opts: InitScholarEditorOptions): HTMLElement {
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
    const nameOk = s.name.zh.trim().length > 0;
    const keyOk = opts.mode === 'edit' || (s.key !== null && /^[a-z][a-z0-9_]*$/.test(s.key));
    const contribOk = s.contribution.zh.trim().length > 0;
    const isSaving = s.saveStatus === 'saving';
    saveBtn.disabled = !nameOk || !keyOk || !contribOk || isSaving;
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
// Section 1: 基本信息
// ============================================================

function buildBasicSection(
  host: HTMLElement,
  store: ScholarEditorStore,
  opts: InitScholarEditorOptions,
): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  if (opts.mode === 'new') {
    wrap.appendChild(
      field({
        label: 'key',
        required: true,
        control: input({
          value: store.get().key ?? '',
          placeholder: 'lewin',
          cls: 'kpe-input kpe-input-mono',
          ariaLabel: 'scholar key',
          required: true,
          onInput: (v) => store.update({ key: v.trim() }),
        }),
      }),
    );
  } else {
    wrap.appendChild(
      field({
        label: 'key',
        control: (() => {
          const ro = el('div', 'kpe-readonly');
          ro.textContent = store.get().key ?? '';
          return ro;
        })(),
      }),
    );
  }

  wrap.appendChild(
    field({
      label: '中文名',
      required: true,
      control: input({
        value: store.get().name.zh,
        placeholder: '勒温',
        cls: 'kpe-input is-lg',
        ariaLabel: '中文名',
        required: true,
        onInput: (v) => {
          const n = store.get().name;
          store.update({ name: { ...n, zh: v } });
        },
      }),
    }),
  );

  wrap.appendChild(
    field({
      label: '日本語名',
      control: input({
        value: store.get().name.ja,
        placeholder: '日本語名（可空）',
        cls: 'kpe-input',
        ariaLabel: '日本語名',
        onInput: (v) => {
          const n = store.get().name;
          store.update({ name: { ...n, ja: v } });
        },
      }),
    }),
  );

  wrap.appendChild(
    field({
      label: 'English name',
      control: input({
        value: store.get().name.en,
        placeholder: 'Lewin',
        cls: 'kpe-input',
        ariaLabel: 'English name',
        onInput: (v) => {
          const n = store.get().name;
          store.update({ name: { ...n, en: v } });
        },
      }),
    }),
  );

  host.appendChild(wrap);
}

// ============================================================
// Section 2: 学术身份
// ============================================================

function buildAcademicSection(
  host: HTMLElement,
  store: ScholarEditorStore,
  metadata: ScholarEditorMetadata,
): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  // schools — chip autocomplete
  const schoolsWrap = el('div', 'kpe-field');
  const schoolsLabel = el('label', 'kpe-label');
  schoolsLabel.textContent = '所属学派';
  schoolsWrap.appendChild(schoolsLabel);
  const schoolsHost = el('div');
  schoolsWrap.appendChild(schoolsHost);
  wrap.appendChild(schoolsWrap);
  mountChipPicker(schoolsHost, {
    current: store.get().schools,
    options: metadata.schools,
    placeholder: '搜索学派（可空）',
    ariaLabel: '所属学派',
    colorize: 'schools',
    onChange: (next) => store.update({ schools: next }),
  });

  // contribution.zh (必填)
  wrap.appendChild(
    field({
      label: '学术贡献（中文）',
      required: true,
      control: textarea({
        value: store.get().contribution.zh,
        placeholder: '核心理论 / 标志性成果 / 影响范围',
        cls: 'kpe-textarea',
        rows: 6,
        ariaLabel: '学术贡献 中文',
        required: true,
        onInput: (v) => {
          const c = store.get().contribution;
          store.update({ contribution: { ...c, zh: v } });
        },
      }),
    }),
  );

  // contribution.ja
  wrap.appendChild(
    field({
      label: '学術貢献（日本語）',
      control: textarea({
        value: store.get().contribution.ja,
        placeholder: '日本語版（可空）',
        cls: 'kpe-textarea',
        rows: 4,
        ariaLabel: '学术贡献 日本語',
        onInput: (v) => {
          const c = store.get().contribution;
          store.update({ contribution: { ...c, ja: v } });
        },
      }),
    }),
  );

  // field
  wrap.appendChild(
    field({
      label: '研究领域',
      control: input({
        value: store.get().field,
        placeholder: '社会心理学 · 组织变革',
        cls: 'kpe-input',
        ariaLabel: '研究领域',
        onInput: (v) => store.update({ field: v }),
      }),
    }),
  );

  // institution
  wrap.appendChild(
    field({
      label: '代表机构',
      control: input({
        value: store.get().institution,
        placeholder: 'Harvard Business School',
        cls: 'kpe-input',
        ariaLabel: '代表机构',
        onInput: (v) => store.update({ institution: v }),
      }),
    }),
  );

  host.appendChild(wrap);
}

// ============================================================
// Section 3: 生平
// ============================================================

function buildLifeSection(host: HTMLElement, store: ScholarEditorStore): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  wrap.appendChild(
    field({
      label: '生卒概要',
      control: input({
        value: store.get().lifespan,
        placeholder: '1908–1970',
        cls: 'kpe-input kpe-input-narrow',
        ariaLabel: '生卒概要',
        onInput: (v) => store.update({ lifespan: v }),
      }),
    }),
  );

  wrap.appendChild(
    field({
      label: '出生',
      control: input({
        value: store.get().born,
        placeholder: '1890年9月9日',
        cls: 'kpe-input',
        ariaLabel: '出生',
        onInput: (v) => store.update({ born: v }),
      }),
    }),
  );

  wrap.appendChild(
    field({
      label: '逝世',
      control: input({
        value: store.get().died,
        placeholder: '在世为空',
        cls: 'kpe-input',
        ariaLabel: '逝世',
        onInput: (v) => store.update({ died: v }),
      }),
    }),
  );

  wrap.appendChild(
    field({
      label: '国籍',
      control: input({
        value: store.get().nationality,
        placeholder: '德国 / 美国',
        cls: 'kpe-input',
        ariaLabel: '国籍',
        onInput: (v) => store.update({ nationality: v }),
      }),
    }),
  );

  wrap.appendChild(
    field({
      label: '国旗 emoji',
      control: input({
        value: store.get().flag,
        placeholder: '🇩🇪 🇺🇸',
        cls: 'kpe-input kpe-input-narrow',
        ariaLabel: '国旗 emoji',
        maxLength: 8,
        onInput: (v) => store.update({ flag: v }),
      }),
    }),
  );

  wrap.appendChild(
    field({
      label: '出身地',
      control: input({
        value: store.get().origin,
        placeholder: '可空',
        cls: 'kpe-input',
        ariaLabel: '出身地',
        onInput: (v) => store.update({ origin: v }),
      }),
    }),
  );

  host.appendChild(wrap);
}

// ============================================================
// Section 4: 关联（tags + nobel 折叠）
// ============================================================

function buildRelationsSection(
  host: HTMLElement,
  store: ScholarEditorStore,
  metadata: ScholarEditorMetadata,
): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  // tags chip
  const tagsWrap = el('div', 'kpe-field');
  const tagsLabel = el('label', 'kpe-label');
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
    placeholder: '搜索标签（可空）',
    ariaLabel: '标签',
    colorize: (key) => tagTokenMap.get(key) ?? null,
    onChange: (next) => store.update({ tags: next }),
  });

  // nobel — native details/summary 折叠
  const detailsEl = el('details', 'kpe-collapse');
  if (store.get().nobel) detailsEl.open = true;
  const summaryEl = el('summary', 'kpe-collapse-summary');
  summaryEl.textContent = '诺贝尔奖（可选）';
  detailsEl.appendChild(summaryEl);

  const nobelBody = el('div', 'kpe-collapse-body');
  const yearInput = input({
    value: store.get().nobel?.year ?? '',
    placeholder: '年份（留空 = 无）',
    cls: 'kpe-input kpe-input-narrow',
    ariaLabel: '诺贝尔年份',
    onInput: (v) => updateNobel(store, { year: v }),
  });
  const detailInput = input({
    value: store.get().nobel?.detail ?? '',
    placeholder: '授奖词',
    cls: 'kpe-input',
    ariaLabel: '诺贝尔授奖词',
    onInput: (v) => updateNobel(store, { detail: v }),
  });
  nobelBody.appendChild(field({ label: '年份', control: yearInput }));
  nobelBody.appendChild(field({ label: '授奖词', control: detailInput }));
  detailsEl.appendChild(nobelBody);
  wrap.appendChild(detailsEl);

  host.appendChild(wrap);
}

function updateNobel(
  store: ScholarEditorStore,
  patch: { year?: string; detail?: string },
): void {
  const cur = store.get().nobel ?? { year: '', detail: '' };
  const next = { year: patch.year ?? cur.year, detail: patch.detail ?? cur.detail };
  // 都空 → null（避免送 { year: '', detail: '' }）
  if (!next.year.trim() && !next.detail.trim()) {
    store.update({ nobel: null });
  } else {
    store.update({ nobel: next });
  }
}

// ============================================================
// Save
// ============================================================

async function save(store: ScholarEditorStore, opts: InitScholarEditorOptions): Promise<void> {
  const state = store.get();
  if (state.name.zh.trim().length === 0) {
    toastError('中文名必填');
    return;
  }
  if (state.contribution.zh.trim().length === 0) {
    toastError('学术贡献（中文）必填');
    return;
  }

  store.setSaveStatus('saving');

  let result: ScholarSaveResult;
  if (opts.mode === 'new') {
    if (!state.key || !/^[a-z][a-z0-9_]*$/.test(state.key)) {
      toastError('key 必须小写蛇形（首字母字母）');
      store.setSaveStatus('error', { reason: 'invalid_key', message: 'key 必须小写蛇形' });
      return;
    }
    const payload: ScholarCreatePayload = {
      discipline: state.discipline,
      key: state.key,
      name: buildI18nName(state.name),
      schools: [...state.schools],
      contribution: buildContribution(state.contribution),
      lifespan: state.lifespan.trim(),
      institution: state.institution.trim(),
      born: state.born.trim(),
      died: state.died.trim(),
      nationality: state.nationality.trim(),
      flag: state.flag.trim(),
      origin: state.origin.trim(),
      field: state.field.trim(),
      tags: [...state.tags],
      nobel: state.nobel,
    };
    result = await createScholar(payload);
  } else {
    if (!state.key) {
      toastError('编辑模式但缺 key — 编辑器 bug');
      store.setSaveStatus('error', { reason: 'missing_key', message: '编辑模式但缺 key' });
      return;
    }
    const payload: ScholarPatchPayload = {
      discipline: state.discipline,
      name: buildI18nName(state.name),
      schools: [...state.schools],
      contribution: buildContribution(state.contribution),
      lifespan: state.lifespan.trim(),
      institution: state.institution.trim(),
      born: state.born.trim(),
      died: state.died.trim(),
      nationality: state.nationality.trim(),
      flag: state.flag.trim(),
      origin: state.origin.trim(),
      field: state.field.trim(),
      tags: [...state.tags],
      nobel: state.nobel,
    };
    result = await patchScholar(state.key, payload);
  }

  if (result.ok) {
    store.markSaved();
    toastSuccess(opts.mode === 'new' ? '已创建' : '已保存');
    if (opts.mode === 'new') {
      window.location.href = `/${opts.metadata.disciplineKey}/scholars/${encodeURIComponent(result.scholar.key)}`;
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
  else if (e.category === 'school_not_in_tenant') toastError('所选学派不属于该学科');
  else if (e.category === 'forbidden') toastError(`权限不足：${e.message}`);
  else if (e.category === 'not_found') toastError('学者不存在或已删除');
  else if (e.category === 'network') toastError(`网络错误，请重试：${e.message}`);
  else toastError(`字段校验失败：${e.message}`);
}
