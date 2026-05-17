/**
 * v0.11.67 KP 内联编辑 PoC — 仅 narrative format
 *
 * 作用：split-pane 右栏 head bar 加「编辑模式」toggle。点开 → 当前 KP body 区域
 * 从 SSR HTML 切成 mountNarrativeForm 编辑器。改 → 「保存」按钮 PATCH → 退出
 * 编辑态。仅 desktop (>=1024px) + narrative format + canEdit admin 才激活。
 *
 * 集成点：
 *   - [discipline]/[school]/index.astro head bar (desktop split-pane only)
 *   - [discipline]/scholars/[key]/index.astro head bar (desktop split-pane only)
 *   - public/split-pane.js KP swap 前 check dirty
 *
 * 非目标 (PoC scope)：
 *   - flat-list / accordion / compare / quad format（提示走全屏）
 *   - title / evaluations / schools / scholars / format / tags 编辑（同上）
 *   - ja 字段编辑（PoC 只 zh）
 *   - autosave（explicit 保存按钮）
 *   - mobile（完全禁用）
 */

import type { KpBody, NarrativeBody } from '~/schemas/kp-body-structured';
import { mountNarrativeForm, type FormModule } from '~/lib/editor/forms/narrative';
import { patchKp } from '~/lib/editor/api';

interface InlineEditState {
  kpId: string;
  originalBodyHtml: string;
  currentBody: NarrativeBody;
  originalBody: NarrativeBody;
  formModule: FormModule | null;
  saveBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
  dirty: boolean;
}

let active: InlineEditState | null = null;

/** 是否 PC 端 — mobile 完全禁用 */
function isDesktop(): boolean {
  return window.matchMedia('(min-width: 1024px)').matches;
}

/** 当前是否有未保存的编辑 — 给 split-pane.js 的 KP swap 拦截器调用 */
export function inlineEditHasDirty(): boolean {
  return active?.dirty ?? false;
}

/** 强制退出编辑态（KP swap / 页面 unload 调用）— 不询问，直接 discard */
export function inlineEditForceExit(): void {
  if (!active) return;
  exitEditMode(active, /* restoreHtml */ true);
}

/** 拿到 KP body 区域 DOM 容器（renderStructuredBody 出来的 .body-fmt 的 parent） */
function findBodyContainer(): HTMLElement | null {
  // school / scholar 页 partial / full 都用：<div class="mt-6" set:html={renderStructuredBody(...)} />
  // renderStructuredBody 输出 <div class="body-fmt body-fmt-{narr|flat|acc|cmpc|quad}">...
  const pane = document.getElementById('kp-detail-pane');
  if (!pane) return null;
  // 用 base class .body-fmt 匹配（所有 format 都有），更稳
  const fmtEl = pane.querySelector('.body-fmt');
  return fmtEl?.parentElement ?? null;
}

function exitEditMode(state: InlineEditState, restoreHtml: boolean): void {
  state.formModule?.destroy();
  const container = findBodyContainer();
  if (container && restoreHtml) {
    container.innerHTML = state.originalBodyHtml;
  }
  state.saveBtn?.remove();
  state.cancelBtn?.remove();
  // 把 head bar 的 toggle 按钮还原（v0.11.69: 改成显示/隐藏而不是切 text）
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

  // 拿 KP 完整数据
  let kp: { body: { zh: KpBody } };
  try {
    const res = await fetch(`/api/kps/${encodeURIComponent(kpId)}`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const data = (await res.json()) as { ok: boolean; kp: { body: { zh: KpBody } } };
    kp = data.kp;
  } catch (e) {
    alert(`载入 KP 失败：${e}`);
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

  // v0.11.69 race condition 保护 — fetch 期间用户可能切走 KP（split-pane swap）
  const currentActiveKpId = new URLSearchParams(location.search).get('kp');
  if (currentActiveKpId && currentActiveKpId !== kpId) {
    // 用户已切到别的 KP，放弃 enter edit mode（无 alert，免打扰）
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

  if (kp.body.zh.format !== 'narrative') {
    alert(
      `此 KP body 格式为 ${kp.body.zh.format}，PoC 阶段仅支持 narrative 内联编辑。\n` +
        `请使用全屏编辑器（点 ✎）`,
    );
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

  const container = findBodyContainer();
  if (!container) {
    alert('找不到 KP body 容器 — 可能页面刚切换，请稍候重试');
    toggle.disabled = false;
    toggle.textContent = '编辑';
    return;
  }

  const initialBody = kp.body.zh as NarrativeBody;

  const state: InlineEditState = {
    kpId,
    originalBodyHtml: container.innerHTML,
    currentBody: initialBody,
    originalBody: initialBody,
    formModule: null,
    saveBtn: null,
    cancelBtn: null,
    dirty: false,
  };

  container.innerHTML = '';
  const editorHost = document.createElement('div');
  editorHost.className = 'kp-editor-v08 kpe-inline-host';
  container.appendChild(editorHost);

  state.formModule = mountNarrativeForm(editorHost, initialBody, (newBody) => {
    state.currentBody = newBody;
    state.dirty = newBody.prose !== state.originalBody.prose;
    if (state.saveBtn) state.saveBtn.disabled = !state.dirty;
  });

  // 加保存/取消按钮在 toggle 旁
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'kp-inline-edit-save';
  saveBtn.textContent = '保存';
  saveBtn.disabled = true;
  saveBtn.addEventListener('click', () => handleSave(state, toggle));
  toggle.parentElement?.insertBefore(saveBtn, toggle);
  state.saveBtn = saveBtn;

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'kp-inline-edit-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => handleCancel(state));
  toggle.parentElement?.insertBefore(cancelBtn, toggle);
  state.cancelBtn = cancelBtn;

  // v0.11.69: 编辑态隐藏 toggle（不切 text 为「退出」，UI 冗余去掉）
  toggle.style.display = 'none';
  toggle.dataset.active = 'true';
  toggle.disabled = false;
  toggle.textContent = '编辑'; // 恢复 text，下次 exit 切回 visible 时直接显示

  active = state;
}

function handleCancel(state: InlineEditState): void {
  if (state.dirty) {
    if (!confirm('有未保存改动，确认放弃？')) return;
  }
  exitEditMode(state, /* restoreHtml */ true);
}

async function handleSave(state: InlineEditState, toggle: HTMLButtonElement): Promise<void> {
  if (!state.saveBtn) return;
  state.saveBtn.disabled = true;
  state.saveBtn.textContent = '保存中…';

  const result = await patchKp(state.kpId, {
    body: { zh: state.currentBody },
  });

  if (!result.ok) {
    state.saveBtn.disabled = false;
    state.saveBtn.textContent = '保存';
    alert(`保存失败：${result.message}\nreason: ${result.reason}`);
    return;
  }

  // 成功 — 退出编辑态，让浏览器重新拉 partial 渲染最新 body
  state.dirty = false;
  exitEditMode(state, /* restoreHtml */ false);

  // 触发 split-pane partial fetch 刷新当前 KP 视图
  const event = new CustomEvent('inline-edit-saved', { detail: { kpId: state.kpId } });
  document.dispatchEvent(event);

  // 简单 fallback：reload 整页（最稳但 cost split-pane 状态）
  // 改良方案：让 split-pane.js 监听 inline-edit-saved 事件做 partial re-fetch
  // PoC 阶段先 reload，后续优化
  location.reload();
}

/** 入口 — page script 调用一次。document-level click delegation。 */
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

    // v0.11.69: 编辑态时 toggle 被隐藏（display:none），用户点不到。这分支仍保留兜底。
    if (toggle.dataset.active === 'true') {
      if (active) handleCancel(active);
    } else {
      enterEditMode(kpId, toggle);
    }
  });

  // 离开页面前提醒未保存
  window.addEventListener('beforeunload', (e) => {
    if (active?.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// 暴露给 split-pane.js 全局调用（KP swap 前 check）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__inlineEditHasDirty = inlineEditHasDirty;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__inlineEditForceExit = inlineEditForceExit;
