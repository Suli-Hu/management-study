/**
 * KP 编辑器 v0.8 — vanilla TS DOM helper
 *
 * 提供 input/textarea/btn/chip/dialog 等通用元素工厂 — 全 token-based，零 hex。
 * 所有 helper 含 IME compositionstart/end 保护（中日文输入）。
 *
 * 见 KP-EDITOR-V0.8-PRD.md §6 + §13.5。
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

// ============================================================
// IME-safe input / textarea
// ============================================================

interface InputOptions {
  value: string;
  placeholder?: string;
  cls?: string;
  ariaLabel?: string;
  maxLength?: number;
  required?: boolean;
  onInput: (v: string) => void;
}

interface TextareaOptions extends InputOptions {
  rows?: number;
}

/**
 * 文本 input — IME 期间 buffer 用户输入，compositionend 后才 fire onInput。
 * 防中日文字符割裂。
 */
export function input(opts: InputOptions): HTMLInputElement {
  const i = el('input');
  i.type = 'text';
  i.value = opts.value;
  if (opts.placeholder) i.placeholder = opts.placeholder;
  if (opts.maxLength) i.maxLength = opts.maxLength;
  if (opts.required) i.required = true;
  if (opts.ariaLabel) i.setAttribute('aria-label', opts.ariaLabel);
  i.className = opts.cls ?? 'kpe-input';
  attachImeSafeInput(i, opts.onInput);
  return i;
}

export function textarea(opts: TextareaOptions): HTMLTextAreaElement {
  const t = el('textarea');
  t.value = opts.value;
  if (opts.placeholder) t.placeholder = opts.placeholder;
  t.rows = opts.rows ?? 3;
  if (opts.required) t.required = true;
  if (opts.ariaLabel) t.setAttribute('aria-label', opts.ariaLabel);
  t.className = opts.cls ?? 'kpe-textarea';
  attachImeSafeInput(t, opts.onInput);
  attachAutoResize(t);
  return t;
}

function attachImeSafeInput(
  field: HTMLInputElement | HTMLTextAreaElement,
  onChange: (v: string) => void,
): void {
  let composing = false;
  field.addEventListener('compositionstart', () => {
    composing = true;
  });
  field.addEventListener('compositionend', () => {
    composing = false;
    onChange(field.value);
  });
  field.addEventListener('input', () => {
    if (composing) return;
    onChange(field.value);
  });
}

/** textarea 高度跟随内容（scrollHeight 方案）— 不超 800px。 */
function attachAutoResize(t: HTMLTextAreaElement): void {
  const resize = () => {
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 800) + 'px';
  };
  t.addEventListener('input', resize);
  // 初次挂载也跑一次（异步：等 DOM 实际有 scrollHeight）
  queueMicrotask(resize);
}

// ============================================================
// Buttons
// ============================================================

interface ButtonOptions {
  text: string;
  cls?: string;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  disabled?: boolean;
  onClick: () => void;
}

export function button(opts: ButtonOptions): HTMLButtonElement {
  const b = el('button');
  b.type = opts.type ?? 'button';
  b.textContent = opts.text;
  b.className = opts.cls ?? 'btn btn-ghost';
  if (opts.disabled) b.disabled = true;
  if (opts.ariaLabel) b.setAttribute('aria-label', opts.ariaLabel);
  b.addEventListener('click', opts.onClick);
  return b;
}

/** 删除 ✕ — 32px 实体 + 44×44 hit area，hover 转 danger 色。 */
export function deleteX(onClick: () => void, ariaLabel = '删除'): HTMLButtonElement {
  const b = el('button', 'kpe-item-del');
  b.type = 'button';
  b.textContent = '×';
  b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

/** "+ 添加 X" 按钮 — 全宽 dashed border。 */
export function addBtn(text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'kpe-add-btn');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// ============================================================
// Field wrapper — label + (optional) help link + control
// ============================================================

interface FieldOptions {
  label: string;
  required?: boolean;
  hint?: string; // 末尾小提示
  control: HTMLElement;
}

export function field(opts: FieldOptions): HTMLElement {
  const wrap = el('div', 'kpe-field');
  const head = el('div', 'kpe-field-row');
  const labelEl = el('label', 'kpe-label');
  labelEl.textContent = opts.label;
  if (opts.required) {
    const req = el('span', 'kpe-req');
    req.textContent = ' *';
    labelEl.appendChild(req);
  }
  head.appendChild(labelEl);
  wrap.appendChild(head);
  wrap.appendChild(opts.control);
  if (opts.hint) {
    const hint = el('div', 'kpe-hint');
    hint.textContent = opts.hint;
    wrap.appendChild(hint);
  }
  return wrap;
}

// ============================================================
// Section card
// ============================================================

interface SectionOptions {
  title: string;
  hint?: string;
  /** Action area in section header (right-aligned) — e.g. format selector / lang tabs */
  action?: HTMLElement;
  body: HTMLElement;
}

export function section(opts: SectionOptions): HTMLElement {
  const s = el('section', 'kpe-section');
  const head = el('div', 'kpe-section-head');
  const title = el('h3', 'kpe-section-title');
  title.textContent = opts.title;
  head.appendChild(title);
  if (opts.hint) {
    const hint = el('span', 'kpe-section-hint');
    hint.textContent = opts.hint;
    head.appendChild(hint);
  }
  if (opts.action) {
    const spacer = el('div');
    spacer.style.flex = '1';
    head.appendChild(spacer);
    head.appendChild(opts.action);
  }
  s.appendChild(head);
  const body = el('div', 'kpe-section-body');
  body.appendChild(opts.body);
  s.appendChild(body);
  return s;
}

// ============================================================
// Native dialog
// ============================================================

interface ConfirmDialogOptions {
  title: string;
  description: string;
  note?: string;
  confirmText?: string;
  cancelText?: string;
  /** Resolved 'confirm' | 'cancel'. Backdrop click / Escape = cancel. */
  onResolve: (action: 'confirm' | 'cancel') => void;
}

/**
 * 弹 native <dialog> — 触屏友好，Escape 关闭，backdrop 点击关闭 = cancel。
 * 在用户做出选择后自动 remove dialog 节点。
 */
export function confirmDialog(opts: ConfirmDialogOptions): void {
  const dialog = el('dialog', 'kpe-dialog');
  const body = el('div', 'kpe-dialog-body');
  const icon = el('div', 'kpe-dialog-icon');
  icon.textContent = '⚠';
  body.appendChild(icon);
  const title = el('h4', 'kpe-dialog-title');
  title.textContent = opts.title;
  body.appendChild(title);
  const desc = el('p', 'kpe-dialog-desc');
  desc.textContent = opts.description;
  body.appendChild(desc);
  if (opts.note) {
    const note = el('div', 'kpe-dialog-note');
    note.textContent = opts.note;
    body.appendChild(note);
  }
  dialog.appendChild(body);

  const footer = el('div', 'kpe-dialog-footer');
  let resolved = false;
  const cleanup = (action: 'confirm' | 'cancel') => {
    if (resolved) return;
    resolved = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    opts.onResolve(action);
  };
  footer.appendChild(
    button({
      text: opts.cancelText ?? '取消',
      cls: 'btn btn-ghost',
      onClick: () => cleanup('cancel'),
    }),
  );
  footer.appendChild(
    button({
      text: opts.confirmText ?? '确认',
      cls: 'btn btn-primary',
      onClick: () => cleanup('confirm'),
    }),
  );
  dialog.appendChild(footer);

  // backdrop click → cancel
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) cleanup('cancel');
  });
  // Escape → cancel
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    cleanup('cancel');
  });

  document.body.appendChild(dialog);
  dialog.showModal();
}

// ============================================================
// Tag chip (with optional remove)
// ============================================================

interface ChipOptions {
  label: string;
  removable?: boolean;
  /** OKLCH token name (without `--`), e.g. 'tag-mgmt'. null = neutral. */
  tagToken?: string | null;
  onRemove?: () => void;
}

export function chip(opts: ChipOptions): HTMLElement {
  const c = el('span', 'kpe-chip');
  if (opts.tagToken) c.setAttribute('data-tag', opts.tagToken);
  c.textContent = opts.label;
  if (opts.removable && opts.onRemove) {
    const x = el('button', 'kpe-chip-x');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `移除 ${opts.label}`);
    x.addEventListener('click', opts.onRemove);
    c.appendChild(x);
  }
  return c;
}

// ============================================================
// Toast 简化封装（依赖 window.toast 由 Layout 注入 — 见 toast-client.ts）
// ============================================================

export function toastSuccess(msg: string): void {
  window.toast?.success(msg);
}

export function toastError(msg: string): void {
  window.toast?.error(msg);
}

// ============================================================
// Chip multi-select (typeahead) — 共享给 KP / school / scholar / theme editor
// ============================================================

export interface ChipPickerOption {
  key: string;
  label: string;
  sub?: string;
  color?: string | null;
}

export interface ChipPickerOptions {
  /** 当前已选 keys（外部状态，本组件不内部持有） */
  current: string[];
  options: ChipPickerOption[];
  placeholder: string;
  ariaLabel: string;
  /** schools → 自动 hash 上 --tag-* token；none / function 提供 token name */
  colorize: 'schools' | 'none' | ((key: string) => string | null);
  onChange: (next: string[]) => void;
  /**
   * v0.9.0: 单选模式 — 点新选项替换 (而非追加)；用于 tag 字段 (Q2=① 单 tag 约束)。
   * 已选 1 个时 dropdown 仍允许换；点 chip × 删除还是清空。
   */
  singleSelect?: boolean;
}

const SCHOOL_TAG_TOKENS = [
  'tag-mgmt',
  'tag-mkt',
  'tag-soc',
  'tag-purple',
  'tag-pink',
  'tag-cyan',
  'tag-blue',
  'tag-orange',
] as const;

/** Map any key → tag token by hash, deterministic. */
export function hashToTagToken(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return SCHOOL_TAG_TOKENS[Math.abs(h) % SCHOOL_TAG_TOKENS.length]!;
}

/**
 * Mount typeahead chip picker into host. Re-render on change. Use externally for school/scholar/theme/tags fields.
 */
export function mountChipPicker(host: HTMLElement, opts: ChipPickerOptions): void {
  let current = [...opts.current];

  const tokenFor = (key: string): string | null => {
    if (opts.colorize === 'schools') return hashToTagToken(key);
    if (opts.colorize === 'none') return null;
    return opts.colorize(key);
  };

  const render = () => {
    host.innerHTML = '';
    const wrap = el('div', 'kpe-chips');

    const box = el('div', 'kpe-chips-box');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', opts.ariaLabel);

    current.forEach((key) => {
      const optDef = opts.options.find((o) => o.key === key);
      const label = optDef?.label ?? key;
      box.appendChild(
        chip({
          label,
          removable: true,
          tagToken: tokenFor(key),
          onRemove: () => {
            current = current.filter((k) => k !== key);
            opts.onChange(current);
            render();
          },
        }),
      );
    });

    const inputEl = el('input', 'kpe-chip-input');
    inputEl.type = 'text';
    inputEl.placeholder = opts.placeholder;
    inputEl.setAttribute('aria-label', `搜索并添加 ${opts.ariaLabel}`);
    box.appendChild(inputEl);

    const dd = el('div', 'kpe-chips-dd');
    dd.style.display = 'none';

    // v0.11.3: 把 currentMatches 抽到外层闭包，让 Enter / blur autocommit 能复用
    let currentMatches: typeof opts.options = [];

    const computeMatches = (): typeof opts.options => {
      const q = inputEl.value.trim().toLowerCase();
      return opts.options
        .filter((o) => opts.singleSelect ? true : !current.includes(o.key))
        .filter(
          (o) =>
            !q ||
            o.key.toLowerCase().includes(q) ||
            o.label.toLowerCase().includes(q) ||
            (o.sub ?? '').toLowerCase().includes(q),
        )
        .slice(0, 20);
    };

    const commitMatch = (m: (typeof opts.options)[number]): void => {
      if (current.includes(m.key) && !opts.singleSelect) return;
      // v0.9.0 singleSelect: 替换；非 singleSelect: 追加
      current = opts.singleSelect ? [m.key] : [...current, m.key];
      opts.onChange(current);
      inputEl.value = '';
      render();
    };

    const refreshDd = () => {
      dd.innerHTML = '';
      currentMatches = computeMatches();
      if (currentMatches.length === 0) {
        dd.style.display = 'none';
        return;
      }
      currentMatches.forEach((m, idx) => {
        const it = el('div', 'kpe-dd-item');
        // v0.11.3: 第一项视觉强调 — 提示「按 Enter / 失焦自动选中」
        if (idx === 0) it.classList.add('is-first-match');
        const name = el('span', 'kpe-dd-name');
        name.textContent = m.label;
        it.appendChild(name);
        if (m.sub) {
          const sub = el('span', 'kpe-dd-key');
          sub.textContent = m.sub;
          it.appendChild(sub);
        }
        if (current.includes(m.key)) it.classList.add('is-current');
        it.addEventListener('mousedown', (e) => {
          e.preventDefault();
          commitMatch(m);
          inputEl.focus();
        });
        dd.appendChild(it);
      });
      dd.style.display = '';
    };

    inputEl.addEventListener('focus', refreshDd);
    inputEl.addEventListener('input', refreshDd);
    inputEl.addEventListener('blur', () => {
      // v0.11.3: 失焦时若 input 仍有内容 + 有匹配项，自动选中第一个匹配项。
      // 防 Bug B 类事故：用户输入"战略"以为选上了，实际没点下拉项。
      // 短延迟让 mousedown 先 fire（避免 mousedown 已选中后又被 blur 选一次）
      setTimeout(() => {
        if (inputEl.value.trim() && currentMatches.length > 0) {
          commitMatch(currentMatches[0]!);
          return; // commitMatch 内部已 render，dd 已被 detach
        }
        dd.style.display = 'none';
      }, 100);
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // 有匹配项就选第一个；没匹配项 (空 input 或无结果) 是 noop
        if (currentMatches.length > 0) commitMatch(currentMatches[0]!);
      } else if (e.key === 'Escape') {
        dd.style.display = 'none';
        inputEl.blur();
      }
    });

    wrap.appendChild(box);
    wrap.appendChild(dd);
    host.appendChild(wrap);
  };

  render();
}
