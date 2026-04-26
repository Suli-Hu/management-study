/**
 * 长按拖动重排（v0.4.26 移植 V1 Main/js/gestures.js _initDragReorder）
 *
 * 行为：
 *   - 长按 500ms（移动 10px 内）触发 → ghost 浮起 + 原位置透明 placeholder
 *   - 拖动跟手 + 检测最近 item + hysteresis（24px）+ flipLock（300ms）防抖
 *   - 落下 → ghost 平滑回落到 placeholder 位置（180ms cubic-bezier(0.32,0.72,0,1)）
 *   - 重排时其他 item 用 FLIP 动画（First-Last-Invert-Play）平滑过渡
 *   - touch + mouse 双轨支持（passive listener 优化）
 *
 * 不同于 V1：
 *   - 模块内 closure state 替代全局 _drag（多个容器并存安全）
 *   - reorder 通过传入的 onReorder callback（不写 fetch URL，调用方决定后端 API）
 *   - getId 由调用方提供（不写死 data-cn-id 等 V1 selector）
 */

interface DragState {
  state: 'idle' | 'pending' | 'dragging';
  timer: ReturnType<typeof setTimeout> | null;
  ghost: HTMLElement | null;
  placeholder: HTMLElement | null;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  currentIdx: number;
  origIdx: number;
  container: HTMLElement | null;
  flipLock: boolean;
  suppressClickUntil: number;
}

export interface DragReorderOpts {
  /** 提取每个 item 的 id（落下后用于上报新顺序） */
  getId: (el: HTMLElement) => string | null;
  /** 排序提交后回调（顺序为新 id 数组） */
  onReorder: (newOrder: string[]) => void | Promise<void>;
  /** 长按触发阈值（默认 500ms） */
  longPressMs?: number;
  /** 移动取消阈值（默认 10px） */
  moveCancelPx?: number;
  /** 邻居最近距离 hysteresis（默认 24px，避免抖动反复 reorder） */
  hysteresisPx?: number;
  /** 跳过长按的元素 selector（如 'a, button, [data-no-drag]'） */
  skipSelector?: string;
}

export function mountDragReorder(container: HTMLElement, opts: DragReorderOpts): { destroy: () => void } {
  const longPressMs = opts.longPressMs ?? 500;
  const moveCancelPx = opts.moveCancelPx ?? 10;
  const hysteresisPx = opts.hysteresisPx ?? 24;
  const skipSelector = opts.skipSelector ?? '';

  const drag: DragState = {
    state: 'idle', timer: null, ghost: null, placeholder: null,
    startX: 0, startY: 0, offsetX: 0, offsetY: 0,
    currentIdx: -1, origIdx: -1, container: null, flipLock: false,
    suppressClickUntil: 0,
  };

  // suppress click 之后避免误触原 item 的链接
  const onClickCapture = (e: MouseEvent) => {
    if (drag.suppressClickUntil && Date.now() < drag.suppressClickUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  container.addEventListener('click', onClickCapture, true);

  // FLIP 让位动画 transition — 用 inline style 强制 transform property（防 Tailwind transition-shadow 覆盖）
  const FLIP_TRANSITION = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)';

  function flipReorder(doReorder: () => void) {
    if (!drag.container) return;
    const children = Array.from(drag.container.children) as HTMLElement[];
    const firstRects = new Map<HTMLElement, DOMRect>();
    children.forEach((c) => firstRects.set(c, c.getBoundingClientRect()));
    doReorder();
    const newChildren = Array.from(drag.container.children) as HTMLElement[];
    newChildren.forEach((c) => {
      if (c === drag.placeholder) return;
      const oldR = firstRects.get(c);
      if (!oldR) return;
      const newR = c.getBoundingClientRect();
      const dx = oldR.left - newR.left;
      const dy = oldR.top - newR.top;
      if (!dx && !dy) return;
      c.style.transition = 'none';
      c.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        c.style.transition = FLIP_TRANSITION;  // inline 优先级 > Tailwind class（transition-shadow）
        c.style.transform = '';
      });
    });
  }

  function moveDrag(clientX: number, clientY: number) {
    if (!drag.ghost || !drag.placeholder || !drag.container) return;
    const ghostLeft = clientX - drag.offsetX;
    const ghostTop = clientY - drag.offsetY;
    drag.ghost.style.left = `${ghostLeft}px`;
    drag.ghost.style.top = `${ghostTop}px`;

    if (drag.flipLock) return;

    const ghostCenterX = ghostLeft + drag.ghost.offsetWidth / 2;
    const ghostCenterY = ghostTop + drag.ghost.offsetHeight / 2;

    const items = Array.from(drag.container.children) as HTMLElement[];
    let bestIdx = drag.currentIdx;
    let bestDist = Infinity;
    items.forEach((it, i) => {
      if (it === drag.placeholder) return;
      const rr = it.getBoundingClientRect();
      const cx = rr.left + rr.width / 2;
      const cy = rr.top + rr.height / 2;
      const dist = Math.hypot(cx - ghostCenterX, cy - ghostCenterY);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    });

    const phRect = drag.placeholder.getBoundingClientRect();
    const phCx = phRect.left + phRect.width / 2;
    const phCy = phRect.top + phRect.height / 2;
    const toPhDist = Math.hypot(phCx - ghostCenterX, phCy - ghostCenterY);

    if (bestIdx !== drag.currentIdx && (toPhDist - bestDist) > hysteresisPx) {
      drag.flipLock = true;
      flipReorder(() => {
        const target = items[bestIdx];
        if (!target || !drag.placeholder || !drag.container) return;
        if (bestIdx > drag.currentIdx) {
          if (target.nextSibling) {
            drag.container.insertBefore(drag.placeholder, target.nextSibling);
          } else {
            drag.container.appendChild(drag.placeholder);
          }
        } else {
          drag.container.insertBefore(drag.placeholder, target);
        }
      });
      drag.currentIdx = Array.from(drag.container.children).indexOf(drag.placeholder!);
      setTimeout(() => { drag.flipLock = false; }, 300);
    }
  }

  function startDrag(child: HTMLElement, startX: number, startY: number) {
    drag.state = 'dragging';
    drag.container = container;
    drag.flipLock = false;
    document.body.classList.add('dragging-active');
    if (navigator.vibrate) navigator.vibrate(30);

    const items = Array.from(container.children) as HTMLElement[];
    drag.origIdx = items.indexOf(child);
    drag.currentIdx = drag.origIdx;

    const rect = child.getBoundingClientRect();
    drag.offsetX = startX - rect.left;
    drag.offsetY = startY - rect.top;

    const ghost = child.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);
    drag.ghost = ghost;

    child.classList.add('drag-placeholder');
    drag.placeholder = child;
  }

  async function endDrag() {
    const placeholder = drag.placeholder;
    const ghost = drag.ghost;
    if (ghost && placeholder) {
      const targetR = placeholder.getBoundingClientRect();
      ghost.style.transition = 'all 180ms cubic-bezier(0.32, 0.72, 0, 1)';
      ghost.style.left = `${targetR.left}px`;
      ghost.style.top = `${targetR.top}px`;
      ghost.style.transform = 'scale(1) rotate(0)';
      ghost.style.boxShadow = '0 2px 12px rgba(0,0,0,.06)';
      ghost.style.opacity = '1';
      setTimeout(() => { if (ghost.parentNode) ghost.remove(); }, 200);
      drag.ghost = null;
    } else if (ghost) {
      ghost.remove();
      drag.ghost = null;
    }
    if (placeholder) {
      placeholder.classList.remove('drag-placeholder');
      drag.placeholder = null;
    }
    document.body.classList.remove('dragging-active');

    const moved = drag.currentIdx !== drag.origIdx;
    const newItems = Array.from(container.children) as HTMLElement[];
    const ids = newItems.map((el) => opts.getId(el)).filter((x): x is string => !!x);

    drag.suppressClickUntil = Date.now() + 300;
    drag.state = 'idle';
    drag.currentIdx = -1;
    drag.origIdx = -1;
    drag.container = null;

    if (moved && ids.length > 0) {
      // fire-and-forget（同 V1）— 不阻塞 endDrag，避免 alert/fetch 卡死手势状态
      Promise.resolve(opts.onReorder(ids)).catch((err) => {
        console.error('[drag-reorder] onReorder failed:', err);
      });
    }
  }

  function cancelPending() {
    if (drag.timer) { clearTimeout(drag.timer); drag.timer = null; }
    drag.state = 'idle';
  }

  // 给每个 child 绑事件
  function attachChildHandlers() {
    Array.from(container.children).forEach((rawChild) => {
      const child = rawChild as HTMLElement & { _dragInit?: boolean };
      if (child._dragInit) return;
      child._dragInit = true;

      function onDown(clientX: number, clientY: number, e: Event) {
        if (drag.state !== 'idle') return;
        // 跳过特定元素（链接 / 按钮 / 用户指定）
        const target = e.target as HTMLElement;
        if (skipSelector && target.closest(skipSelector)) return;
        drag.startX = clientX;
        drag.startY = clientY;
        drag.state = 'pending';
        drag.timer = setTimeout(() => {
          if (drag.state === 'pending') startDrag(child, clientX, clientY);
        }, longPressMs);
      }

      function onMoveEarly(clientX: number, clientY: number) {
        if (drag.state === 'pending') {
          const dx = Math.abs(clientX - drag.startX);
          const dy = Math.abs(clientY - drag.startY);
          if (dx > moveCancelPx || dy > moveCancelPx) cancelPending();
        } else if (drag.state === 'dragging') {
          moveDrag(clientX, clientY);
        }
      }

      function onUp() {
        if (drag.state === 'pending') cancelPending();
        else if (drag.state === 'dragging') endDrag();
      }

      child.addEventListener('touchstart', (e: TouchEvent) => {
        const t = e.touches[0];
        if (t) onDown(t.clientX, t.clientY, e);
      }, { passive: true });
      child.addEventListener('touchmove', (e: TouchEvent) => {
        const t = e.touches[0];
        if (!t) return;
        onMoveEarly(t.clientX, t.clientY);
        if (drag.state === 'dragging') e.preventDefault();
      }, { passive: false });
      child.addEventListener('touchend', onUp);
      child.addEventListener('touchcancel', onUp);

      child.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        onDown(e.clientX, e.clientY, e);
        if (drag.state === 'pending' || drag.state === 'dragging') {
          const mm = (ev: MouseEvent) => onMoveEarly(ev.clientX, ev.clientY);
          const mu = () => {
            onUp();
            document.removeEventListener('mousemove', mm);
            document.removeEventListener('mouseup', mu);
          };
          document.addEventListener('mousemove', mm);
          document.addEventListener('mouseup', mu);
        }
      });
    });
  }
  attachChildHandlers();

  return {
    destroy() {
      container.removeEventListener('click', onClickCapture, true);
      cancelPending();
    },
  };
}
