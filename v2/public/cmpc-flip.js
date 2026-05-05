/**
 * cmpc-flip.js — compare cards 翻转 / 展开交互 (v0.8.28)
 *
 * - PC (≥1024px): click .cmpc-card.is-flippable → 切 .is-flipped → CSS 3D flip
 * - mobile (<1024px): 同样 click 切 .is-flipped → CSS max-height expand
 * - 键盘: Enter / Space 等价 click (.cmpc-card 自带 role=button + tabindex=0)
 * - 第二次点同卡 → 翻回 / 收起；点别的卡 → 老卡自动收起，新卡展开
 *
 * 同时存在 split-pane fetch swap (右栏 KP 切换重渲染) 时需重新绑事件 — 用
 * event delegation 挂 document 上，免重绑。
 */
(function () {
  function toggleCard(card) {
    if (!card || !card.classList.contains('is-flippable')) return;
    var willOpen = !card.classList.contains('is-flipped');
    // 同一 grid 里只允许一张卡翻开，避免视觉混乱
    var grid = card.closest('.cmpc-grid');
    if (grid && willOpen) {
      grid.querySelectorAll('.cmpc-card.is-flipped').forEach(function (other) {
        if (other !== card) {
          other.classList.remove('is-flipped');
          other.setAttribute('aria-expanded', 'false');
        }
      });
    }
    card.classList.toggle('is-flipped', willOpen);
    card.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  document.addEventListener('click', function (e) {
    var card = e.target && e.target.closest && e.target.closest('.cmpc-card.is-flippable');
    if (!card) return;
    e.preventDefault();
    toggleCard(card);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target && e.target.closest && e.target.closest('.cmpc-card.is-flippable');
    if (!card) return;
    e.preventDefault();
    toggleCard(card);
  });
})();
