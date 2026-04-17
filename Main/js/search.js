// ========== Spotlight 全局搜索 ==========
(function() {
  // 注入 modal DOM（一次性）
  var overlay = document.createElement('div');
  overlay.className = 'spotlight-overlay';
  overlay.id = 'spotlight-overlay';
  overlay.innerHTML =
    '<div class="spotlight-box" onclick="event.stopPropagation()">' +
      '<div class="spotlight-input-wrap">' +
        '<span class="spotlight-icon">🔍</span>' +
        '<input id="spotlight-input" class="spotlight-input" type="text" placeholder="搜索学派、学者、知识点..." spellcheck="false" autocomplete="off">' +
        '<span class="spotlight-esc-hint"><span class="spotlight-kbd">esc</span> 关闭</span>' +
      '</div>' +
      '<div id="spotlight-results" class="spotlight-results"></div>' +
      '<div class="spotlight-footer">' +
        '<div class="spotlight-footer-left">' +
          '<span><span class="spotlight-kbd">↑</span><span class="spotlight-kbd">↓</span> 选择</span>' +
          '<span><span class="spotlight-kbd">↵</span> 打开</span>' +
        '</div>' +
        '<div class="spotlight-footer-right" id="spotlight-count"></div>' +
      '</div>' +
    '</div>';
  overlay.onclick = function(e) { if (e.target === overlay) closeSpotlight(); };
  document.body.appendChild(overlay);

  // 当前选中索引（全局序号：跨所有 section）
  var _slActiveIdx = 0;
  var _slResults = []; // 扁平列表，存 { type, key, id, title, sub, meta, emoji, onOpen }

  var L1_TO_EMOJI = { SM: '📘', OB: '📗', OT: '📙' };

  // 转义正则元字符
  function _slEsc(s) { return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // 高亮 html（安全 escape 再替换）
  function _slHl(text, q) {
    if (!text) return '';
    var esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!q) return esc;
    try {
      var re = new RegExp('(' + _slEsc(q) + ')', 'ig');
      return esc.replace(re, '<mark>$1</mark>');
    } catch(e) { return esc; }
  }
  // 从长文本中摘取含关键词的片段（约 60 字）
  function _slSnippet(body, q) {
    if (!body || !q) return '';
    var plain = String(body).replace(/<[^>]+>/g, '');
    var i = plain.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return '';
    var start = Math.max(0, i - 20);
    var end = Math.min(plain.length, i + q.length + 40);
    var prefix = start > 0 ? '…' : '';
    var suffix = end < plain.length ? '…' : '';
    return prefix + plain.slice(start, end) + suffix;
  }

  // 核心搜索：返回 { schools, scholars, kps }
  // 短查询（< 2 字符）只搜关键标识字段（title/name/en），避免长文本误命中
  function _spotlightSearch(q) {
    q = (q || '').trim();
    var qLower = q.toLowerCase();
    if (!q) return { schools: [], scholars: [], kps: [] };

    // 是否短查询（单字 CJK / ≤2 ASCII）— 避免"五"命中 body 里无数长文本
    var isShort = q.length < 2 || (/^[\x00-\x7f]+$/.test(q) && q.length < 3);
    var schoolFields = isShort ? ['title', 'en', 'ja'] : ['title', 'en', 'ja', 'summary', 'influence'];
    var scholarFields = isShort ? ['name', 'en'] : ['name', 'en', 'nationality', 'affiliation', 'field', 'contribution'];
    var kpSearchBody = !isShort;

    // 学派
    var schools = [];
    if (typeof DATA !== 'undefined') {
      Object.keys(DATA).forEach(function(k) {
        var d = DATA[k];
        if (!d) return;
        var hit = '';
        schoolFields.forEach(function(f) {
          if (!hit && d[f] && String(d[f]).toLowerCase().indexOf(qLower) >= 0) hit = f;
        });
        if (!hit) return;
        schools.push({ key: k, data: d, hitField: hit });
      });
    }

    // 学者
    var scholars = [];
    if (typeof SCHOLARS !== 'undefined') {
      Object.keys(SCHOLARS).forEach(function(k) {
        var s = SCHOLARS[k];
        if (!s) return;
        var hit = '';
        scholarFields.forEach(function(f) {
          if (!hit && s[f] && String(s[f]).toLowerCase().indexOf(qLower) >= 0) hit = f;
        });
        if (!hit) return;
        scholars.push({ key: k, data: s, hitField: hit });
      });
    }

    // KP
    var kps = [];
    if (typeof KNOWLEDGE !== 'undefined') {
      KNOWLEDGE.forEach(function(kn) {
        if (!kn) return;
        var hit = '';
        ['title', 'en'].forEach(function(f) {
          if (!hit && kn[f] && String(kn[f]).toLowerCase().indexOf(qLower) >= 0) hit = f;
        });
        if (!hit && kpSearchBody && kn.body && String(kn.body).toLowerCase().indexOf(qLower) >= 0) hit = 'body';
        // 日文匹配 — DATA_JA 是完整日文文本（含 body），同样不适合短查询
        if (!hit && !isShort && typeof DATA_JA !== 'undefined') {
          var cnKey = kn.title.replace(/([（(][^）)]+[）)][\s]*)+$/, '').trim();
          if (DATA_JA[cnKey] && DATA_JA[cnKey].toLowerCase().indexOf(qLower) >= 0) hit = 'ja';
        }
        if (!hit) return;
        kps.push({ kn: kn, hitField: hit });
      });
    }

    // 排序：标题命中 > 副标题命中 > body
    function rankSchool(r) { return { title: 0, en: 0, ja: 1, summary: 2, influence: 3 }[r.hitField] || 4; }
    function rankScholar(r) { return { name: 0, en: 0, nationality: 2, affiliation: 2, field: 2, contribution: 3 }[r.hitField] || 4; }
    function rankKp(r) { return { title: 0, en: 0, ja: 1, body: 3 }[r.hitField] || 4; }
    schools.sort(function(a, b) { return rankSchool(a) - rankSchool(b); });
    scholars.sort(function(a, b) { return rankScholar(a) - rankScholar(b); });
    kps.sort(function(a, b) { return rankKp(a) - rankKp(b); });

    return {
      schools: schools.slice(0, 8),
      scholars: scholars.slice(0, 8),
      kps: kps.slice(0, 12)
    };
  }

  // 渲染结果面板
  function _spotlightRender(q) {
    var box = document.getElementById('spotlight-results');
    var countEl = document.getElementById('spotlight-count');
    if (!box) return;
    _slResults = [];
    if (!q || !q.trim()) {
      box.innerHTML =
        '<div class="sl-empty">' +
          '<div class="sl-empty-emoji">🔍</div>' +
          '<div>输入关键词搜索学派、学者、知识点</div>' +
          '<div class="sl-empty-hint-grid">' +
            '<div class="sl-empty-hint">💡 支持 <b>中文 / 英文 / 日文</b></div>' +
            '<div class="sl-empty-hint">💡 搜索 <b>标题、作者名、内容</b></div>' +
            '<div class="sl-empty-hint">⌨️ <b>↑↓</b> 选择 · <b>↵</b> 打开</div>' +
            '<div class="sl-empty-hint">⌨️ <b>esc</b> 或点击外部关闭</div>' +
          '</div>' +
        '</div>';
      if (countEl) countEl.textContent = '';
      _slActiveIdx = 0;
      return;
    }
    var r = _spotlightSearch(q);
    var total = r.schools.length + r.scholars.length + r.kps.length;
    if (total === 0) {
      box.innerHTML =
        '<div class="sl-empty">' +
          '<div class="sl-empty-emoji">🌾</div>' +
          '<div>没有匹配 "<strong>' + _slHl(q, null) + '</strong>" 的学派、学者或知识点</div>' +
          '<div style="font-size:11px;color:var(--text-quaternary);margin-top:8px">试试关键词片段、人名或英文名</div>' +
        '</div>';
      if (countEl) countEl.textContent = '';
      return;
    }
    var html = '';
    // 学派
    if (r.schools.length) {
      html += '<div class="sl-section"><div class="sl-section-header">学派 <span class="sl-section-count">' + r.schools.length + '</span></div>';
      r.schools.forEach(function(it) {
        var d = it.data;
        var sub = (d.en || '') + (d.ja ? ' · ' + d.ja : '');
        var cat = _schoolToL1(it.key);
        var meta = cat;
        var idx = _slResults.length;
        _slResults.push({ type: 'school', key: it.key });
        html += '<div class="sl-item" data-idx="' + idx + '">' +
                  '<span class="sl-emoji">🏛</span>' +
                  '<div class="sl-main">' +
                    '<div class="sl-title">' + _slHl(d.title, q) + '</div>' +
                    (sub ? '<div class="sl-sub">' + _slHl(sub, q) + '</div>' : '') +
                  '</div>' +
                  '<span class="sl-meta">' + meta + '</span>' +
                  '<span class="sl-enter-hint"><span class="spotlight-kbd">↵</span></span>' +
                '</div>';
      });
      html += '</div>';
    }
    // 学者
    if (r.scholars.length) {
      html += '<div class="sl-section"><div class="sl-section-header">学者 <span class="sl-section-count">' + r.scholars.length + '</span></div>';
      r.scholars.forEach(function(it) {
        var s = it.data;
        var subParts = [];
        if (s.en) subParts.push(s.en);
        if (s.nationality) subParts.push(s.nationality);
        if (s.affiliation) subParts.push(String(s.affiliation).split(/[；;·、,，]/)[0]);
        var sub = subParts.join(' · ');
        // 学者所属大类：取 schools 第一个推导；若无 schools 则从 KP 反查（昂贵，先简化）
        var firstSchool = (s.schools && s.schools[0]) || '';
        var cat = firstSchool ? _schoolToL1(firstSchool) : '';
        var meta = cat || '';
        var idx = _slResults.length;
        _slResults.push({ type: 'scholar', key: it.key });
        html += '<div class="sl-item" data-idx="' + idx + '">' +
                  '<span class="sl-emoji">👤</span>' +
                  '<div class="sl-main">' +
                    '<div class="sl-title">' + _slHl(s.name, q) + '</div>' +
                    (sub ? '<div class="sl-sub">' + _slHl(sub, q) + '</div>' : '') +
                  '</div>' +
                  (meta ? '<span class="sl-meta">' + meta + '</span>' : '') +
                  '<span class="sl-enter-hint"><span class="spotlight-kbd">↵</span></span>' +
                '</div>';
      });
      html += '</div>';
    }
    // KP
    if (r.kps.length) {
      html += '<div class="sl-section"><div class="sl-section-header">知识点 <span class="sl-section-count">' + r.kps.length + '</span></div>';
      r.kps.forEach(function(it) {
        var kn = it.kn;
        var firstSchool = (kn.schools && kn.schools[0]) || '';
        var cat = firstSchool ? _schoolToL1(firstSchool) : 'OT';
        var emoji = L1_TO_EMOJI[cat] || '📙';
        var schoolName = firstSchool && DATA[firstSchool] ? DATA[firstSchool].title : '';
        var meta = cat + (schoolName ? ' · ' + schoolName : '');
        // body 片段：如果命中 body，显示上下文
        var sub = '';
        if (it.hitField === 'body') {
          sub = _slSnippet(kn.body, q);
        } else {
          sub = kn.en || '';
        }
        var idx = _slResults.length;
        _slResults.push({ type: 'kp', id: kn.id, school: firstSchool });
        html += '<div class="sl-item" data-idx="' + idx + '">' +
                  '<span class="sl-emoji">' + emoji + '</span>' +
                  '<div class="sl-main">' +
                    '<div class="sl-title">' + _slHl(kn.title, q) + '</div>' +
                    (sub ? '<div class="sl-sub">' + _slHl(sub, q) + '</div>' : '') +
                  '</div>' +
                  '<span class="sl-meta">' + meta + '</span>' +
                  '<span class="sl-enter-hint"><span class="spotlight-kbd">↵</span></span>' +
                '</div>';
      });
      html += '</div>';
    }
    box.innerHTML = html;
    if (countEl) countEl.textContent = '共 ' + total + ' 个结果';
    _slActiveIdx = 0;
    _slUpdateActive();
    // 绑定点击
    box.querySelectorAll('.sl-item').forEach(function(el) {
      el.addEventListener('mouseenter', function() {
        _slActiveIdx = parseInt(el.getAttribute('data-idx')) || 0;
        _slUpdateActive();
      });
      el.addEventListener('click', function() {
        _slOpenResult(parseInt(el.getAttribute('data-idx')) || 0);
      });
    });
  }

  function _slUpdateActive() {
    var items = document.querySelectorAll('#spotlight-results .sl-item');
    items.forEach(function(el) { el.classList.remove('active'); });
    var target = document.querySelector('#spotlight-results .sl-item[data-idx="' + _slActiveIdx + '"]');
    if (target) {
      target.classList.add('active');
      // 确保可见
      var rect = target.getBoundingClientRect();
      var box = document.getElementById('spotlight-results');
      var boxRect = box.getBoundingClientRect();
      if (rect.bottom > boxRect.bottom) target.scrollIntoView({ block: 'nearest' });
      else if (rect.top < boxRect.top) target.scrollIntoView({ block: 'nearest' });
    }
  }

  function _slOpenResult(idx) {
    var r = _slResults[idx];
    if (!r) return;
    closeSpotlight();
    setTimeout(function() {
      if (r.type === 'school') {
        if (typeof show === 'function') show(r.key);
      } else if (r.type === 'scholar') {
        if (typeof showScholar === 'function') showScholar(r.key);
      } else if (r.type === 'kp') {
        // 跳到所属学派详情页，宽屏分栏模式下会自动选第一个 KP；简化：先跳学派
        if (r.school && typeof show === 'function') show(r.school);
        // TODO: 后续可以加"定位到该 KP"的逻辑（scroll + 展开）
      }
    }, 50);
  }

  // 打开/关闭
  window.openSpotlight = function() {
    var ov = document.getElementById('spotlight-overlay');
    var inp = document.getElementById('spotlight-input');
    if (!ov || !inp) return;
    ov.classList.add('active');
    inp.value = '';
    _spotlightRender('');
    setTimeout(function() { inp.focus(); }, 50);
  };
  window.closeSpotlight = function() {
    var ov = document.getElementById('spotlight-overlay');
    if (ov) ov.classList.remove('active');
  };

  // 输入监听
  var input = document.getElementById('spotlight-input');
  input.addEventListener('input', function(e) { _spotlightRender(e.target.value); });

  // 键盘导航
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeSpotlight(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_slResults.length === 0) return;
      _slActiveIdx = (_slActiveIdx + 1) % _slResults.length;
      _slUpdateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_slResults.length === 0) return;
      _slActiveIdx = (_slActiveIdx - 1 + _slResults.length) % _slResults.length;
      _slUpdateActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      _slOpenResult(_slActiveIdx);
    }
  });

  // 全局快捷键 Cmd+K / Ctrl+K
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSpotlight();
    }
    // Cmd+J / Ctrl+J：切换当前展开KP的日文/中文
    if ((e.metaKey || e.ctrlKey) && e.key && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      // 排除编辑modal打开时
      if (document.querySelector('.delta-overlay')) return;
      // 分栏模式：右栏的日文按钮
      var jaBtn = document.querySelector('#kp-detail-panel .ja-toggle');
      // 竖屏模式：当前展开的KP的日文按钮
      if (!jaBtn || !jaBtn.offsetParent) jaBtn = document.querySelector('.cn-item.open .ja-toggle');
      if (jaBtn) {
        jaBtn.click();
        // 视觉反馈：按钮闪烁
        jaBtn.style.transition = 'none';
        jaBtn.style.transform = 'scale(1.2)';
        var _jb = jaBtn;
        setTimeout(function() { if (_jb && _jb.parentNode) { _jb.style.transition = 'transform 0.2s'; _jb.style.transform = ''; } }, 100);
      }
    }
  });
})();
