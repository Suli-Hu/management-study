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
  helpAnchor?: string; // kp-field-guide.md anchor
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
  if (opts.helpAnchor) head.appendChild(helpLink(opts.helpAnchor));
  wrap.appendChild(head);
  wrap.appendChild(opts.control);
  if (opts.hint) {
    const hint = el('div', 'kpe-hint');
    hint.textContent = opts.hint;
    wrap.appendChild(hint);
  }
  return wrap;
}

/** 字段 ⓘ 链接 — 跳到 kp-field-guide.md 对应 anchor (mobile) / 弹 popover (desktop)。 */
export function helpLink(anchor: string): HTMLAnchorElement {
  const a = el('a', 'kpe-help-link');
  a.href = `/docs/kp-field-guide.md#${anchor}`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'ⓘ';
  a.setAttribute('aria-label', '查看字段说明');
  return a;
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
