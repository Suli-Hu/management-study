/**
 * 全站更新感知 (v0.5.92) — 浏览中检测到 D1 数据更新时弹 toast。
 *
 * 场景：你正打开站点浏览，learning agent 在另一个 worktree push 了新 KP →
 *       触发 /api/sync-kp-from-git → D1 更新 + sync_log 写一条 'partial_sync'。
 *       这个 watcher 30s/次 polling /api/sync-status，发现 latest_ran_at 比
 *       页面 load 时刻新 → toast.info「内容已更新，刷新查看」。
 *
 * 实现细节：
 *   - baseline = mount 时刻（包括 SSR 数据有效的最远点）
 *   - polling 用 visibilitychange 暂停（tab 隐藏时不查）
 *   - 触发 toast 后把 baseline 推到 latest_ran_at，避免重复弹
 *   - 用户点 toast → location.reload()
 *
 * 注意：
 *   - 自己 admin 编辑保存的更新跳到新页（baseline 重置），不会自我 toast
 *   - GH Actions 全量 sync (status='success') 也会 trigger，但代码 push 的
 *     场景较少，且用户能 dismiss
 */

const POLL_INTERVAL_MS = 30_000;

interface SyncStatus {
  latest_ran_at: string | null;
  latest_commit_sha: string | null;
}

let baseline: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let mounted = false;

async function fetchStatus(): Promise<SyncStatus | null> {
  try {
    const res = await fetch('/api/sync-status', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as SyncStatus;
  } catch {
    return null;
  }
}

async function tick(): Promise<void> {
  if (!mounted) return;
  // tab 隐藏时不 polling
  if (document.visibilityState === 'hidden') {
    schedule();
    return;
  }
  const s = await fetchStatus();
  if (s?.latest_ran_at && baseline && s.latest_ran_at > baseline) {
    showUpdateToast();
    // 推 baseline，避免下个 tick 又触发同一更新
    baseline = s.latest_ran_at;
  }
  schedule();
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, POLL_INTERVAL_MS);
}

function showUpdateToast(): void {
  const t = window.toast;
  if (!t) return;
  // info 类型 + 较长显示时间，让用户能注意到 + 点击
  t.info('站点内容已更新，点这里刷新', { duration: 8000 });
  // 让 toast 整条变可点 — 找到当前 toast 加 click handler reload
  // 单一替换策略下当前 toast 一定是这条，找最近的 .app-toast
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('.app-toast');
    if (!el) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      // 别把点 × 也算成 reload
      if ((e.target as HTMLElement).closest('.app-toast-x')) return;
      location.reload();
    });
  });
}

export function mountUpdateWatcher(): void {
  if (mounted) return;
  mounted = true;
  // baseline = 当前时刻 ISO（页面 load 后 SSR 数据已经渲染过了，
  // 此刻之前的所有 sync 都已生效）
  baseline = new Date().toISOString();
  schedule();

  // tab 切回前台时立刻 check 一次（不用等 30s）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mounted) {
      if (timer) clearTimeout(timer);
      tick();
    }
  });
}
