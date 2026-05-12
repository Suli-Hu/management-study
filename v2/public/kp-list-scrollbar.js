// v0.11.30 — overlay scrollbar for .split > .left (学派 / 学者 detail 左 aside)
//
// 目标：去掉永远占位的 14px 原生 scrollbar，改为 hover/scroll 才出现的 4-6px 浮动 thumb。
//
// 实现：
//   - 隐藏原生 scrollbar（CSS 已 set scrollbar-width: none + ::-webkit-scrollbar 0）
//   - JS 自绘 <div.kpsb-thumb>，position: absolute on .kpsb-host (sticky top:0 in .left)
//   - 监 mouseenter/mouseleave/scroll，toggle .is-visible (opacity)
//   - thumb 高度 = max(24, ch² / sh)；位置 = scrollRatio * (ch - thumbH - 8)
//   - rAF 节流 scroll；transform: translateY 不触 layout
//   - 顶/底 18px 渐隐遮罩（fade-top sticky 在 tabs 下方 / fade-bottom sticky bottom:0）
//   - 触屏（pointer: coarse）跳过整个逻辑，走原生
//
// Scope：仅 .split > .left。其他滚动容器不动。

(function () {
  // Touch device → skip, use native
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

  function init() {
    const left = document.querySelector('.split > .left');
    if (!left) return;

    // Thumb host: sticky in .left's scroll viewport, 0 height, hosts absolute thumb
    // v0.11.32 fix: 必须 prepend（不能 append），sticky top:0 才会粘在 viewport 顶
    // append 到末尾 → sticky 元素自然位置在 content 底，scrollTop=0 时它在 viewport 之下
    // → sticky 不触发 → thumb 渲染在 content 底（bug 现象）
    const host = document.createElement('div');
    host.className = 'kpsb-host';
    const thumb = document.createElement('div');
    thumb.className = 'kpsb-thumb';
    host.appendChild(thumb);

    // Fade masks
    const fadeTop = document.createElement('div');
    fadeTop.className = 'kpsb-fade-top';
    const fadeBottom = document.createElement('div');
    fadeBottom.className = 'kpsb-fade-bottom';

    left.prepend(fadeTop);
    left.prepend(host);             // host 在最前（z-index 5 在 fadeTop 上）
    left.appendChild(fadeBottom);   // bottom fade 反过来 — 必须在 content 末，sticky bottom:0 才生效

    let rafId = null;
    let hideTimer = null;

    function update() {
      rafId = null;
      const sh = left.scrollHeight;
      const ch = left.clientHeight;
      const st = left.scrollTop;

      if (sh <= ch + 1) {
        // No overflow → no scrollbar / no fades
        thumb.style.display = 'none';
        fadeTop.classList.remove('is-visible');
        fadeBottom.classList.remove('is-visible');
        return;
      }
      thumb.style.display = '';

      const thumbH = Math.max(24, (ch * ch) / sh);
      const trackH = ch - thumbH - 8; // 4px top + 4px bottom inset
      const scrollable = sh - ch;
      const ratio = scrollable > 0 ? st / scrollable : 0;
      const ty = 4 + ratio * trackH;

      thumb.style.height = thumbH + 'px';
      thumb.style.transform = 'translateY(' + ty + 'px)';

      // Fade masks
      if (st > 4) fadeTop.classList.add('is-visible');
      else fadeTop.classList.remove('is-visible');

      if (st < scrollable - 4) fadeBottom.classList.add('is-visible');
      else fadeBottom.classList.remove('is-visible');
    }

    function schedule() {
      if (rafId == null) rafId = requestAnimationFrame(update);
    }

    function showHover() {
      thumb.classList.add('is-visible');
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
    function hideAfterDelay(ms) {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        thumb.classList.remove('is-visible');
        hideTimer = null;
      }, ms);
    }

    left.addEventListener('mouseenter', showHover);
    left.addEventListener('mouseleave', function () {
      hideAfterDelay(600);
    });
    left.addEventListener(
      'scroll',
      function () {
        schedule();
        thumb.classList.add('is-visible');
        hideAfterDelay(1200);
      },
      { passive: true },
    );

    if (window.ResizeObserver) {
      new ResizeObserver(schedule).observe(left);
    }
    window.addEventListener('resize', schedule);

    // Tab switch (admin clicks 代表学者 / 核心概念) changes scrollHeight
    left.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.optA-tab-btn')) {
        setTimeout(schedule, 50);
      }
    });

    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
