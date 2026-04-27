// v0.4.15 shared split-pane JS — 学派页 / 学者页共用
// 页面需准备：
//   - .kp-list-item[data-kp-id]   每个列表项（CSS 自带 .is-active 样式，无需 ring class）
//   - [data-kp-link]               item 里的 <a>（href 指向全页；JS 拦截走 ?kp=X）
//   - [data-kp-link][data-kp-wide-href]  宽屏应去的相对 URL
//   - #kp-detail-pane              右栏容器（server 端按 ?kp= SSR 内容）

// v0.5.8 延迟修复：
//   - is-active toggle 改成 click 时立即执行（之前等 fetch 完成再切，~150ms 延迟）
//   - AbortController 取消上一个未完成的 fetch（快速点击不会卡住）
//   - history.pushState 也立即执行，UI 状态先到位
// v0.5.57 性能：
//   - fetch 用 ?partial=1 → server 跳过左栏/学者重 query（响应 5KB vs 144KB）
//   - LRU 缓存（最多 16 个 KP），重复点击立即 swap 无 fetch
//   - aria-busy="true" + CSS loading bar 给视觉反馈

(function () {
  const PARTIAL_QS = 'partial=1';
  const CACHE_MAX = 16;

  function initSplitPane() {
    const MQ = window.matchMedia('(min-width: 1024px)');
    const detailPane = document.getElementById('kp-detail-pane');
    if (!detailPane) return;

    let inflight = null;          // 当前 AbortController
    const cache = new Map();      // key: pathname + ':' + kpId → fragment HTML（LRU via Map insertion order）

    // 从 URL ?kp= 或 .kp-list-item.is-active 初始化（避免点击当前 KP 时 no-op）
    // v0.5.57: 兼容 school 页的 <li data-kp-id><details class="kp-list-item"> 嵌套
    let activeKpId = new URLSearchParams(location.search).get('kp')
      || document.querySelector('.kp-list-item.is-active')?.closest('[data-kp-id]')?.getAttribute('data-kp-id')
      || null;

    function setActiveImmediate(kpId) {
      if (activeKpId === kpId) return false;
      activeKpId = kpId;
      const url = location.pathname + '?kp=' + encodeURIComponent(kpId);
      // 立即切 active class（用户视觉反馈）— 兼容两种 DOM：
      //   1. scholar 页：<li class="kp-list-item" data-kp-id>
      //   2. school 页：<li data-kp-id><details class="kp-list-item">
      document.querySelectorAll('[data-kp-id]').forEach((wrap) => {
        const target = wrap.classList.contains('kp-list-item')
          ? wrap
          : wrap.querySelector('.kp-list-item');
        if (target) {
          target.classList.toggle('is-active', wrap.getAttribute('data-kp-id') === kpId);
        }
      });
      // 立即更新 URL（按浏览器后退键回到上一个 KP）
      try { history.pushState(null, '', url); } catch (_) {}
      return true;
    }

    function swapPane(html) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const newPane = wrapper.querySelector('#kp-detail-pane');
      if (!newPane) throw new Error('no detail pane in response');
      detailPane.innerHTML = newPane.innerHTML;
      detailPane.scrollTop = 0;
    }

    function cacheKey(kpId) { return location.pathname + ':' + kpId; }
    function rememberInCache(kpId, html) {
      const key = cacheKey(kpId);
      cache.delete(key);             // 删后 set → 移到末尾（LRU 标记 fresh）
      cache.set(key, html);
      while (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
      }
    }

    async function showKpInPane(kpId) {
      // 立即视觉反馈（不等 fetch）
      if (!setActiveImmediate(kpId)) return;

      // 缓存命中：立即 swap，无网络往返
      const cached = cache.get(cacheKey(kpId));
      if (cached) {
        swapPane(cached);
        return;
      }

      // 取消上一个未完成的 fetch
      if (inflight) inflight.abort();
      inflight = new AbortController();
      const url = location.pathname + '?kp=' + encodeURIComponent(kpId) + '&' + PARTIAL_QS;
      detailPane.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch(url, { signal: inflight.signal, headers: { accept: 'text/html' } });
        if (!res.ok) throw new Error('fetch failed: ' + res.status);
        const html = await res.text();
        // 如果在 fetch 期间用户又切到另一个 KP，丢弃这次结果（缓存留着备用）
        rememberInCache(kpId, html);
        if (activeKpId !== kpId) return;
        swapPane(html);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error('[split-pane] showKpInPane failed:', err);
      } finally {
        detailPane.removeAttribute('aria-busy');
      }
    }

    document.querySelectorAll('[data-kp-link]').forEach((a) => {
      if (a.dataset.splitBound) return;
      a.dataset.splitBound = '1';
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        if (!MQ.matches) {
          // v0.5.49 手机端：阻止 navigate 让 <details> 默认 toggle 接管 inline body
          // （之前是 fallback 跳 standalone /kp/[id]，现 inline 展开取代）
          e.preventDefault();
          return;
        }
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
