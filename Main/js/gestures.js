// ===== gestures.js — Touch/drag interactions =====

// ===== 知识点隐藏功能 =====
function _collapseSwipeWrap(id) {
  var wraps = document.querySelectorAll('.cn-swipe-wrap[data-cn-id="' + id + '"]');
  wraps.forEach(function(wrap) {
    var h = wrap.offsetHeight;
    wrap.classList.add('hiding');
    setTimeout(function() {
      wrap.style.height = h + 'px';
      wrap.style.overflow = 'hidden';
      wrap.offsetHeight;
      wrap.style.transition = 'height 0.15s cubic-bezier(0.4,0,1,1), margin 0.15s ease';
      wrap.style.height = '0px';
      wrap.style.marginBottom = '-8px';
      setTimeout(function() { wrap.remove(); }, 160);
    }, 100);
  });
}

// ===== Long-press Drag-and-Drop Reorder =====

function _initDragReorder(container, orderKey) {
  if (!container._dragClickGuard) {
    container._dragClickGuard = true;
    container.addEventListener('click', function(e) {
      if (_drag.suppressClickUntil && Date.now() < _drag.suppressClickUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
  }
  var children = Array.from(container.children);
  children.forEach(function(child) {
    if (child._dragInit) return;
    child._dragInit = true;

    function onDown(clientY, clientX, e) {
      if (_drag.state !== 'idle') return;
      // 阅览模式禁止拖拽调序
      if (document.body.classList.contains('mode-read')) return;
      if (e && e.target && e.target.closest && (e.target.closest('button') || e.target.closest('a') || e.target.closest('.cn-school') || e.target.closest('.ja-toggle'))) return;

      _drag.startY = clientY;
      _drag.startX = clientX;
      _drag.state = 'pending';
      _drag.timer = setTimeout(function() {
        if (_drag.state === 'pending') {
          _startDrag(child, clientX, clientY, container, orderKey);
        }
      }, 500);
    }

    function onMoveEarly(clientY, clientX) {
      if (_drag.state === 'pending') {
        var dx = Math.abs(clientX - _drag.startX);
        var dy = Math.abs(clientY - _drag.startY);
        if (dx > 10 || dy > 10) {
          clearTimeout(_drag.timer);
          _drag.state = 'idle';
        }
      } else if (_drag.state === 'dragging') {
        _moveDrag(clientX, clientY);
      }
    }

    function onUp() {
      if (_drag.state === 'pending') {
        clearTimeout(_drag.timer);
        _drag.state = 'idle';
      } else if (_drag.state === 'dragging') {
        _endDrag();
      }
    }

    child.addEventListener('touchstart', function(e) {
      onDown(e.touches[0].clientY, e.touches[0].clientX, e);
    }, { passive: true });
    child.addEventListener('touchmove', function(e) {
      onMoveEarly(e.touches[0].clientY, e.touches[0].clientX);
      if (_drag.state === 'dragging') e.preventDefault();
    }, { passive: false });
    child.addEventListener('touchend', onUp);

    child.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      onDown(e.clientY, e.clientX, e);
      if (_drag.state !== 'idle') {
        var mm = function(ev) { onMoveEarly(ev.clientY, ev.clientX); };
        var mu = function() { onUp(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
      }
    });
  });
}

function _startDrag(child, startX, startY, container, orderKey) {
  _drag.state = 'dragging';
  _drag.container = container;
  _drag.orderKey = orderKey;
  _drag.flipLock = false;
  document.body.classList.add('dragging-active');

  if (navigator.vibrate) navigator.vibrate(30);

  _drag.items = Array.from(container.children);
  _drag.origIdx = _drag.items.indexOf(child);
  _drag.currentIdx = _drag.origIdx;

  var rect = child.getBoundingClientRect();
  _drag.offsetX = startX - rect.left;
  _drag.offsetY = startY - rect.top;
  var ghost = child.cloneNode(true);
  ghost.className = 'drag-ghost';
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  document.body.appendChild(ghost);
  _drag.ghost = ghost;

  child.classList.add('drag-placeholder');
  _drag.placeholder = child;
}

function _flipReorder(doReorder) {
  var container = _drag.container;
  var children = Array.from(container.children);
  var firstRects = new Map();
  children.forEach(function(c) { firstRects.set(c, c.getBoundingClientRect()); });
  doReorder();
  var newChildren = Array.from(container.children);
  newChildren.forEach(function(c) {
    if (c === _drag.placeholder) return;
    var oldR = firstRects.get(c);
    if (!oldR) return;
    var newR = c.getBoundingClientRect();
    var dx = oldR.left - newR.left;
    var dy = oldR.top - newR.top;
    if (!dx && !dy) return;
    c.style.transition = 'none';
    c.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    requestAnimationFrame(function() {
      c.style.transition = '';
      c.style.transform = '';
    });
  });
}

function _moveDrag(clientX, clientY) {
  if (!_drag.ghost) return;
  var ghostLeft = clientX - _drag.offsetX;
  var ghostTop = clientY - _drag.offsetY;
  _drag.ghost.style.left = ghostLeft + 'px';
  _drag.ghost.style.top = ghostTop + 'px';

  if (_drag.flipLock) return;

  var ghostCenterX = ghostLeft + _drag.ghost.offsetWidth / 2;
  var ghostCenterY = ghostTop + _drag.ghost.offsetHeight / 2;

  var items = Array.from(_drag.container.children);
  var bestIdx = _drag.currentIdx;
  var bestDist = Infinity;
  items.forEach(function(it, i) {
    if (it === _drag.placeholder) return;
    var rr = it.getBoundingClientRect();
    var cx = rr.left + rr.width / 2;
    var cy = rr.top + rr.height / 2;
    var dist = Math.hypot(cx - ghostCenterX, cy - ghostCenterY);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  });

  var phRect = _drag.placeholder.getBoundingClientRect();
  var phCx = phRect.left + phRect.width / 2;
  var phCy = phRect.top + phRect.height / 2;
  var toPhDist = Math.hypot(phCx - ghostCenterX, phCy - ghostCenterY);
  var HYSTERESIS = 24;

  if (bestIdx !== _drag.currentIdx && (toPhDist - bestDist) > HYSTERESIS) {
    _drag.flipLock = true;
    _flipReorder(function() {
      var target = items[bestIdx];
      if (bestIdx > _drag.currentIdx) {
        if (target.nextSibling) {
          _drag.container.insertBefore(_drag.placeholder, target.nextSibling);
        } else {
          _drag.container.appendChild(_drag.placeholder);
        }
      } else {
        _drag.container.insertBefore(_drag.placeholder, target);
      }
    });
    _drag.currentIdx = Array.from(_drag.container.children).indexOf(_drag.placeholder);
    setTimeout(function() { _drag.flipLock = false; }, 300);
  }
}

function _endDrag() {
  if (_drag.ghost && _drag.placeholder) {
    var targetR = _drag.placeholder.getBoundingClientRect();
    var ghost = _drag.ghost;
    ghost.style.transition = 'all 180ms cubic-bezier(0.32, 0.72, 0, 1)';
    ghost.style.left = targetR.left + 'px';
    ghost.style.top = targetR.top + 'px';
    ghost.style.transform = 'scale(1) rotate(0)';
    ghost.style.boxShadow = '0 2px 12px rgba(0,0,0,.06)';
    ghost.style.opacity = '1';
    setTimeout(function() { if (ghost.parentNode) ghost.remove(); }, 200);
    _drag.ghost = null;
  } else if (_drag.ghost) {
    _drag.ghost.remove();
    _drag.ghost = null;
  }
  if (_drag.placeholder) {
    _drag.placeholder.classList.remove('drag-placeholder');
    _drag.placeholder = null;
  }
  document.body.classList.remove('dragging-active');

  var newItems = Array.from(_drag.container.children);
  var ids = newItems.map(function(w) {
    var sw = w.querySelector('.cn-swipe-wrap');
    if (sw) return sw.getAttribute('data-cn-id');
    return w.getAttribute('data-kp-id') || w.getAttribute('data-school-key');
  }).filter(Boolean);

  if (_drag.orderKey && ids.length > 0) {
    if (!window._deltaOrder) window._deltaOrder = {};
    window._deltaOrder[_drag.orderKey] = ids;
    _deltaFetch('/delta/order', { key: _drag.orderKey, ids: ids }).catch(function(err) {
      console.error('Order save failed:', err);
    });
  }

  _drag.suppressClickUntil = Date.now() + 300;

  _drag.state = 'idle';
  _drag.items = [];
  _drag.currentIdx = -1;
  _drag.origIdx = -1;
}

// 右滑手势（触摸 + 鼠标 + 触控板）：露出左侧两个按钮 [删除][编辑]
function _initSwipe(container) {
  var wraps = container.querySelectorAll('.cn-swipe-wrap');
  wraps.forEach(function(wrap) {
    var inner = wrap.querySelector('.cn-swipe-inner');
    var hideBtn = wrap.querySelector('.cn-hide-btn');
    var editBtn = wrap.querySelector('.cn-edit-btn');
    if (!inner || inner._swipeInit) return;
    inner._swipeInit = true;
    var sx = 0, cx = 0, swiping = false, opened = false;
    function _updateBtn(pos) {
      if (!hideBtn) return;
      var ratio = Math.min(pos / 50, 1);
      var sc = 0.7 + 0.3 * ratio;
      var ty = -30 + (-20) * ratio;
      hideBtn.style.opacity = ratio;
      hideBtn.style.transform = 'translateY(' + ty + '%) scale(' + sc + ')';
      hideBtn.style.pointerEvents = ratio > 0.5 ? 'auto' : 'none';
    }
    function _updateEditBtn(pos) {
      if (!editBtn) return;
      var ratio = Math.max(0, Math.min((pos - 50) / 60, 1));
      var sc = 0.7 + 0.3 * ratio;
      var ty = -30 + (-20) * ratio;
      editBtn.style.opacity = ratio;
      editBtn.style.transform = 'translateY(' + ty + '%) scale(' + sc + ')';
      editBtn.style.pointerEvents = ratio > 0.5 ? 'auto' : 'none';
    }
    var sy = 0, dirLocked = false, isVertical = false;
    var OPEN_W = 120;
    function onStart(x, y) {
      sx = x; sy = y; cx = 0; swiping = true; dirLocked = false; isVertical = false;
      wrap.classList.add('swiping');
    }
    function onMove(x, y) {
      if (!swiping || isVertical) return;
      if (!dirLocked) {
        var dx = Math.abs(x - sx);
        var dy = Math.abs(y - sy);
        if (dx < 8 && dy < 8) return;
        dirLocked = true;
        if (dy > dx) { isVertical = true; swiping = false; wrap.classList.remove('swiping'); return; }
      }
      cx = x - sx;
      if (cx < 0) cx = 0;
      if (cx > OPEN_W) cx = OPEN_W;
      inner.style.transition = 'none';
      inner.style.transform = 'translateX(' + cx + 'px)';
      _updateBtn(cx);
      _updateEditBtn(cx);
    }
    function onEnd() {
      swiping = false;
      inner.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
      if (cx > 40) {
        if (_currentOpenedSwipe && _currentOpenedSwipe !== wrap) {
          _currentOpenedSwipe._swipeDismiss();
        }
        inner.style.transform = 'translateX(' + OPEN_W + 'px)';
        opened = true;
        _currentOpenedSwipe = wrap;
        _updateBtn(OPEN_W);
        _updateEditBtn(OPEN_W);
      } else {
        _dismissSmooth(wrap, inner);
        opened = false;
        if (_currentOpenedSwipe === wrap) _currentOpenedSwipe = null;
      }
    }
    function resetSwipe() {
      _dismissSmooth(wrap, inner);
      if (_currentOpenedSwipe === wrap) _currentOpenedSwipe = null;
    }
    function _dismissSmooth(w, inn) {
      inn.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
      inn.style.transform = 'translateX(0)';
      opened = false;
      setTimeout(function() {
        if (hideBtn) {
          hideBtn.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
          hideBtn.style.opacity = '0';
          hideBtn.style.transform = 'translateY(-30%) scale(0.5)';
          hideBtn.style.pointerEvents = 'none';
        }
        if (editBtn) {
          editBtn.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
          editBtn.style.opacity = '0';
          editBtn.style.transform = 'translateY(-30%) scale(0.5)';
          editBtn.style.pointerEvents = 'none';
        }
      }, 50);
      setTimeout(function() {
        w.classList.remove('swiping');
        if (hideBtn) hideBtn.style.transition = '';
        if (editBtn) editBtn.style.transition = '';
      }, 300);
    }
    inner.addEventListener('touchstart', function(e) {
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    inner.addEventListener('touchmove', function(e) {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    inner.addEventListener('touchend', onEnd);
    inner.addEventListener('mousedown', function(e) {
      if (e.target.closest('.cn-school')) return;
      onStart(e.clientX, e.clientY);
      function mm(ev) { onMove(ev.clientX, ev.clientY); }
      function mu() { onEnd(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
    var wPos = 0, wheelTimer = null, wStarted = false;
    wrap.addEventListener('wheel', function(e) {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.2) return;
      e.preventDefault();
      e.stopPropagation();
      if (!wStarted) { wPos = opened ? OPEN_W : 0; wStarted = true; }
      wPos -= e.deltaX * 0.6;
      if (wPos < 0) wPos = 0;
      if (wPos > OPEN_W) wPos = OPEN_W;
      if (wPos > 2) wrap.classList.add('swiping');
      inner.style.transition = 'none';
      inner.style.transform = 'translateX(' + wPos + 'px)';
      if (hideBtn) hideBtn.style.transition = 'none';
      if (editBtn) editBtn.style.transition = 'none';
      _updateBtn(wPos);
      _updateEditBtn(wPos);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function() {
        wStarted = false;
        inner.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
        if (wPos > 40) {
          if (_currentOpenedSwipe && _currentOpenedSwipe !== wrap) _currentOpenedSwipe._swipeDismiss();
          inner.style.transform = 'translateX(' + OPEN_W + 'px)';
          cx = OPEN_W; wPos = OPEN_W; opened = true;
          _currentOpenedSwipe = wrap;
          _updateBtn(OPEN_W);
          _updateEditBtn(OPEN_W);
        } else {
          _dismissSmooth(wrap, inner);
          wPos = 0;
          if (_currentOpenedSwipe === wrap) _currentOpenedSwipe = null;
        }
      }, 120);
    }, { passive: false });
    wrap._swipeDismiss = resetSwipe;
    wrap._swipeIsOpened = function() { return opened; };
    wrap._swipeSetOpened = function(v) { opened = v; };
  });
}

// 全局：点击外部收回
document.addEventListener('click', function(e) {
  if (_currentOpenedSwipe && !_currentOpenedSwipe.contains(e.target)) {
    _currentOpenedSwipe._swipeDismiss();
    _currentOpenedSwipe = null;
  }
});

// ===== 横屏分栏：左栏左边缘右滑返回 =====
(function() {
  var EDGE = 80, THRESHOLD = 0.15;
  var gsx = 0, gsy = 0, gActive = false, gDist = 0, gLocked = false;

  document.addEventListener('touchstart', function(e) {
    if (!document.querySelector('.detail-left')) return;
    var t = e.touches[0];
    if (t.clientX > EDGE) return;
    gsx = t.clientX; gsy = t.clientY;
    gActive = false; gDist = 0; gLocked = false;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!gsx) return;
    var t = e.touches[0];
    var dx = t.clientX - gsx;
    var dy = Math.abs(t.clientY - gsy);
    if (!gLocked) {
      if (dx > 5 && dx > dy * 0.5) {
        gActive = true; gLocked = true;
      } else if (dy > 20 && dy > dx * 3) {
        gsx = 0; gLocked = true; return;
      }
      if (!gActive) return;
    }
    if (!gActive) return;
    e.preventDefault();
    gDist = Math.max(0, dx);
    var view = document.getElementById('view-detail');
    view.style.transition = 'none';
    view.style.transform = 'translateX(' + gDist + 'px)';
    view.style.opacity = 1 - gDist / window.innerWidth * 0.3;
  }, { passive: false });

  document.addEventListener('touchend', function() {
    if (!gActive) { gsx = 0; return; }
    var view = document.getElementById('view-detail');
    var w = window.innerWidth;
    if (gDist > w * THRESHOLD) {
      view.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
      view.style.transform = 'translateX(' + w + 'px)';
      view.style.opacity = '0.5';
      setTimeout(function() {
        view.style.transition = 'none';
        view.style.transform = '';
        view.style.opacity = '';
        goBack();
      }, 260);
    } else {
      view.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
      view.style.transform = '';
      view.style.opacity = '';
    }
    gsx = 0; gActive = false; gDist = 0; gLocked = false;
  });

  // 页面隐藏时重置手势状态
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      if (gActive) {
        var view = document.getElementById('view-detail');
        view.style.transition = 'none';
        view.style.transform = '';
        view.style.opacity = '';
      }
      gsx = 0; gActive = false; gDist = 0; gLocked = false;
    }
  });
})();
