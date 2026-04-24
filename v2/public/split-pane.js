// v0.3.15 shared split-pane JS — 学派页 / 学者页共用
// 页面需准备：
//   - .kp-list-item[data-kp-id]   每个列表项
//   - [data-kp-link]               item 里的 <a>（href 指向全页；JS 拦截走 ?kp=X）
//   - [data-kp-link][data-kp-wide-href]  宽屏应去的相对 URL
//   - #kp-detail-pane              右栏容器（server 端按 ?kp= SSR 内容）
//   - data-active-ring             右栏 active 时额外加的 ring 色 class（默认 'ring-accent-strategy'）

(function () {
  function getActiveRing() {
    const root = document.querySelector('[data-active-ring]');
    return root?.getAttribute('data-active-ring') || 'ring-accent-strategy';
  }

  function initSplitPane() {
    const MQ = window.matchMedia('(min-width: 1024px)');
    const detailPane = document.getElementById('kp-detail-pane');
    if (!detailPane) return;
    const activeRing = getActiveRing();

    async function showKpInPane(kpId) {
      const url = location.pathname + '?kp=' + encodeURIComponent(kpId);
      detailPane.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed: ' + res.status);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const newPane = doc.getElementById('kp-detail-pane');
        if (!newPane) throw new Error('no detail pane in response');
        detailPane.innerHTML = newPane.innerHTML;
        history.pushState(null, '', url);
        document.querySelectorAll('.kp-list-item').forEach((li) => {
          const isActive = li.getAttribute('data-kp-id') === kpId;
          li.classList.toggle('is-active', isActive);
          const a = li.querySelector('[data-kp-link]');
          if (!a) return;
          a.classList.toggle('ring-2', isActive);
          a.classList.toggle(activeRing, isActive);
        });
        const newTitle = doc.querySelector('title')?.textContent;
        if (newTitle) document.title = newTitle;
        detailPane.scrollTop = 0;
      } catch (err) {
        console.error('[split-pane] showKpInPane failed:', err);
      } finally {
        detailPane.removeAttribute('aria-busy');
      }
    }

    document.querySelectorAll('[data-kp-link]').forEach((a) => {
      if (a.dataset.splitBound) return;
      a.dataset.splitBound = '1';
      a.addEventListener('click', (e) => {
        if (!MQ.matches) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        const li = a.closest('[data-kp-id]');
        const id = li?.getAttribute('data-kp-id');
        if (id) showKpInPane(id);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (!MQ.matches) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      const items = Array.from(document.querySelectorAll('.kp-list-item'));
      if (!items.length) return;
      e.preventDefault();
      const current = new URLSearchParams(location.search).get('kp');
      let idx = items.findIndex((el) => el.getAttribute('data-kp-id') === current);
      if (idx < 0) idx = e.key === 'ArrowDown' ? -1 : 0;
      idx += e.key === 'ArrowDown' ? 1 : -1;
      idx = Math.max(0, Math.min(items.length - 1, idx));
      const nextId = items[idx].getAttribute('data-kp-id');
      if (nextId && nextId !== current) {
        showKpInPane(nextId);
        items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });

    if (MQ.matches) {
      const active = document.querySelector('.kp-list-item.is-active');
      active?.scrollIntoView({ block: 'center' });
    }

    window.addEventListener('popstate', () => {
      if (!MQ.matches) return;
      const id = new URLSearchParams(location.search).get('kp');
      if (id) showKpInPane(id);
    });
  }

  initSplitPane();
})();
