// v0.11.58 KP 锁切换 client
//
// 监听 [data-kp-lock-toggle] click → POST/DELETE /api/kps/:id/lock → reload page
// PC only (>=1024px)；mobile 上按钮已被 CSS pointer-events:none 挡掉，但 JS 也做双保险。
//
// page 三处挂载：
//   - /[discipline]/kp/[id].astro
//   - /[discipline]/[school]/index.astro
//   - /[discipline]/scholars/[key]/index.astro

(function () {
  document.addEventListener('click', async (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const btn = target.closest('[data-kp-lock-toggle]');
    if (!btn) return;

    // 双保险：mobile（<1024px）不响应
    if (!window.matchMedia('(min-width: 1024px)').matches) return;

    if (btn.dataset.locking === '1') return; // 防双击
    const kpId = btn.dataset.kpId;
    if (!kpId) return;

    btn.dataset.locking = '1';
    const wasLocked = btn.classList.contains('is-locked');
    const method = wasLocked ? 'DELETE' : 'POST';

    try {
      const res = await fetch('/api/kps/' + encodeURIComponent(kpId) + '/lock', {
        method,
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) {
        let reason = 'error';
        try {
          const data = await res.json();
          if (data && typeof data.reason === 'string') reason = data.reason;
        } catch {}
        alert((wasLocked ? '解锁' : '锁定') + '失败：' + res.status + ' ' + reason);
        return;
      }
      // 让 head bar SSR 重新渲染（最简单可靠），保留 ?kp= 等查询参数
      window.location.reload();
    } catch (err) {
      alert((wasLocked ? '解锁' : '锁定') + '请求失败：' + err);
    } finally {
      delete btn.dataset.locking;
    }
  });
})();
