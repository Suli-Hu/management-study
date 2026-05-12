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
          // v0.5.59 手机端 KP 点击修复：
          // 此前 e.preventDefault() 后假设 <summary> 自身的 details-toggle 默认行为
          // 会接管 → 但 preventDefault 标记会冒泡到 <summary>，UA 检查 defaultPrevented
          // 后跳过 toggle，于是「navigate 与 toggle 都被吃掉」=> 用户体感「点不开」。
          //   - 学派页（<details><summary><a>）：手动 toggle details.open
          //   - 学者页（无 <details>）：保留 navigate，让 <a> 默认行为打开 standalone /kp/[id]
          const details = a.closest('details');
          if (details) {
            e.preventDefault();
            details.open = !details.open;
          }
          return;
        }
        e.preventDefault();
        const li = a.closest('[data-kp-id]');
        const id = li?.getAttribute('data-kp-id');
        if (id) showKpInPane(id);
      });
    });

    // v0.5.62 键位语义重排：
    //   ←/→  切 KP（前一/后一，到头/到尾即停，不循环）
    //   ↑/↓  滚右栏 detailPane（KP 阅读区），不再切 KP
    //
    // v0.5.63 修两 bug：
    //   1) 选择器：`.kp-list-item` 在 school 页是 <details>，没有 data-kp-id（在 <li> 父上）→
    //      getAttribute 返回 null。改用 `.left [data-kp-id]` 直接抓 <li>。
    //   2) current source：以前用 URLSearchParams ?kp=（首次进页 URL 里没 ?kp=）→
    //      curIdx=-1，baseIdx=-1，next=0，但 activeKpId 内部已是 items[0].id →
    //      setActiveImmediate 走 early-return → 无反应。改用 closure activeKpId（真源）。
    //
    // v0.11.24 双排 KP list 适配：
    //   - 1-col (.optA-kps grid-template-columns = "1fr") → 原行为不变（←→ 切, ↑↓ 滚）
    //   - 2-col (.optA-kps grid-template-columns = "1fr 1fr") → ←→↑↓ 2D 导航
    //   - Shift+↑↓ 任意模式下都滚右栏（2-col 模式下 ↑↓ 已被切卡占用）
    //   - colCount 通过 getComputedStyle 实时读，CSS @media 切换 / 屏幕缩放都跟得上
    document.addEventListener('keydown', (e) => {
      if (!MQ.matches) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

      const isArrow =
        e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp'   || e.key === 'ArrowDown';
      if (!isArrow) return;

      // Shift + ↑↓ → 任意模式都滚右栏（修饰键优先于切卡）
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (!detailPane) return;
        e.preventDefault();
        detailPane.scrollBy({ top: e.key === 'ArrowDown' ? 80 : -80, behavior: 'smooth' });
        return;
      }

      const items = Array.from(document.querySelectorAll('.left [data-kp-id]'));
      if (!items.length) return;

      // 实时探 list 列数；CSS @media 切换 / 拉宽窗口都能跟上
      const list = items[0].parentElement;
      const tmpl = list ? getComputedStyle(list).gridTemplateColumns : '';
      const colCount = tmpl ? tmpl.split(' ').filter((s) => s.trim()).length : 1;

      // 1-col + ↑↓ → 原 prod 行为：滚右栏
      if (colCount <= 1 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (!detailPane) return;
        e.preventDefault();
        detailPane.scrollBy({ top: e.key === 'ArrowDown' ? 80 : -80, behavior: 'smooth' });
        return;
      }

      // 切 KP 导航
      const curIdx = items.findIndex((el) => el.getAttribute('data-kp-id') === activeKpId);
      const baseIdx = curIdx < 0 ? 0 : curIdx;
      let next = -1;

      if (colCount > 1) {
        // 2D grid nav（DOM 顺序 = 左到右、上到下）
        const col = baseIdx % colCount;
        if (e.key === 'ArrowLeft'  && col > 0)                                    next = baseIdx - 1;
        else if (e.key === 'ArrowRight' && col < colCount - 1 && baseIdx + 1 < items.length) next = baseIdx + 1;
        else if (e.key === 'ArrowUp'    && baseIdx - colCount >= 0)               next = baseIdx - colCount;
        else if (e.key === 'ArrowDown'  && baseIdx + colCount < items.length)     next = baseIdx + colCount;
      } else {
        // 1-col linear nav（←→）
        if (e.key === 'ArrowLeft'  && baseIdx > 0)              next = baseIdx - 1;
        else if (e.key === 'ArrowRight' && baseIdx + 1 < items.length) next = baseIdx + 1;
      }

      if (next < 0 || next >= items.length) return; // 边界 no-op
      const nextId = items[next].getAttribute('data-kp-id');
      if (!nextId || nextId === activeKpId) return;
      e.preventDefault();
      showKpInPane(nextId);
      items[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
