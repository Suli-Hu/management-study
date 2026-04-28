/**
 * just-edited 客户端 (v0.5.91) — 编辑保存后的两个 UX 收尾：
 *
 * 1. **Cooldown 拦截**：编辑后 90 秒内再点同一 KP 的「编辑」按钮 → toast 阻断，
 *    防止"两次连续编辑触发 GitHub Actions 回滚"那个 race（详见 0.5.91 设计讨论）。
 *    机制：localStorage `kp_cooldown_<id>` 存 expires_at；
 *          全局 click capture 抓 `[data-edit-kp-link="<id>"]` anchor → check → 拦截 + toast。
 *
 * 2. **Just-edited 高亮**：保存后跳到 fromPath?just-edited=<id> 时，
 *    页面 load 自动找 `[data-kp-id="<id>"]` 卡 → 注入它自己的 tag 色 →
 *    触发 `is-just-edited` ring 动效 1.6s（CSS keyframes 在 components.css）。
 *    URL ?just-edited param 立刻被 history.replaceState 抹掉，避免刷新重触发。
 */

const COOLDOWN_DURATION_MS = 90_000;
const cooldownKey = (kpId: string) => `kp_cooldown_${kpId}`;

/** 编辑保存成功后由 edit.astro 调，写 cooldown 到 localStorage */
export function setKpCooldown(kpId: string, durationMs = COOLDOWN_DURATION_MS): void {
  try {
    localStorage.setItem(cooldownKey(kpId), String(Date.now() + durationMs));
  } catch {
    // localStorage 满 / 隐私模式 — 静默 fallback，无 cooldown
  }
}

interface CooldownStatus {
  active: boolean;
  remainingSeconds: number;
}

/** 检查某 KP 是否在 cooldown 中。过期 entry 顺手清掉。 */
export function checkKpCooldown(kpId: string): CooldownStatus {
  let raw: string | null = null;
  try { raw = localStorage.getItem(cooldownKey(kpId)); } catch { return { active: false, remainingSeconds: 0 }; }
  const expires = Number(raw);
  if (!expires || Number.isNaN(expires)) return { active: false, remainingSeconds: 0 };
  const remainMs = expires - Date.now();
  if (remainMs <= 0) {
    try { localStorage.removeItem(cooldownKey(kpId)); } catch { /* noop */ }
    return { active: false, remainingSeconds: 0 };
  }
  return { active: true, remainingSeconds: Math.ceil(remainMs / 1000) };
}

/** 全局点击拦截 — 给所有 [data-edit-kp-link="<id>"] anchor 装 cooldown gate */
export function installEditButtonCooldownInterceptor(): void {
  type W = Window & { __editCooldownPatched?: boolean };
  const w = window as W;
  if (w.__editCooldownPatched) return;
  w.__editCooldownPatched = true;

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest<HTMLAnchorElement>('[data-edit-kp-link]');
    if (!anchor) return;
    // 修饰键（Cmd/Ctrl/middle-click）保留浏览器默认行为
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const me = e as MouseEvent;
    if (typeof me.button === 'number' && me.button !== 0) return;

    const kpId = anchor.getAttribute('data-edit-kp-link');
    if (!kpId) return;
    const cd = checkKpCooldown(kpId);
    if (!cd.active) return;

    e.preventDefault();
    e.stopPropagation();
    window.toast?.warning(`改动同步中，还有 ${cd.remainingSeconds}s 后可再次编辑`);
  }, true);
}

/** 页面 load 时读 ?just-edited=<id> → 找卡 → 触发 ring 动效 */
export function highlightJustEditedKp(): void {
  const url = new URL(location.href);
  const justId = url.searchParams.get('just-edited');
  if (!justId) return;

  // 立刻把 query param 抹掉，避免用户刷新页面又触发一次
  url.searchParams.delete('just-edited');
  history.replaceState(null, '', url.toString());

  // 找卡：list 页用 [data-kp-id] 在 <li>；view 页 <main> 自身带 data-kp-id
  const card = document.querySelector<HTMLElement>(`[data-kp-id="${CSS.escape(justId)}"]`);
  if (!card) return;

  // 注入 tag 色到 --tag-color（优先卡上的 data-tag-color，
  // fallback 到已有的 --accent inline，再 fallback 到 quaternary 灰）
  const tagColor =
    card.getAttribute('data-tag-color')
    || card.style.getPropertyValue('--accent')
    || '';
  if (tagColor) card.style.setProperty('--tag-color', tagColor.trim());

  // 滚到可见再触发动效（list 页可能 KP 在折叠区下方）
  card.scrollIntoView({ block: 'center', behavior: 'smooth' });

  // 下一帧加 class，让浏览器先 paint 再启动动画
  requestAnimationFrame(() => {
    card.classList.add('is-just-edited');
    setTimeout(() => card.classList.remove('is-just-edited'), 1700);
  });
}
