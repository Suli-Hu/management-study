/**
 * v0.5.79 Lang toggle in-place swap
 *
 * 旧行为：lang-toggle <a href="?lang=ja"> 全页面 nav → 滚动位置 / open <details> 全丢。
 * 新行为：拦截 click → fetch 目标 URL → 解析 → 选择性 replaceInner，保留：
 *   - window.scrollY（不动）
 *   - 左栏 <details>open 状态（只换 .optA-kp-inline-body 内层）
 *   - 右栏 #kp-detail-pane scrollTop（手动捕获 + 恢复）
 *   - 右栏选中的 KP（URL ?kp= 不变）
 *
 * Selectors 替换清单：
 *   1. detailPane（学派/学者）：#kp-detail-pane .kp-pane-content innerHTML
 *      KP standalone：<main> innerHTML
 *   2. 左栏每个 [data-kp-id] .optA-kp-inline-body innerHTML
 *   3. [data-scholar-contribution] innerHTML（学者页 contribution tab）
 *   4. 同步所有 a[data-lang-toggle] 的 href / 文本 / aria-pressed
 *   5. 同步 [data-lang-fab] 的 face（中/日 + is-ja class）
 *
 * 触发路径：
 *   - 用户点 lang-toggle anchor — 文档级 capture click 拦截
 *   - FAB 点 — FAB 内部委托 anchor.click()，会被同一拦截器捕获
 *   - Cmd+J — 各页脚本调 anchor.click()，同上
 *   → 所有路径都经此函数，不用每个 caller 改代码
 *
 * popstate（浏览器前进 / 后退）：用 URL 当真源再 swap 一次，保 URL ↔ DOM 一致。
 */

let inflight: AbortController | null = null;

async function fetchAndSwap(targetUrl: string): Promise<void> {
  if (inflight) inflight.abort();
  inflight = new AbortController();

  const res = await fetch(targetUrl, {
    credentials: 'same-origin',
    headers: { accept: 'text/html' },
    signal: inflight.signal,
  });
  if (!res.ok) throw new Error('fetch failed: ' + res.status);
  const html = await res.text();

  const newDoc = new DOMParser().parseFromString(html, 'text/html');
  const detailPane = document.querySelector<HTMLElement>('#kp-detail-pane');
  const detailScroll = detailPane?.scrollTop ?? 0;

  if (detailPane) {
    // 学派 / 学者：右栏内容
    const cur = detailPane.querySelector('.kp-pane-content');
    const next = newDoc.querySelector('#kp-detail-pane .kp-pane-content');
    if (cur && next) cur.innerHTML = next.innerHTML;
  } else {
    // KP standalone：整个 <main>（无 <details>，安全）
    const cur = document.querySelector('main');
    const next = newDoc.querySelector('main');
    if (cur && next) cur.innerHTML = next.innerHTML;
  }

  // 左栏 inline body（只换内层，<details> 父节点 + open 属性 + <summary> 不动）
  document.querySelectorAll<HTMLElement>('[data-kp-id]').forEach((li) => {
    const id = li.dataset.kpId;
    if (!id) return;
    const cur = li.querySelector('.optA-kp-inline-body');
    const next = newDoc.querySelector(`[data-kp-id="${CSS.escape(id)}"] .optA-kp-inline-body`);
    if (cur && next) cur.innerHTML = next.innerHTML;
  });

  // 学者页 contribution
  document.querySelectorAll('[data-scholar-contribution]').forEach((cur) => {
    const next = newDoc.querySelector('[data-scholar-contribution]');
    if (next) cur.innerHTML = next.innerHTML;
  });

  // 同步 lang-toggle anchor（href / 文本 / state class）
  document.querySelectorAll<HTMLAnchorElement>('a[data-lang-toggle]').forEach((cur) => {
    const next = newDoc.querySelector<HTMLAnchorElement>('a[data-lang-toggle]');
    if (!next) return;
    const href = next.getAttribute('href');
    if (href) cur.setAttribute('href', href);
    cur.textContent = next.textContent;
    const ariaPressed = next.getAttribute('aria-pressed');
    if (ariaPressed !== null) cur.setAttribute('aria-pressed', ariaPressed);
    cur.classList.toggle('is-active', next.classList.contains('is-active'));
  });

  // 同步 contribution tab 里的 lang-link（学者页）
  document.querySelectorAll<HTMLAnchorElement>('.optA-lang-link').forEach((cur) => {
    const next = newDoc.querySelector<HTMLAnchorElement>('.optA-lang-link');
    if (!next) return;
    const href = next.getAttribute('href');
    if (href) cur.setAttribute('href', href);
    cur.textContent = next.textContent;
  });

  // 同步 FAB face
  const fab = document.querySelector<HTMLElement>('[data-lang-fab]');
  if (fab) {
    const newFab = newDoc.querySelector<HTMLElement>('[data-lang-fab]');
    if (newFab) {
      const nowJa = newFab.getAttribute('aria-pressed') === 'true';
      fab.classList.toggle('is-ja', nowJa);
      fab.setAttribute('aria-pressed', nowJa ? 'true' : 'false');
      fab.textContent = nowJa ? '日' : '中';
    }
  }

  if (detailPane) detailPane.scrollTop = detailScroll;
}

async function toggleLangInPlace(): Promise<void> {
  const url = new URL(location.href);
  const isJa = url.searchParams.get('lang') === 'ja';
  if (isJa) url.searchParams.delete('lang');
  else url.searchParams.set('lang', 'ja');
  const targetUrl = url.toString();

  document.body.dataset.langSwapping = '1';
  try {
    await fetchAndSwap(targetUrl);
    history.pushState(null, '', targetUrl);
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return;
    console.error('[lang-toggle] in-place failed, fallback to full nav', err);
    location.href = targetUrl;
  } finally {
    delete document.body.dataset.langSwapping;
  }
}

export function installLangToggleClickHook(): void {
  // dedupe — Layout 的 module script 只 import 一次，但保险
  type W = Window & { __langTogglePatched?: boolean };
  const w = window as W;
  if (w.__langTogglePatched) return;
  w.__langTogglePatched = true;

  // capture 阶段拦截，跑在 anchor 默认 nav 之前
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const a = target.closest<HTMLAnchorElement>('a[data-lang-toggle]');
      if (!a) return;
      // 修饰键（Cmd / Ctrl / middle-click）保留浏览器默认行为（新标签页）
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const me = e as MouseEvent;
      if (typeof me.button === 'number' && me.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      void toggleLangInPlace();
    },
    true,
  );

  // 浏览器前进 / 后退也保 URL ↔ DOM 一致
  window.addEventListener('popstate', () => {
    fetchAndSwap(location.href).catch((err) => {
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error('[lang-toggle] popstate sync failed', err);
    });
  });
}
