// v0.4.2 admin tools — KP 列表项的 ✗ 删除按钮统一处理。
// 编辑✎ 是普通 <a>，浏览器自带跳转无需 JS。
// 假设页面有 [data-kp-delete] 元素，admin gate 已在 server 端通过 Astro.locals.isAdmin 控制 render。

(function () {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-kp-delete]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const id = btn.getAttribute('data-kp-id');
    const title = btn.getAttribute('data-kp-title') ?? id;
    if (!id) return;

    if (!confirm(`确认硬删除 KP「${title}」(${id})？\n\n• 进 git history 可 revert，但需手动\n• ~90 秒后线上消失`)) {
      return;
    }

    btn.disabled = true;
    btn.textContent = '…';
    try {
      // 先 GET 拿 base_sha（避免前端缓存的 sha stale）
      const getRes = await fetch(`/api/edit/kp/${id}`);
      if (!getRes.ok) throw new Error(`GET 失败 ${getRes.status}`);
      const { base_sha } = await getRes.json();
      if (!base_sha) throw new Error('base_sha 为空');

      const delRes = await fetch(`/api/edit/kp/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base_sha }),
      });
      const data = await delRes.json().catch(() => ({}));
      if (!delRes.ok) throw new Error(`${delRes.status} ${data.reason ?? 'error'}: ${String(data.detail ?? '').slice(0, 120)}`);

      // 成功 → 从 UI 移除该 li，并提示
      const li = btn.closest('[data-kp-id]');
      if (li) li.remove();
      alert(`✓ 已删除 KP/${id}\ncommit ${data.commit_sha?.slice(0, 7)}\n约 ${data.deploy_eta_seconds}s 后线上消失`);

      // 如果当前右栏正是被删的 KP，回到列表
      const url = new URL(location.href);
      if (url.searchParams.get('kp') === id) {
        url.searchParams.delete('kp');
        location.replace(url.toString());
      }
    } catch (err) {
      alert(`删除失败：${err instanceof Error ? err.message : String(err)}`);
      btn.disabled = false;
      btn.textContent = '✗';
    }
  });
})();
