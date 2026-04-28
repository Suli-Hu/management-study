/**
 * 全局 Toast 系统 (v0.5.88)
 *
 * 顶部居中 · 单一替换 · 4 类型 (success / error / warning / info)
 *
 * 用法 1 — module import:
 *   import { toast } from '~/lib/toast-client';
 *   toast.success('已保存');
 *   toast.warning('改动同步中，还有 67s');
 *
 * 用法 2 — inline script (Layout 已 mount):
 *   window.toast.success('已保存');
 *
 * 语言切换专用：
 *   toast.langSwitched('ja')  → "日本語に切り替えました"
 *   toast.langSwitched('zh')  → "已切换回中文"
 *
 * 设计：
 *   - 单 stage div，所有 toast 都进同一容器
 *   - 单一替换策略：新 toast 调 show() 时立即清掉前一条（顶部居中位置不堆叠）
 *   - hover 暂停消失计时（让用户能看清）
 *   - error 默认带 × 按钮（错误信息往往要慢慢看）
 */

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOpts {
  type?: ToastType;
  message: string;
  /** 显示时长 (ms)。不传走该 type 默认值。 */
  duration?: number;
  /** 是否显示关闭 ×（error 默认 true，其他默认 false） */
  showClose?: boolean;
}

// v0.5.91 Style C：info 用极弱的「·」（视觉几乎消失），其它类型保留语义 icon
const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✗',
  warning: '⏱',
  info: '·',
};

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 2500,
  error: 4500,
  warning: 3000,
  info: 2500,
};

let stage: HTMLDivElement | null = null;
let currentToast: HTMLDivElement | null = null;
let currentTimer: ReturnType<typeof setTimeout> | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function ensureStage(): HTMLDivElement {
  if (stage && document.body.contains(stage)) return stage;
  stage = document.createElement('div');
  stage.className = 'app-toast-stage';
  stage.setAttribute('aria-live', 'polite');
  stage.setAttribute('aria-atomic', 'true');
  document.body.appendChild(stage);
  return stage;
}

function clearTimers() {
  if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
}

function dismissCurrent(immediate = false): void {
  if (!currentToast) return;
  clearTimers();
  const t = currentToast;
  if (immediate) {
    t.remove();
    if (currentToast === t) currentToast = null;
    return;
  }
  t.classList.add('is-leaving');
  t.classList.remove('is-shown');
  leaveTimer = setTimeout(() => {
    t.remove();
    if (currentToast === t) currentToast = null;
  }, 220);
}

function show(opts: ToastOpts): void {
  ensureStage();
  // 单一替换：新 toast 来了瞬间替换旧的
  dismissCurrent(true);

  const type = opts.type ?? 'info';
  const duration = opts.duration ?? DEFAULT_DURATION[type];
  const showClose = opts.showClose ?? type === 'error';

  const el = document.createElement('div');
  el.className = `app-toast app-toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const icon = document.createElement('span');
  icon.className = 'app-toast-icon';
  icon.textContent = ICONS[type];
  el.appendChild(icon);

  const msg = document.createElement('span');
  msg.className = 'app-toast-msg';
  msg.textContent = opts.message;
  el.appendChild(msg);

  if (showClose) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'app-toast-x';
    x.textContent = '×';
    x.setAttribute('aria-label', '关闭');
    x.addEventListener('click', () => dismissCurrent());
    el.appendChild(x);
  }

  // hover 暂停 — 离开后再延 800ms 消失
  el.addEventListener('mouseenter', () => {
    if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
  });
  el.addEventListener('mouseleave', () => {
    if (currentToast === el) {
      currentTimer = setTimeout(() => dismissCurrent(), 800);
    }
  });

  stage!.appendChild(el);
  currentToast = el;

  // 入场（next frame 让浏览器先 paint 初始 state）
  requestAnimationFrame(() => el.classList.add('is-shown'));

  // 出场计时
  currentTimer = setTimeout(() => dismissCurrent(), duration);
}

export const toast = {
  success: (message: string, opts: Partial<ToastOpts> = {}) =>
    show({ ...opts, type: 'success', message }),
  error: (message: string, opts: Partial<ToastOpts> = {}) =>
    show({ ...opts, type: 'error', message }),
  warning: (message: string, opts: Partial<ToastOpts> = {}) =>
    show({ ...opts, type: 'warning', message }),
  info: (message: string, opts: Partial<ToastOpts> = {}) =>
    show({ ...opts, type: 'info', message }),
  /**
   * 语言切换专用 — 文案用「目标语言」做反馈，让 toast 本身就是切换效果的证据。
   *   zh→ja 后显示 "日本語に切り替えました"
   *   ja→zh 后显示 "已切换回中文"
   */
  langSwitched: (targetLang: 'zh' | 'ja') => {
    const message = targetLang === 'ja' ? '日本語に切り替えました' : '已切换回中文';
    show({ type: 'info', message, duration: 2200 });
  },
  dismiss: () => dismissCurrent(),
};

declare global {
  interface Window {
    toast: typeof toast;
  }
}

export function mountToastSystem(): void {
  ensureStage();
  if (typeof window !== 'undefined') {
    window.toast = toast;
  }
}
