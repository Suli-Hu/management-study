// v0.4.15 shared split-pane JS — 学派页 / 学者页共用
// 页面需准备：
//   - .kp-list-item[data-kp-id]   每个列表项（CSS 自带 .is-active 样式，无需 ring class）
//   - [data-kp-link]               item 里的 <a>（href 指向全页；JS 拦截走 ?kp=X）
//   - [data-kp-link][data-kp-wide-href]  宽屏应去的相对 URL
//   - #kp-detail-pane              右栏容器（server 端按 ?kp= SSR 内容）

(function () {
  function initSplitPane() {
    const MQ = window.matchMedia('(min-width: 1024px)');
    const detailPane = document.getElementById('kp-detail-pane');
    if (!detailPane) return;

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
          // v0.4.15: 不再 toggle ring-2 / activeRing class —— is-active 由 .kp-list-item__link CSS 处理
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
