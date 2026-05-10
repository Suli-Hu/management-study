/**
 * cmpc-flip.js — 卡片翻转 / 展开交互 (v0.8.28; v0.8.33 扩到 quad cell)
 *
 * 目标元素：任何带 [data-flippable] 属性的卡（compare cards 的 .cmpc-card.is-flippable
 * 或 quad 的 .quad-cell.is-flippable）。renderer 自己决定哪些 cell 加该属性。
 *
 * 行为：
 * - PC (≥1024px): click → 切 .is-flipped → CSS 3D flip
 * - mobile (<1024px): 同样 click 切 .is-flipped → CSS max-height expand
 * - Enter / Space 等价 click（卡片自带 role=button + tabindex=0）
 * - 第二次点同卡 → 翻回 / 收起
 * - compare (.cmpc-grid)：多张可同时翻面，便于左右对照
 * - quad (.quad-grid)：同 grid 仍互斥，避免四格同时展开过长
 *
 * 同时存在 split-pane fetch swap (右栏 KP 切换) 时需重新绑事件 — 用 event delegation
 * 挂 document 上，免重绑。
 *
 * v0.8.33 重构：从 .cmpc-card.is-flippable 选择器改成 [data-flippable] 通用属性，
 * compare 和 quad 共用此脚本。文件名保留 cmpc-flip.js 防 CDN cache 失效 404。
 */
(function () {
  function flippableTarget(e) {
    return e && e.target && e.target.closest && e.target.closest('[data-flippable]');
  }

  function toggleCard(card) {
    if (!card) return;
    var willOpen = !card.classList.contains('is-flipped');
    // 仅 quad 网格互斥；compare 允许多卡同时翻面
    if (willOpen) {
      var quadGrid = card.closest('.quad-grid');
      if (quadGrid) {
        quadGrid.querySelectorAll('[data-flippable].is-flipped').forEach(function (other) {
          if (other !== card) {
            other.classList.remove('is-flipped');
            other.setAttribute('aria-expanded', 'false');
          }
        });
      }
    }
    card.classList.toggle('is-flipped', willOpen);
    card.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  document.addEventListener('click', function (e) {
    var card = flippableTarget(e);
    if (!card) return;
    e.preventDefault();
    toggleCard(card);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = flippableTarget(e);
    if (!card) return;
    e.preventDefault();
    toggleCard(card);
  });
})();
