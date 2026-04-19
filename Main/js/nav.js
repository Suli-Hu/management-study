// ===== nav.js — Navigation and view management =====

function _pushNav() {
  var dv = document.getElementById("view-detail");
  if (dv.classList.contains("active")) {
    var db = document.getElementById("detail-body");
    _navStack.push({
      html: db.innerHTML,
      scrollTop: dv.scrollTop,
      isSplitPane: db.classList.contains('split-pane'),
      leftScrollTop: db.querySelector('.detail-left') ? db.querySelector('.detail-left').scrollTop : 0
    });
    if (_navStack.length > 10) _navStack.shift();
  } else {
    var vl = document.getElementById("view-list");
    _listState = { scrollTop: vl.scrollTop };
  }
}

function goBack() {
  var db = document.getElementById("detail-body");
  db.classList.remove('split-pane');
  if (_navStack.length > 0) {
    var prev = _navStack.pop();
    db.innerHTML = prev.html;
    if (prev.isSplitPane && window.innerWidth >= 900) {
      db.classList.add('split-pane');
      var firstItem = db.querySelector('.detail-left .cn-item');
      var accent = firstItem ? firstItem.style.getPropertyValue('--accent') : '#8a7a6a';
      _initSplitPaneHandlers(db, accent);
      var leftPane = db.querySelector('.detail-left');
      if (leftPane && prev.leftScrollTop) leftPane.scrollTop = prev.leftScrollTop;
    }
    document.getElementById("view-detail").scrollTop = prev.scrollTop;
  } else {
    _navStack = [];
    document.getElementById("view-detail").classList.remove("active");
    var vl = document.getElementById("view-list");
    vl.classList.add("active");
    if (_listState) {
      vl.scrollTop = _listState.scrollTop;
      _listState = null;
    } else {
      vl.scrollTop = 0;
    }
  }
}

function showScholar(key, skipPushNav) {
  var s = SCHOLARS[key];
  if (!s) return;
  window._curScholarKey = key;
  window._curSchoolKey = null;
  if (!skipPushNav) _pushNav();

  var _scholarSchoolSet = {};
  KNOWLEDGE.forEach(function(kn) {
    if (_knScholars(kn).indexOf(key) >= 0) {
      (kn.schools || []).forEach(function(sKey) {
        if (DATA[sKey] && !_scholarSchoolSet[sKey]) {
          _scholarSchoolSet[sKey] = DATA[sKey].title;
        }
      });
    }
  });
  var schools = Object.keys(_scholarSchoolSet).map(function(sKey) {
    return '<span class="tag tag-link" onclick="show(\'' + sKey + '\')">' + _scholarSchoolSet[sKey] + '</span>';
  }).join("");

  var ac = _scholarAccent(s);
  var accentBg = ac + "14";
  var html =
    '<div class="scholar-hero" style="display:flex;align-items:stretch;gap:0;margin-bottom:24px;background:#fff;border:1px solid #e4e0d8;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05);position:relative">'
    + '<div style="width:5px;flex-shrink:0;background:' + ac + '"></div>'
    + '<div style="padding:20px 22px;flex:1;position:relative">'
    +   '<button class="scholar-edit-btn" onclick="openEditScholar(\'' + key + '\')" title="\u7F16\u8F91\u5B66\u8005">'
    +     '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    +   '</button>'
    +   '<div class="badge" style="border-color:' + ac + ';color:' + ac + ';background:' + accentBg + '">' + s.field + '</div>'
    +   '<div class="d-title">' + _escapeHtml(s.name) + '</div>'
    +   '<div class="d-en">' + s.en + '</div>'
    +   (s.ja ? '<div class="d-ja">' + s.ja + '</div>' : '')
    + '</div>'
    + '</div>'
    + '<div class="sec-title">基本信息</div>'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:13px">'
    + '<tr><td style="padding:8px 0;color:#b8b0a4;width:80px;vertical-align:top">生卒年</td><td style="padding:8px 0;color:#3a3830;line-height:1.6">' + s.born + (s.died ? ' — ' + s.died : '') + '</td></tr>'
    + '<tr style="border-top:1px solid #f0ede6"><td style="padding:8px 0;color:#b8b0a4;vertical-align:top">国籍</td><td style="padding:8px 0;color:#3a3830">' + (s.flag ? s.flag + '\u2002' : '') + s.nationality + '</td></tr>'
    + '<tr style="border-top:1px solid #f0ede6"><td style="padding:8px 0;color:#b8b0a4;vertical-align:top">出身/籍贯</td><td style="padding:8px 0;color:#3a3830">' + s.origin + '</td></tr>'
    + (s.nobel ? '<tr style="border-top:1px solid #f0ede6"><td style="padding:8px 0;color:#b8b0a4;vertical-align:top">获奖</td><td style="padding:8px 0;color:#b07d20;font-weight:500">' + s.nobel + '</td></tr>' : '')
    + '<tr style="border-top:1px solid #f0ede6"><td style="padding:8px 0;color:#b8b0a4;vertical-align:top">主要任职</td><td style="padding:8px 0;color:#3a3830;line-height:1.6">' + s.affiliation + '</td></tr>'
    + '</table>'
    + (function(){
        var knForScholar = KNOWLEDGE.filter(function(kn) { return _knScholars(kn).indexOf(key) >= 0; });
        if (!knForScholar.length) {
          return '<div class="sec-title">代表理论<button class="kp-add-btn" onclick="openAddModal(\'kp\',{scholar:\'' + key.replace(/'/g, "\\'") + '\'})" title="新增知识点">+ 新增</button></div>'
            + '<div style="padding:20px;text-align:center;color:var(--text-quaternary);font-size:12px;margin-bottom:20px">该学者下没有知识点</div>'
            + '<div style="text-align:center;margin-bottom:20px"><button onclick="deltaDeleteScholar(\'' + key + '\',\'' + (s.name || key).replace(/\'/g, "\\\\\'") + '\')" style="padding:8px 24px;border-radius:8px;border:1px solid #FF3B30;background:transparent;color:#FF3B30;font-size:12px;font-weight:var(--weight-semibold);cursor:pointer;transition:background .15s">删除该学者</button></div>'
            + '<hr class="divider">';
        }
        return '<div class="sec-title">代表理论<button class="kp-add-btn" onclick="openAddModal(\'kp\',{scholar:\'' + key.replace(/'/g, "\\'") + '\'})" title="新增知识点">+ 新增</button></div><ul class="concepts" id="scholar-theories-list" style="margin-bottom:20px">'
          + knForScholar.map(function(kn, idx) {
              return renderKnowledgeItem({
                title: _knFullTitle(kn),
                body: kn.body,
                accent: ac || '#8a7a6a',
                id: 'th-' + Date.now() + '-' + idx,
                wrapper: 'li',
                kpId: kn.id,
                scholar: _knScholarLastName(kn),
                swipeable: true
              });
            }).join('') + '</ul><hr class="divider">';
      })()
    + '<div class="sec-title">学术贡献</div>'
    + '<p class="summary" style="margin-bottom:22px">' + s.contribution + '</p>'
    + (s.nobel_detail ? '<div class="sec-title" style="color:#b07d20">诺贝尔奖</div><div style="background:#fdf8ee;border:1px solid #e8d99a;border-radius:8px;padding:14px 16px;margin-bottom:22px;font-size:13px;line-height:1.85;color:#7a5c10">' + s.nobel_detail + '</div>' : '')
    + '<hr class="divider">'
    + '<div class="sec-title">所属学派</div>'
    + '<div class="tags">' + schools + '</div>';

  var detailBody = document.getElementById("detail-body");
  detailBody.classList.remove('split-pane');
  detailBody.innerHTML = html;

  var knForScholar = KNOWLEDGE.filter(function(kn) { return _knScholars(kn).indexOf(key) >= 0; });
  var _isSplitPane = window.innerWidth >= 900 && knForScholar.length > 0;
  if (_isSplitPane) {
    detailBody.classList.add('split-pane');
    var existingContent = detailBody.innerHTML;
    detailBody.innerHTML = '<div class="detail-left"><div class="split-back" onclick="goBack()" style="--accent:' + ac + '">← ' + _escapeHtml(s.name) + '</div>' + existingContent + '</div>'
      + '<div class="detail-right" id="kp-detail-panel">'
      + '<div class="kp-panel-placeholder">点击左侧知识点查看详情</div>'
      + '</div>';
    _initSplitPaneHandlers(detailBody, ac);
  }

  document.getElementById("view-list").classList.remove("active");
  document.getElementById("view-detail").classList.add("active");
  document.getElementById("view-detail").scrollTop = 0;
  var theoriesList = detailBody.querySelector("#scholar-theories-list");
  if (theoriesList) {
    _initSwipe(theoriesList);
    if (_isSplitPane) _initDragReorder(theoriesList, 'scholar:' + key);
  }
}

function show(key, accentOverride, skipPushNav) {
  if (window._deltaReady && !window._deltaLoaded) {
    window._deltaReady.then(function() { show(key, accentOverride, skipPushNav); });
    return;
  }
  var d = DATA[key];
  if (!d) return;
  var accent = accentOverride || d.accent;
  window._curSchoolKey = key;
  window._curScholarKey = null;
  if (!skipPushNav) _pushNav();

  var whoKeys = {};
  KNOWLEDGE.forEach(function(kn) {
    if ((kn.schools || []).indexOf(key) >= 0 && kn.scholar) {
      _knScholars(kn).forEach(function(sk) { if (SCHOLARS[sk]) whoKeys[sk] = true; });
    }
  });
  Object.keys(SCHOLARS).forEach(function(sk) {
    var sSchools = SCHOLARS[sk].schools || [];
    if (sSchools.indexOf(key) >= 0) whoKeys[sk] = true;
  });
  var whoList = (d.who || []).slice().filter(function(w) {
    var sk = findScholarKey(w);
    return sk && SCHOLARS[sk];
  });
  Object.keys(whoKeys).forEach(function(sk) {
    var already = whoList.some(function(w) { return findScholarKey(w) === sk; });
    if (!already) {
      var s = SCHOLARS[sk];
      whoList.push(s.name + (s.en ? ' ' + s.en : ''));
    }
  });
  var who = whoList.map(function(p) {
    var k = findScholarKey(p);
    if (k) return '<span class="chip chip-link" onclick="showScholar(\'' + k + '\')">' + p + '</span>';
    return '<span class="chip">' + p + '</span>';
  }).join("");
  var knForSchool = KNOWLEDGE.filter(function(kn) {
    return (kn.schools || []).indexOf(key) >= 0;
  });
  var customOrder = window._deltaOrder && window._deltaOrder['school:' + key];
  var cOrder = customOrder || (d.concepts && d.concepts.length ? d.concepts : null);
  if (cOrder) {
    knForSchool.sort(function(a, b) {
      var ai = cOrder.indexOf(a.id), bi = cOrder.indexOf(b.id);
      return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
    });
  }
  var concepts = knForSchool.map(function(kn, idx) {
    return renderKnowledgeItem({
      title: _knFullTitle(kn),
      body: kn.body,
      accent: accent,
      id: 'ci-' + Date.now() + '-' + idx,
      wrapper: 'li',
      kpId: kn.id,
      scholar: _knScholarLastName(kn),
      contextSchool: key,
      swipeable: true
    });
  }).join("");
  var _relSchoolSet = {};
  knForSchool.forEach(function(kn) {
    (kn.schools || []).forEach(function(sKey) {
      if (sKey !== key && DATA[sKey] && !_relSchoolSet[sKey]) {
        _relSchoolSet[sKey] = DATA[sKey].title;
      }
    });
  });
  var related = Object.keys(_relSchoolSet).map(function(sKey) {
    return '<span class="tag tag-link" onclick="show(\'' + sKey + '\')">' + _relSchoolSet[sKey] + '</span>';
  }).join("");

  var accentBg = accent + "14";
  var groupLabel = '';
  var g = d.group;
  for (var ti = 0; ti < THEME_ORDER.length; ti++) {
    var sec = THEME_ORDER[ti];
    if (Array.isArray(g) ? g.some(function(x){ return sec.groups.indexOf(x) >= 0; }) : sec.groups.indexOf(g) >= 0) {
      groupLabel = sec.label; break;
    }
  }
  var mergedEra = groupLabel;
  var clickableWhoCount = whoList.filter(function(p) {
    return !!findScholarKey(p);
  }).length;
  var canDeleteSchool = (knForSchool.length === 0) && (clickableWhoCount === 0);
  var safeNameAttr = (d.title || key).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  var deleteSchoolBtn = canDeleteSchool
    ? '<hr class="divider"><div style="text-align:center;margin:24px 0"><button onclick="deltaDeleteSchool(\'' + key + '\',\'' + safeNameAttr + '\')" style="padding:10px 28px;border-radius:8px;border:1px solid #FF3B30;background:transparent;color:#FF3B30;font-size:13px;font-weight:var(--weight-semibold);cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'rgba(255,59,48,0.08)\'" onmouseout="this.style.background=\'transparent\'">\u5220\u9664\u8BE5\u5B66\u6D3E</button><div style="margin-top:8px;font-size:11px;color:var(--text-quaternary)">\u5F53\u524D\u65E0\u77E5\u8BC6\u70B9\u4E14\u65E0\u5173\u8054\u5B66\u8005</div></div>'
    : '';
  var html =
    '<div class="school-hero" style="--accent:' + accent + '">'
    +   '<div class="school-hero-accent"></div>'
    +   '<div class="school-hero-body" style="position:relative">'
    +     '<button class="scholar-edit-btn" onclick="openEditSchool(\'' + key + '\')" title="\u7F16\u8F91\u5B66\u6D3E">'
    +       '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    +     '</button>'
    +     '<div class="era-pill" style="margin-bottom:12px"><div class="era-dot" style="background:' + accent + '"></div>' + mergedEra + '</div>'
    +     '<div class="d-title">' + _escapeHtml(d.title) + '</div>'
    +     '<div class="d-en">' + d.en + '</div>'
    +     '<div class="d-ja">' + d.ja + '</div>'
    +     '<div class="hero-quiz-wrap" style="--accent:' + accent + '">'
    +       '<button class="hq-btn hq-secondary" onclick="goSchoolQuiz(\'' + key + '\',\'' + accent + '\')">在线答题</button>'
    +       (typeof SCHOOL_QUIZ!=='undefined'&&SCHOOL_QUIZ[key] ? '<button class="hq-btn hq-primary" onclick="startSchoolBank(\'' + key + '\',\'' + accent + '\')">题库答题</button>' : '')
    +     '</div>'
    +     (typeof _schoolBankProgress === 'function' ? _schoolBankProgress(key) : '')
    +   '</div>'
    + '</div>'
    + '<div class="sec-title">概述</div>'
    + '<p class="summary" style="margin-bottom:22px">' + d.summary + '</p>'
    + '<hr class="divider">'
    + '<div class="sec-title">代表人物<button class="kp-add-btn" onclick="openAddModal(\'scholar\',{school:\'' + key.replace(/'/g, "\\'") + '\'})" title="新增学者">+ 新增</button></div>'
    + '<div class="chips" style="margin-bottom:20px">' + who + '</div>'
    + '<div class="sec-title">核心概念<button class="kp-add-btn" onclick="openAddModal(\'kp\',{school:\'' + key.replace(/'/g, "\\'") + '\'})" title="新增知识点">+ 新增</button></div>'
    + '<ul class="concepts" style="margin-bottom:20px">' + concepts + '</ul>'
    + (d.context ? '<hr class="divider"><div class="sec-title">理论背景与局限性</div><p class="influence" style="margin-bottom:20px">' + d.context + '</p>' : '')
    + '<hr class="divider">'
    + '<div class="sec-title">历史影响</div>'
    + '<p class="influence" style="margin-bottom:20px">' + d.influence + '</p>'
    + '<div class="sec-title">关联学派</div>'
    + '<div class="tags">' + related + '</div>'
    + deleteSchoolBtn;

  var detailBody = document.getElementById("detail-body");
  detailBody.innerHTML = html;

  var _isSplitPane = window.innerWidth >= 900 && knForSchool.length > 0;
  if (_isSplitPane) {
    detailBody.classList.add('split-pane');
    var existingContent = detailBody.innerHTML;
    detailBody.innerHTML = '<div class="detail-left"><div class="split-back" onclick="goBack()" style="--accent:' + accent + '">← ' + _escapeHtml(d.title) + '</div>' + existingContent + '</div>'
      + '<div class="detail-right" id="kp-detail-panel">'
      + '<div class="kp-panel-placeholder">点击左侧知识点查看详情</div>'
      + '</div>';
  } else {
    detailBody.classList.remove('split-pane');
  }

  var conceptsList = detailBody.querySelector('.concepts');
  if (conceptsList) {
    _initSwipe(conceptsList);
    _initDragReorder(conceptsList, 'school:' + key);
  }

  if (_isSplitPane) {
    _initSplitPaneHandlers(detailBody, accent);
  }

  document.getElementById("view-list").classList.remove("active");
  document.getElementById("view-detail").classList.add("active");
  document.getElementById("view-detail").scrollTop = 0;
}

function _moveTabSlider(btn) {
  var slider = document.getElementById('tab-slider');
  var nav = document.getElementById('tab-nav');
  if (!slider || !nav) return;
  var navRect = nav.getBoundingClientRect();
  var btnRect = btn.getBoundingClientRect();
  slider.style.width = btnRect.width + 'px';
  slider.style.transform = 'translateX(' + (btnRect.left - navRect.left - 3) + 'px)';
}

function switchTab(tab, btn) {
  document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
  btn.classList.add("active");
  _moveTabSlider(btn);
  document.querySelectorAll(".panel").forEach(function(p) { p.classList.remove("active"); });
  if (document.getElementById("panel-" + tab)) document.getElementById("panel-" + tab).classList.add("active");
  document.getElementById("view-detail").classList.remove("active");
  document.getElementById("view-list").classList.add("active");
  document.getElementById("view-list").scrollTop = 0;
  var sub = document.getElementById('header-subtitle');
  if (sub) sub.style.display = (tab === 'theme') ? '' : 'none';
  _navStack = [];
  _listState = null;
  if (tab === 'quiz' && !_quizConcept && !_sbActive) {
    QZ.mount();
  } else if (tab !== 'quiz') {
    _quizConcept = '';
  }
  if (tab === 'concepts') renderConcepts();
  if (tab === 'theme') renderHomeGrid();
}

// Initialize slider position on load
document.addEventListener('DOMContentLoaded', function() {
  var activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) {
    var slider = document.getElementById('tab-slider');
    if (slider) slider.style.transition = 'none';
    _moveTabSlider(activeBtn);
    if (slider) setTimeout(function() { slider.style.transition = ''; }, 50);
  }
});

function toggleItem(id, e) {
  if (e && e.target && e.target.closest && e.target.closest('.ja-toggle')) return;
  var el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

// ---- 宽屏分栏：KP点击处理 ----
function _initSplitPaneHandlers(detailBody, accent) {
  var leftPane = detailBody.querySelector('.detail-left');
  var panel = document.getElementById('kp-detail-panel');
  if (!leftPane || !panel) return;

  var headers = leftPane.querySelectorAll('.cn-header');
  headers.forEach(function(header) {
    header.removeAttribute('onclick');
    header.addEventListener('click', function(e) {
      if (e.target && e.target.closest && e.target.closest('.ja-toggle')) return;
      if (e.target && e.target.closest && e.target.closest('.cn-school')) return;
      e.stopPropagation();

      leftPane.querySelectorAll('.cn-item.kp-selected').forEach(function(el) {
        el.classList.remove('kp-selected');
      });
      var item = header.closest('.cn-item');
      if (item) item.classList.add('kp-selected');

      var body = item ? item.querySelector('.cn-body') : null;
      var titleEl = item ? item.querySelector('.cn-title') : null;

      if (panel && body) {
        panel.classList.add('active');
        var cnKey = item.getAttribute('data-cn-key') || '';
        var itemId = item.id || '';
        var jaBtn = '';
        if (typeof DATA_JA !== 'undefined' && DATA_JA[cnKey]) {
          jaBtn = '<button class="pill-btn pill-sm ja-toggle" onclick="toggleJaLang(\'kp-panel-mirror\',this)" title="切换日语/中文" style="--accent:' + accent + ';opacity:0.65;pointer-events:auto"><span>日本語</span></button>';
        }
        var titleHtml = titleEl ? titleEl.innerHTML : '';
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = titleHtml;
        var cnName = '';
        for (var ci = 0; ci < tempDiv.childNodes.length; ci++) {
          var nd = tempDiv.childNodes[ci];
          if (nd.nodeType === 3 && nd.textContent.trim()) { cnName = nd.textContent.trim(); break; }
          if (nd.nodeType === 1 && !nd.classList.contains('tag-b') && !nd.classList.contains('scholar-meta') && !nd.classList.contains('year-b') && !nd.classList.contains('en-sub')) { cnName = nd.textContent.trim(); break; }
        }
        var metaHtml = '';
        tempDiv.querySelectorAll('.tag-b, .scholar-meta').forEach(function(t) { metaHtml += t.outerHTML; });
        var yearEl = tempDiv.querySelector('.year-b');
        if (yearEl) metaHtml += yearEl.outerHTML;
        var jaSub = tempDiv.querySelector('.kp-sub-ja');
        var enSub = tempDiv.querySelector('.kp-sub-en') || tempDiv.querySelector('.en-sub');
        var jaText = jaSub ? jaSub.textContent : '';
        var enText = enSub ? enSub.textContent : '';
        var subHtml = '';
        if (jaText) subHtml += '<div class="kp-panel-sub kp-panel-sub-ja">' + jaText + '</div>';
        if (enText) subHtml += '<div class="kp-panel-sub kp-panel-sub-en">' + enText + '</div>';

        panel.innerHTML = '<div class="kp-panel-header">'
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between">'
          + '<div>'
          + '<div class="kp-panel-cn">' + cnName + '</div>'
          + (metaHtml ? '<div class="kp-panel-meta">' + metaHtml + '</div>' : '')
          + subHtml
          + '</div>'
          + jaBtn
          + '</div>'
          + '</div>'
          + '<div class="cn-item" id="kp-panel-mirror" style="--accent:' + accent + ';border:none;background:transparent;box-shadow:none;backdrop-filter:none" data-cn-key="' + cnKey.replace(/"/g, '&quot;') + '">'
          + '<span class="cn-title" style="display:none">' + (titleEl ? titleEl.innerHTML : '') + '</span>'
          + '<div class="cn-body" style="display:block !important;max-height:none !important;opacity:1 !important;padding:0 !important;overflow:visible !important;border-top:none !important">' + body.innerHTML + '</div>'
          + '</div>';
        panel.scrollTop = 0;
      }
    });
  });

  var firstHeader = leftPane.querySelector('.cn-header');
  if (firstHeader) firstHeader.click();
}
