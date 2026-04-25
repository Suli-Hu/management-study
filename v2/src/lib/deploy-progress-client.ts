/**
 * 编辑器保存成功后等待"GitHub Actions 部署 + D1 sync 完成"的进度反馈
 * （v0.4.22 Pack C M5）
 *
 * 用法：在 form save 成功分支调用 watchDeploy(...)，传 status DOM + 已 commit 信息。
 * 行为：
 *   - 立即显示"⏱ 部署中... (Xs / ~90s)"
 *   - 每 8s polling /api/sync-status，比对 latest_ran_at > savedAt
 *   - 命中 → 显示"✅ 部署完成 X 秒后生效"，停 polling
 *   - 180s 超时 → 显示"⚠️ 还未生效（GitHub Actions 可能延迟），手动确认 https://github.com/.../actions"
 */

interface WatchOpts {
  statusEl: HTMLElement;
  commitSha?: string;
  savedAtIso: string;
  /** 部署超时上限（默认 180s，覆盖 90s 部署 + 60s sync + buffer） */
  timeoutMs?: number;
  /** polling 间隔（默认 8s，避免每秒 hit D1） */
  intervalMs?: number;
}

export function watchDeploy(opts: WatchOpts): { stop: () => void } {
  const { statusEl, commitSha, savedAtIso } = opts;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 8_000;
  const startMs = Date.now();
  const shaShort = commitSha?.slice(0, 7) ?? '?';

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function render(label: string, color: string) {
    const elapsed = Math.round((Date.now() - startMs) / 1000);
    statusEl.innerHTML = `<span style="color:${color}">${label} <code style="opacity:0.7">${shaShort}</code> · ${elapsed}s</span>`;
  }

  async function tick() {
    if (stopped) return;
    const elapsed = Date.now() - startMs;
    if (elapsed > timeoutMs) {
      render('⚠️ 部署超时（>180s），手动查 GitHub Actions', '#FF9500');
      return;
    }
    try {
      const r = await fetch('/api/sync-status', { cache: 'no-store' });
      const d = await r.json() as { latest_ran_at: string | null };
      if (d.latest_ran_at && d.latest_ran_at > savedAtIso) {
        render('✅ 部署 + 同步完成', '#34C759');
        return;
      }
    } catch {
      // 网络闪断，忽略本轮，下个 tick 继续
    }
    render('⏱ 部署中...（每 8s 查一次，~90s 后生效）', '');
    timer = setTimeout(tick, intervalMs);
  }

  render('⏱ 部署中...（每 8s 查一次，~90s 后生效）', '');
  timer = setTimeout(tick, intervalMs);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
