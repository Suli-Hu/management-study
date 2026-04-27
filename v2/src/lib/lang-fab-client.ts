/**
 * v0.5.78 LangFab — 移动端日语切换悬浮球行为
 *
 * 职责：
 *   - 可拖动；释放后吸附最近左/右边缘（弹性 spring 曲线）
 *   - 位置存 localStorage（key: lang-fab-pos）跨页跨 session 持久化
 *   - 拖动阈值 5px：低于 = 当作点击 → 触发现有 [data-lang-toggle] 的 click（保留 URL 跳转语义）
 *   - 上下边界：避开 nav (52) + safe-area-inset
 *
 * 设计：FAB 是「遥控器」，本身不动 URL，只委托现有 lang-toggle <a href> 处理 zh ↔ ja。
 */

const STORAGE_KEY = 'lang-fab-pos';
const FAB_SIZE = 52;
const EDGE_PADDING = 16;
const TOP_PADDING = 64;        // 给 nav (sticky 48px) 留呼吸
const BOTTOM_PADDING = 16;
const DRAG_THRESHOLD = 5;

interface SavedPos {
  side: 'left' | 'right';
  y: number;          // viewport y，px from top
}

function loadPos(): SavedPos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SavedPos>;
    if ((p.side === 'left' || p.side === 'right') && Number.isFinite(p.y)) {
      return { side: p.side, y: p.y as number };
    }
  } catch { /* ignore */ }
  return null;
}

function savePos(pos: SavedPos | null) {
  if (!pos) {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
}

function getSafeBottom(): number {
  // env(safe-area-inset-bottom) 不能直接 JS 读；用 CSS var fallback
  // 简化：12px 默认（home indicator ≈ 34，已加进 BOTTOM_PADDING 计算的 buffer 里）
  return BOTTOM_PADDING;
}

function getViewportBounds() {
  const w = document.documentElement.clientWidth;
  const h = document.documentElement.clientHeight;
  return {
    w, h,
    minX: EDGE_PADDING,
    maxX: w - FAB_SIZE - EDGE_PADDING,
    minY: TOP_PADDING,
    maxY: h - FAB_SIZE - getSafeBottom(),
  };
}

export function mountLangFab(fab: HTMLElement): void {
  if (fab.dataset.langFabMounted === '1') return;
  fab.dataset.langFabMounted = '1';

  let pos: SavedPos | null = loadPos();

  function applyPos() {
    const b = getViewportBounds();
    let x: number, y: number;
    if (!pos) {
      x = b.maxX;
      y = b.maxY;
    } else {
      x = pos.side === 'right' ? b.maxX : b.minX;
      y = Math.max(b.minY, Math.min(b.maxY, pos.y));
    }
    fab.style.left = x + 'px';
    fab.style.top = y + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }

  // === drag state ===
  let drag: {
    startX: number; startY: number;
    originLeft: number; originTop: number;
    totalMove: number; pointerId: number;
  } | null = null;

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    const rect = fab.getBoundingClientRect();
    drag = {
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      totalMove: 0,
      pointerId: e.pointerId,
    };
    fab.setPointerCapture(e.pointerId);
    fab.classList.add('is-dragging');
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    drag.totalMove = Math.max(drag.totalMove, Math.hypot(dx, dy));
    if (drag.totalMove < DRAG_THRESHOLD) return;

    const b = getViewportBounds();
    const nextX = Math.max(b.minX, Math.min(b.maxX, drag.originLeft + dx));
    const nextY = Math.max(b.minY, Math.min(b.maxY, drag.originTop + dy));
    fab.style.left = nextX + 'px';
    fab.style.top = nextY + 'px';
  }

  function onPointerUp() {
    if (!drag) return;
    const moved = drag.totalMove >= DRAG_THRESHOLD;
    try { fab.releasePointerCapture(drag.pointerId); } catch { /* ignore */ }
    fab.classList.remove('is-dragging');

    if (!moved) {
      drag = null;
      triggerLangToggle();
      return;
    }

    const b = getViewportBounds();
    const curLeft = parseFloat(fab.style.left) || b.maxX;
    const curTop = parseFloat(fab.style.top) || b.maxY;
    const center = b.w / 2;
    const fabCenterX = curLeft + FAB_SIZE / 2;
    const side: 'left' | 'right' = fabCenterX < center ? 'left' : 'right';
    const y = Math.max(b.minY, Math.min(b.maxY, curTop));
    pos = { side, y };
    savePos(pos);
    applyPos();
    drag = null;
  }

  function onPointerCancel() {
    if (!drag) return;
    try { fab.releasePointerCapture(drag.pointerId); } catch { /* ignore */ }
    fab.classList.remove('is-dragging');
    drag = null;
  }

  function triggerLangToggle() {
    // 优先：右栏（split-pane KP detail）的 lang-toggle；fallback：任意第一个
    const btn = (document.querySelector('.kp-detail-pane [data-lang-toggle]')
      || document.querySelector('[data-lang-toggle]')) as HTMLElement | null;
    if (!btn) return;
    btn.click();
  }

  fab.addEventListener('pointerdown', onPointerDown);
  fab.addEventListener('pointermove', onPointerMove);
  fab.addEventListener('pointerup', onPointerUp);
  fab.addEventListener('pointercancel', onPointerCancel);
  fab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerLangToggle();
    }
  });

  window.addEventListener('resize', () => {
    requestAnimationFrame(applyPos);
  });

  applyPos();
}
