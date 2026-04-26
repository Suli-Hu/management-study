/**
 * 长按拖动重排 — 支持单容器内 + 多容器跨组（v0.4.30 重构 multi-container）
 *
 * 通过 group 参数把多个 mountDragReorder 调用关联起来：
 *   - 同一 group 共享一个 dragManager 实例（模块层 Map<group, manager>）
 *   - 拖动时 ghost 可在同 group 的所有 container 间移动
 *   - moveDrag 算法 hit-test 全 group containers，选最近 item
 *   - 落下时回调 onReorder(idsByContainer)：返回每个受影响 container 的新 ids
 *
 * 单容器场景：传不同 group key 即可独立。或者省略 group 用 default（互不干扰）。
 *
 * 行为同 V1 _initDragReorder：长按 500ms / move 10px 取消 / hysteresis 24px / flipLock 300ms /
 * FLIP 280ms cubic-bezier(0.32,0.72,0,1) / ghost 落下 180ms
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
  flipLock: boolean;
  suppressClickUntil: number;
  origContainer: HTMLElement | null;       // 起拖容器（用于跨组判断）
  currentContainer: HTMLElement | null;    // placeholder 当前所在容器
  origIdx: number;
}

export interface DragReorderOpts {
  /** 同 group key 的多个 mountDragReorder 调用共享 drag state，可跨容器拖动 */
  group?: string;
  /** 提取 item id（落下后用于上报新顺序） */
  getId: (el: HTMLElement) => string | null;
  /** 提取 container 的标识（跨组拖动需要 — 用于 onReorder 回调里区分容器）。默认用 container 自身。 */
  getContainerKey?: (container: HTMLElement) => string;
  /**
   * 落下回调 —
   *   idsByContainer: Map<containerKey, newIds[]>（只包含受影响的容器，未变的不出现）
   *   moved: 是否实际跨组（fromKey !== toKey）或同组重排（fromKey === toKey 且顺序变）
   */
  onReorder: (
    idsByContainer: Map<string, string[]>,
    movedInfo: { itemId: string; fromKey: string; toKey: string },
  ) => void | Promise<void>;
  longPressMs?: number;
  moveCancelPx?: number;
  hysteresisPx?: number;
  skipSelector?: string;
  /** 长按起点必须在 child 内此 selector 匹配的元素上才触发（如 ≡ handle）。空 = 整个 child 都可起拖 */
  dragHandleSelector?: string;
}

interface ContainerEntry {
  el: HTMLElement;
  opts: DragReorderOpts;
}

interface GroupManager {
  drag: DragState;
  containers: ContainerEntry[];
  globalListenersAttached: boolean;
  /** 落下时的 onReorder 用第一个注册的 opts（同组应行为一致），但用 container.opts.getId 取 id */
}

const FLIP_TRANSITION = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)';

// 模块层 Map：同 group 共享 manager
const groupManagers = new Map<string, GroupManager>();

function getOrCreateManager(group: string): GroupManager {
  let m = groupManagers.get(group);
  if (m) return m;
  m = {
    drag: {
      state: 'idle', timer: null, ghost: null, placeholder: null,
      startX: 0, startY: 0, offsetX: 0, offsetY: 0,
      flipLock: false, suppressClickUntil: 0,
      origContainer: null, currentContainer: null, origIdx: -1,
    },
    containers: [],
    globalListenersAttached: false,
  };
  groupManagers.set(group, m);
  return m;
}

function defaultContainerKey(el: HTMLElement): string {
  return el.dataset.themeKey
    ?? el.dataset.schoolKey
    ?? el.getAttribute('data-reorder-container')
    ?? el.id
    ?? '__default__';
}

function flipReorder(container: HTMLElement, placeholder: HTMLElement | null, doReorder: () => void) {
  const children = Array.from(container.children) as HTMLElement[];
  const firstRects = new Map<HTMLElement, DOMRect>();
  children.forEach((c) => firstRects.set(c, c.getBoundingClientRect()));
  doReorder();
  const newChildren = Array.from(container.children) as HTMLElement[];
  newChildren.forEach((c) => {
    if (c === placeholder) return;
    const oldR = firstRects.get(c);
    if (!oldR) return;
    const newR = c.getBoundingClientRect();
    const dx = oldR.left - newR.left;
    const dy = oldR.top - newR.top;
    if (!dx && !dy) return;
    c.style.transition = 'none';
    c.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      c.style.transition = FLIP_TRANSITION;
      c.style.transform = '';
    });
  });
}

/**
 * 多容器联动 FLIP — 跨组拖动时新旧 container 都要做 First-Last-Invert
 * 调用时 doReorder 会改变 placeholder 在某个 container 中的位置
 */
function flipReorderMulti(containers: HTMLElement[], placeholder: HTMLElement, doReorder: () => void) {
  const allChildren: Array<{ container: HTMLElement; child: HTMLElement; rect: DOMRect }> = [];
  for (const container of containers) {
    Array.from(container.children).forEach((c) => {
      const el = c as HTMLElement;
      allChildren.push({ container, child: el, rect: el.getBoundingClientRect() });
    });
  }
  doReorder();
  for (const { child, rect: oldR } of allChildren) {
    if (child === placeholder) continue;
    const newR = child.getBoundingClientRect();
    const dx = oldR.left - newR.left;
    const dy = oldR.top - newR.top;
    if (!dx && !dy) continue;
    child.style.transition = 'none';
    child.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      child.style.transition = FLIP_TRANSITION;
      child.style.transform = '';
    });
  }
}

function startDrag(mgr: GroupManager, container: HTMLElement, child: HTMLElement, startX: number, startY: number) {
  const drag = mgr.drag;
  drag.state = 'dragging';
  drag.origContainer = container;
  drag.currentContainer = container;
  drag.flipLock = false;
  document.body.classList.add('dragging-active');
  if (navigator.vibrate) navigator.vibrate(30);

  drag.origIdx = Array.from(container.children).indexOf(child);

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

function moveDrag(mgr: GroupManager, clientX: number, clientY: number) {
  const drag = mgr.drag;
  if (!drag.ghost || !drag.placeholder || !drag.currentContainer) return;
  const ghostLeft = clientX - drag.offsetX;
  const ghostTop = clientY - drag.offsetY;
  drag.ghost.style.left = `${ghostLeft}px`;
  drag.ghost.style.top = `${ghostTop}px`;

  if (drag.flipLock) return;

  const ghostCenterX = ghostLeft + drag.ghost.offsetWidth / 2;
  const ghostCenterY = ghostTop + drag.ghost.offsetHeight / 2;

  // 跨容器：找全 group 所有 item，挑离 ghost 中心最近的
  let bestContainer: HTMLElement | null = null;
  let bestItem: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const { el: container } of mgr.containers) {
    Array.from(container.children).forEach((rawC) => {
      const c = rawC as HTMLElement;
      if (c === drag.placeholder) return;
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(cx - ghostCenterX, cy - ghostCenterY);
      if (dist < bestDist) { bestDist = dist; bestItem = c; bestContainer = container; }
    });
  }

  // 还要考虑：ghost 在某个 container 内但 container 内是空的（首次入空 group）
  // hit-test：ghost center 落在某 container 的 bounding rect 内 → 优先考虑
  let hoveredEmptyContainer: HTMLElement | null = null;
  for (const { el: container } of mgr.containers) {
    if (container.children.length > 0) continue;  // 非空容器走上面 best item 算法
    const r = container.getBoundingClientRect();
    if (ghostCenterX >= r.left && ghostCenterX <= r.right && ghostCenterY >= r.top && ghostCenterY <= r.bottom) {
      hoveredEmptyContainer = container;
      break;
    }
  }

  // hysteresis：placeholder 当前位置距 ghost 距离
  const phRect = drag.placeholder.getBoundingClientRect();
  const phCx = phRect.left + phRect.width / 2;
  const phCy = phRect.top + phRect.height / 2;
  const toPhDist = Math.hypot(phCx - ghostCenterX, phCy - ghostCenterY);
  const HYSTERESIS = mgr.containers[0]?.opts.hysteresisPx ?? 24;

  if (hoveredEmptyContainer && hoveredEmptyContainer !== drag.currentContainer) {
    // 拖入空容器
    drag.flipLock = true;
    const oldContainer = drag.currentContainer;
    flipReorderMulti([oldContainer, hoveredEmptyContainer], drag.placeholder, () => {
      hoveredEmptyContainer!.appendChild(drag.placeholder!);
    });
    drag.currentContainer = hoveredEmptyContainer;
    setTimeout(() => { drag.flipLock = false; }, 300);
    return;
  }

  if (!bestItem || !bestContainer) return;
  const bestC: HTMLElement = bestContainer;
  const bestI: HTMLElement = bestItem;

  const sameContainer = bestC === drag.currentContainer;
  const placeholderIdx = Array.from(drag.currentContainer.children).indexOf(drag.placeholder);
  const bestIdx = Array.from(bestC.children).indexOf(bestI);

  // 同容器：hysteresis check（防抖）
  // 跨容器：bestDist < toPhDist 即可（已"决定要换容器"）
  const shouldFlip = sameContainer
    ? (bestIdx !== placeholderIdx && (toPhDist - bestDist) > HYSTERESIS)
    : (bestDist < toPhDist - HYSTERESIS);  // 跨容器需明显更近才触发，防误抖到旁边 group

  if (shouldFlip) {
    drag.flipLock = true;
    const oldContainer = drag.currentContainer;
    flipReorderMulti(
      sameContainer ? [oldContainer] : [oldContainer, bestC],
      drag.placeholder,
      () => {
        if (sameContainer) {
          if (bestIdx > placeholderIdx) {
            if (bestI.nextSibling) {
              drag.currentContainer!.insertBefore(drag.placeholder!, bestI.nextSibling);
            } else {
              drag.currentContainer!.appendChild(drag.placeholder!);
            }
          } else {
            drag.currentContainer!.insertBefore(drag.placeholder!, bestI);
          }
        } else {
          // 跨容器：插到 bestItem 之前
          bestC.insertBefore(drag.placeholder!, bestI);
        }
      },
    );
    if (!sameContainer) drag.currentContainer = bestC;
    setTimeout(() => { drag.flipLock = false; }, 300);
  }
}

async function endDrag(mgr: GroupManager) {
  const drag = mgr.drag;
  const placeholder = drag.placeholder;
  const ghost = drag.ghost;
  const origContainer = drag.origContainer;
  const finalContainer = drag.currentContainer;

  if (ghost && placeholder) {
    const targetR = placeholder.getBoundingClientRect();
    ghost.style.transition = 'all 180ms cubic-bezier(0.32, 0.72, 0, 1)';
    ghost.style.left = `${targetR.left}px`;
    ghost.style.top = `${targetR.top}px`;
    ghost.style.transform = 'scale(1) rotate(0)';
    ghost.style.boxShadow = '0 2px 12px rgba(0,0,0,.06)';
    ghost.style.opacity = '1';
    ghost.style.filter = 'none';  // 恢复压暗（落下确认 = 完整不透明）
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

  drag.suppressClickUntil = Date.now() + 300;
  drag.state = 'idle';

  // 收集结果
  if (origContainer && finalContainer && placeholder) {
    const moved = origContainer !== finalContainer ||
      Array.from(finalContainer.children).indexOf(placeholder) !== drag.origIdx;
    if (moved) {
      const opts = mgr.containers.find((e) => e.el === origContainer)?.opts ?? mgr.containers[0]?.opts;
      if (opts) {
        const getKey = opts.getContainerKey ?? defaultContainerKey;
        const idsByContainer = new Map<string, string[]>();
        const affected = origContainer === finalContainer ? [origContainer] : [origContainer, finalContainer];
        for (const c of affected) {
          const ids = (Array.from(c.children) as HTMLElement[])
            .map((el) => opts.getId(el))
            .filter((x): x is string => !!x);
          idsByContainer.set(getKey(c), ids);
        }
        const itemId = opts.getId(placeholder) ?? '';
        const fromKey = getKey(origContainer);
        const toKey = getKey(finalContainer);
        try {
          await Promise.resolve(opts.onReorder(idsByContainer, { itemId, fromKey, toKey }));
        } catch (err) {
          console.error('[drag-reorder] onReorder failed:', err);
        }
      }
    }
  }

  drag.origContainer = null;
  drag.currentContainer = null;
  drag.origIdx = -1;
}

function attachContainer(mgr: GroupManager, container: HTMLElement, opts: DragReorderOpts) {
  const longPressMs = opts.longPressMs ?? 500;
  const moveCancelPx = opts.moveCancelPx ?? 10;
  const skipSelector = opts.skipSelector ?? '';
  const dragHandleSelector = opts.dragHandleSelector ?? '';

  const onClickCapture = (e: MouseEvent) => {
    if (mgr.drag.suppressClickUntil && Date.now() < mgr.drag.suppressClickUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  container.addEventListener('click', onClickCapture, true);

  Array.from(container.children).forEach((rawChild) => {
    const child = rawChild as HTMLElement & { _dragInit?: boolean };
    if (child._dragInit) return;
    child._dragInit = true;

    child.setAttribute('draggable', 'false');
    child.querySelectorAll('a, img').forEach((el) => el.setAttribute('draggable', 'false'));
    child.addEventListener('dragstart', (e) => e.preventDefault());

    function onDown(clientX: number, clientY: number, e: Event) {
      if (mgr.drag.state !== 'idle') return;
      const target = e.target as HTMLElement;
      if (skipSelector && target.closest(skipSelector)) return;
      // 若指定了 dragHandleSelector，只有点在 handle 上才启动长按 timer
      if (dragHandleSelector && !target.closest(dragHandleSelector)) return;
      mgr.drag.startX = clientX;
      mgr.drag.startY = clientY;
      mgr.drag.state = 'pending';
      mgr.drag.timer = setTimeout(() => {
        if (mgr.drag.state === 'pending') startDrag(mgr, container, child, clientX, clientY);
      }, longPressMs);
    }
    function onMoveEarly(clientX: number, clientY: number) {
      if (mgr.drag.state === 'pending') {
        const dx = Math.abs(clientX - mgr.drag.startX);
        const dy = Math.abs(clientY - mgr.drag.startY);
        if (dx > moveCancelPx || dy > moveCancelPx) {
          if (mgr.drag.timer) clearTimeout(mgr.drag.timer);
          mgr.drag.state = 'idle';
        }
      } else if (mgr.drag.state === 'dragging') {
        moveDrag(mgr, clientX, clientY);
      }
    }
    function onUp() {
      if (mgr.drag.state === 'pending') {
        if (mgr.drag.timer) clearTimeout(mgr.drag.timer);
        mgr.drag.state = 'idle';
      } else if (mgr.drag.state === 'dragging') {
        endDrag(mgr);
      }
    }

    child.addEventListener('touchstart', (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) onDown(t.clientX, t.clientY, e);
    }, { passive: true });
    child.addEventListener('touchmove', (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      onMoveEarly(t.clientX, t.clientY);
      if (mgr.drag.state === 'dragging') e.preventDefault();
    }, { passive: false });
    child.addEventListener('touchend', onUp);
    child.addEventListener('touchcancel', onUp);

    child.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      onDown(e.clientX, e.clientY, e);
      if (mgr.drag.state === 'pending' || mgr.drag.state === 'dragging') {
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

  return () => container.removeEventListener('click', onClickCapture, true);
}

export function mountDragReorder(container: HTMLElement, opts: DragReorderOpts): { destroy: () => void } {
  const groupKey = opts.group ?? `__solo__${Math.random()}`;
  const mgr = getOrCreateManager(groupKey);
  mgr.containers.push({ el: container, opts });
  const detachClick = attachContainer(mgr, container, opts);

  return {
    destroy() {
      detachClick();
      mgr.containers = mgr.containers.filter((e) => e.el !== container);
      if (mgr.containers.length === 0) groupManagers.delete(groupKey);
    },
  };
}
