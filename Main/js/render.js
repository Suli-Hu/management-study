// ===== render.js — Rendering functions =====

function _isMastered(key) { return !!_masteredKeys[key]; }

function toggleMastered(key, btn) {
  event.stopPropagation();
  var card = btn.closest('.card');
  if (_masteredKeys[key]) {
    delete _masteredKeys[key];
    card.classList.remove('mastered');
    btn.textContent = '\u2606'; // ☆
    if (typeof _sbLoad === 'function') {
      var sbp = _sbLoad(key);
      sbp.done = {};
      _sbSave(key, sbp);
    }
  } else {
    _masteredKeys[key] = 1;
    card.classList.add('mastered');
    btn.textContent = '\u2605'; // ★
  }
  localStorage.setItem('mastered', JSON.stringify(_masteredKeys));
}

function _starBtn(key) {
  return '<button class="card-star" onclick="toggleMastered(\'' + key + '\',this)">'
    + (_isMastered(key) ? '\u2605' : '\u2606') + '</button>';
}

function _cardSub(who) {
  var filtered = (who || []).filter(function(w) {
    var sk = findScholarKey(w);
    return sk && SCHOLARS[sk];
  });
  return filtered.slice(0, 3).map(_surname).join(' · ');
}

function _makeCard(key, color) {
  var d = DATA[key];
  if (!d) return null;
  var datePart = (d.badge || '').split('\u00B7')[1] || '';
  datePart = datePart.trim();
  var eraStr = datePart + (datePart && d.en ? ' · ' + d.en : (d.en || ''));
  var card = document.createElement('div');
  card.className = 'card' + (_isMastered(key) ? ' mastered' : '');
  var cardColor = d.accent || color;
  card.setAttribute('style', '--accent:' + cardColor);
  card.setAttribute('data-school-key', key);
  card.setAttribute('onclick', "show('" + key + "')");
  card.innerHTML = _starBtn(key) +
    '<div class="card-title">' + d.title + '</div>' +
    '<div class="card-sub">' + _cardSub(d.who) + '</div>' +
    '<div class="card-era">' + eraStr + '</div>' +
    (typeof _schoolCardProgress === 'function' ? _schoolCardProgress(key) : '');
  return card;
}

function _appendSection(panel, labelText, color, keys, orderKey) {
  var lbl = document.createElement('div');
  lbl.className = 'section-label';
  lbl.innerHTML = labelText + _foldArrowSVG;
  lbl.onclick = function() { toggleSection(lbl); };
  panel.appendChild(lbl);
  var grid = document.createElement('div');
  grid.className = 'cards-grid';
  keys.forEach(function(key) {
    var card = _makeCard(key, color);
    if (card) grid.appendChild(card);
  });
  panel.appendChild(grid);
  if (orderKey) _initDragReorder(grid, orderKey);
}

function _applySavedOrder(keys, orderKey) {
  var saved = (window._deltaOrder || {})[orderKey];
  if (!saved || !saved.length) return keys;
  var keySet = {};
  keys.forEach(function(k) { keySet[k] = 1; });
  var seen = {};
  var sorted = [];
  saved.forEach(function(k) {
    if (keySet[k] && !seen[k]) { sorted.push(k); seen[k] = 1; }
  });
  keys.forEach(function(k) {
    if (!seen[k]) sorted.push(k);
  });
  return sorted;
}

function renderHomeGrid() {
  var themePanel = document.getElementById('panel-theme');
  if (themePanel) {
    themePanel.innerHTML = '';
    var assignedKeys = {};
    THEME_ORDER.forEach(function(sec, idx) {
      var keys;
      if (sec.order) {
        keys = sec.order.filter(function(k) { return !!DATA[k]; });
      } else {
        keys = Object.keys(DATA).filter(function(k) {
          var g = DATA[k].group;
          return Array.isArray(g) ? g.some(function(x){ return sec.groups.indexOf(x) >= 0; }) : sec.groups.indexOf(g) >= 0;
        });
      }
      if (!keys.length) return;
      keys.forEach(function(k) { assignedKeys[k] = true; });
      var orderKey = 'home:' + idx;
      keys = _applySavedOrder(keys, orderKey);
      var numTag = sec.num ? '<span style="color:#aeaeb2;font-weight:400;margin-right:6px;font-size:11px">' + sec.num + '</span>' : '';
      var label = '<div style="border-left:2px solid ' + sec.color + ';padding-left:10px">' +
                  '<span>' + numTag + sec.label + '<span style="color:#aeaeb2;font-weight:400;margin-left:6px">' + keys.length + '</span></span>' +
                  (sec.desc ? '<div style="color:#aeaeb2;font-weight:400;font-size:10px;margin-top:2px;line-height:1.4">' + sec.desc + '</div>' : '') +
                  '</div>';
      _appendSection(themePanel, label, sec.color, keys, orderKey);
    });
    var orphanKeys = Object.keys(DATA).filter(function(k) { return !assignedKeys[k]; });
    if (orphanKeys.length) {
      orphanKeys = _applySavedOrder(orphanKeys, 'home:orphan');
      var orphanLabel = '<div style="border-left:2px solid #86868b;padding-left:10px">' +
        '<span>其他<span style="color:#aeaeb2;font-weight:400;margin-left:6px">' + orphanKeys.length + '</span></span>' +
        '<div style="color:#aeaeb2;font-weight:400;font-size:10px;margin-top:2px;line-height:1.4">尚未归属到任一主题 section 的学派</div>' +
        '</div>';
      _appendSection(themePanel, orphanLabel, '#86868b', orphanKeys, 'home:orphan');
    }
    var addBtn = document.createElement('div');
    addBtn.style.cssText = 'text-align:center;padding:16px 0';
    addBtn.innerHTML = '<button class="kp-add-btn" onclick="openAddModal(\'school\',{})" title="新增学派">+ 新增学派</button>';
    themePanel.appendChild(addBtn);
  }
}

function updateTabCounts() {
  var themeKeyCount = Object.keys(DATA).filter(function(k) {
    return THEME_ORDER.some(function(sec) {
      var g = DATA[k].group;
      return Array.isArray(g) ? g.some(function(x){ return sec.groups.indexOf(x) >= 0; }) : sec.groups.indexOf(g) >= 0;
    });
  }).length;
  var themeCnt = document.getElementById('cnt-theme');
  if (themeCnt) themeCnt.textContent = themeKeyCount;

  var scholarCnt = document.getElementById('cnt-scholar');
  if (scholarCnt) scholarCnt.textContent = Object.keys(SCHOLARS).length;

  var cnCnt = document.getElementById('cnt-concepts');
  if (cnCnt) cnCnt.textContent = _buildConceptsIndex().length;
}

// ---- Knowledge item rendering ----

function _extractJP(body) {
  var m = body.match(/^[\s]*[（(]([^）)]*[\/／][^）)]*)[）)]\s*[——]*/);
  if (m) return { jp: m[1].trim(), rest: body.slice(m[0].length).trim() };
  return null;
}
function _jpLineHtml(text, accent, title) {
  if (title) {
    text = text.replace(/[（(][^）)]+[）)]/g, function(m) {
      var inner = m.slice(1, -1).trim();
      if (title.indexOf(inner) >= 0) return '';
      var parts = inner.split(/[,，\s]+/);
      if (parts.length && parts.every(function(p) { return p.length < 2 || title.indexOf(p) >= 0; })) return '';
      return m;
    }).replace(/\s{2,}/g, ' ').trim();
  }
  if (!text) return '';
  return '<div class="jp-line">' + text + '</div>';
}

function _linkifyTheories(text) {
  if (!text) return '';
  var names = [];
  if (typeof SCHOLARS !== 'undefined') {
    Object.keys(SCHOLARS).forEach(function(k) {
      var s = SCHOLARS[k];
      if (s.name) names.push(s.name);
      if (s.en) names.push(s.en);
    });
  }
  if (typeof DATA !== 'undefined') {
    Object.keys(DATA).forEach(function(k) { if (DATA[k].name) names.push(DATA[k].name); });
  }
  if (typeof KNOWLEDGE !== 'undefined') {
    KNOWLEDGE.forEach(function(k) {
      if (k.title) names.push(k.title);
      if (k.en) names.push(k.en);
    });
  }
  names = names.filter(function(n) { return n && n.length >= 2; });
  names.sort(function(a, b) { return b.length - a.length; });
  var parts = text.split(/[,，]/);
  var isNameList = parts.length > 1 && parts.every(function(p) {
    var t = p.trim();
    return t.length > 0 && t.length < 20 && !/[。、：；的与和在从为]/.test(t);
  });
  if (isNameList) {
    return parts.map(function(p) {
      p = p.trim();
      if (!p) return '';
      var clean = p.replace(/\s*'\d{2}$/,'').trim();
      if (_canLink(clean)) {
        return '<span><a class="cmp-link" onclick="event.stopPropagation();_cmpSearch(\'' + p.replace(/'/g, "\\'") + '\')">' + p + '</a></span>';
      }
      return '<span>' + p + '</span>';
    }).join('');
  }
  var result = text;
  var used = [];
  names.forEach(function(name) {
    if (used.indexOf(name) >= 0) return;
    var idx = result.indexOf(name);
    if (idx < 0) return;
    var before = result.slice(0, idx);
    var openTags = (before.match(/<a /g) || []).length;
    var closeTags = (before.match(/<\/a>/g) || []).length;
    if (openTags === closeTags) {
      result = before + '<a class="cmp-link" onclick="event.stopPropagation();_cmpSearch(\'' + name.replace(/'/g, "\\'") + '\')">' + name + '</a>' + result.slice(idx + name.length);
      used.push(name);
    }
  });
  return '<span>' + result + '</span>';
}
function _canLink(name) {
  if (!!findScholarKey(name)) return true;
  if (typeof NAME_TO_KEY !== 'undefined' && NAME_TO_KEY[name] && DATA[NAME_TO_KEY[name]]) return true;
  if (typeof KNOWLEDGE !== 'undefined') {
    for (var j = 0; j < KNOWLEDGE.length; j++) {
      var k = KNOWLEDGE[j];
      if (k.title === name || k.en === name) return true;
      if (name.length >= 2 && (k.title.indexOf(name) === 0 || (k.en && k.en.indexOf(name) === 0))) return true;
    }
  }
  return false;
}

function _formatCompareCards(lead, data, accent) {
  var rgb = _hexRgb(accent || '#8a7a6a');
  var cols = data.split('||').map(function(c){ return c.trim(); }).filter(Boolean);
  var html = '';
  if (lead) html += '<div class="body-lead">' + lead + '</div>';
  html += '<div class="compare-grid" style="grid-template-columns:repeat(' + cols.length + ',1fr);--accent:' + accent + ';--accent-bg:rgba(' + rgb + ',.08)">';
  cols.forEach(function(col, i) {
    var f = col.split('|').map(function(s){ return s.trim(); });
    var title = f[0] || '';
    var keyword = f[1] || '';
    var desc = f[2] || '';
    var type = f[3] || '';
    var theories = f[4] || '';
    var detail = f[5] || '';
    var theoriesHtml = _linkifyTheories(theories);
    html += '<div class="compare-col" onclick="this.classList.toggle(\'flipped\')">'
      + '<div class="compare-col-inner">'
      + '<div class="compare-front">'
      +   '<div class="compare-num">' + (i + 1) + '</div>'
      +   '<div class="compare-title">' + title + '</div>'
      +   '<div class="compare-keyword">' + keyword + '</div>'
      +   '<div class="compare-desc">' + desc + '</div>'
      +   '<div class="compare-theories">' + theoriesHtml + '</div>'
      + '</div>'
      + (detail ? '<div class="compare-back">'
        + '<div class="compare-back-title">' + title + ' · ' + type + '</div>'
        + '<div class="compare-back-text">' + detail + '</div>'
        + '</div>' : '')
      + '</div></div>';
  });
  html += '</div>';
  return html;
}

function _cmpSearch(q) {
  var clean = q.replace(/\s*'\d{2}$/,'').trim();
  var sk = findScholarKey(clean);
  if (sk) { showScholar(sk); return; }
  if (typeof NAME_TO_KEY !== 'undefined') {
    var schoolKey = NAME_TO_KEY[clean];
    if (schoolKey && DATA[schoolKey]) { show(schoolKey); return; }
  }
  if (typeof KNOWLEDGE !== 'undefined') {
    for (var i = 0; i < KNOWLEDGE.length; i++) {
      var kn = KNOWLEDGE[i];
      if (kn.title === clean || kn.title.indexOf(clean) === 0 || kn.en === clean) {
        var tabs = document.querySelectorAll('.tab-btn, button');
        for (var t = 0; t < tabs.length; t++) {
          if (tabs[t].textContent.indexOf('知识点') >= 0) { tabs[t].click(); break; }
        }
        var knTitle = kn.title;
        setTimeout(function() {
          var inp = document.getElementById('concept-search-input');
          if (inp) { inp.value = knTitle; inp.dispatchEvent(new Event('input', {bubbles: true})); }
          setTimeout(function() {
            var items = document.querySelectorAll('.cn-item');
            for (var x = 0; x < items.length; x++) {
              var t = items[x].querySelector('.cn-title');
              if (t && t.textContent.indexOf(knTitle) >= 0) {
                if (!items[x].classList.contains('open')) items[x].classList.add('open');
                items[x].scrollIntoView({block: 'start', behavior: 'smooth'});
                break;
              }
            }
          }, 150);
        }, 50);
        return;
      }
    }
  }
  var inp = document.getElementById('concept-search-input');
  if (inp) { inp.value = clean; inp.dispatchEvent(new Event('input', {bubbles: true})); }
  document.querySelector('.view.active').scrollTop = 0;
}

function _formatQuadChart(lead, data, accent) {
  var rgb = _hexRgb(accent || '#8a7a6a');
  var parts = data.split('||');
  var axes = parts[0].split(',').map(function(s){ return s.trim(); });
  var yAxis = axes[0] || '';
  var xAxis = axes[1] || '';
  var cells = [];
  // Detect binary mode (A/B) vs continuous mode (低→高)
  var isBinary = yAxis.indexOf('/') >= 0;
  for (var i = 1; i < parts.length; i++) {
    var f = parts[i].split('|').map(function(s){ return s.trim(); });
    if (isBinary && f.length <= 1) {
      cells.push({ name: parts[i].trim(), simple: true });
    } else {
      cells.push({ name: f[0]||'', emoji: f[1]||'', sub: f[2]||'', detail: f[3]||'' });
    }
  }
  var html = '';
  if (lead) html += '<div class="body-lead">' + lead + '</div>';
  var yName, xName, yBin, xBin;
  if (isBinary) {
    yBin = yAxis.split('/').map(function(s){ return s.trim(); });
    xBin = xAxis.split('/').map(function(s){ return s.trim(); });
  } else {
    yName = yAxis.replace(/\s*低?\s*→\s*高?\s*$/, '').trim();
    xName = xAxis.replace(/\s*低?\s*→\s*高?\s*$/, '').trim();
  }
  html += '<div class="quad-wrap">';
  if (yAxis) {
    if (isBinary) {
      html += '<div class="quad-y-axis">'
        + '<span class="quad-axis-label">' + yBin[0] + '</span>'
        + '<span class="quad-axis-label">' + yBin[1] + '</span>'
        + '</div>';
    } else {
      html += '<div class="quad-y-axis-3">'
        + '<span class="quad-axis-label">高</span>'
        + '<span class="quad-axis-label" style="font-size:8px;opacity:.6">' + yName + '</span>'
        + '<span class="quad-axis-label">低</span>'
        + '</div>';
    }
  }
  html += '<div class="quad-main"><div class="quad-grid">';
  cells.forEach(function(c) {
    if (c.simple) {
      html += '<div class="quad-cell" style="cursor:default">'
        + '<div class="quad-front" style="height:100%">'
        + '<div class="quad-back-text" style="font-size:11.5px;color:#4a4a4a;line-height:1.75">' + c.name + '</div>'
        + '</div></div>';
    } else {
      html += '<div class="quad-cell" onclick="this.classList.toggle(\'flipped\')">'
        + '<div class="quad-cell-inner">'
        + '<div class="quad-front">'
        +   '<div class="quad-emoji">' + c.emoji + '</div>'
        +   '<div class="quad-name">' + c.name + '</div>'
        +   '<div class="quad-sub">' + c.sub + '</div>'
        +   ''
        + '</div>'
        + (c.detail ? '<div class="quad-back">'
          + '<div class="quad-back-title">' + c.name + '</div>'
          + '<div class="quad-back-text">' + c.detail + '</div>'
          + '</div>' : '')
        + '</div></div>';
    }
  });
  html += '</div>';
  if (xAxis) {
    if (isBinary) {
      html += '<div class="quad-x-axis">'
        + '<span class="quad-axis-label">' + xBin[0] + '</span>'
        + '<span class="quad-axis-label">' + xBin[1] + '</span>'
        + '</div>';
    } else {
      html += '<div class="quad-x-axis-3">'
        + '<span class="quad-axis-label" style="visibility:hidden">低</span>'
        + '<span class="quad-axis-label" style="font-size:8px;opacity:.6">' + xName + '</span>'
        + '<span class="quad-axis-label">高</span>'
        + '</div>';
    }
  }
  html += '</div></div>';
  return html;
}

function _formatBody(body, accent) {
  var quadMatch = body.match(/^([\s\S]*?)<quad>([\s\S]+)<\/quad>/);
  if (quadMatch) {
    return _formatQuadChart(quadMatch[1].trim(), quadMatch[2].trim(), accent);
  }
  var cmpMatch = body.match(/^([\s\S]*?)<compare>([\s\S]+)<\/compare>([\s\S]*)/);
  if (cmpMatch) {
    var cmpHtml = _formatCompareCards(cmpMatch[1].trim(), cmpMatch[2].trim(), accent);
    var tail = cmpMatch[3] ? cmpMatch[3].trim() : '';
    if (tail) {
      var rgb = _hexRgb(accent || '#8a7a6a');
      var numMap = {'①':'1','②':'2','③':'3','④':'4','⑤':'5','⑥':'6','⑦':'7','⑧':'8','⑨':'9','⑩':'10'};
      var tailItems = tail.split(/◆\s*/).filter(function(p){ return p.trim(); });
      tailItems.forEach(function(item, idx) {
        cmpHtml += _renderBodyCard('①' + item.trim(), accent, rgb, numMap);
      });
    }
    return cmpHtml;
  }
  var items = [], lead = '';
  if (body.includes('<br>')) {
    var parts = body.split('<br>');
    lead = parts[0];
    items = parts.slice(1).filter(function(p){ return p.trim(); });
    if (!items.length || !/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮【]|^S[1-4]/.test(items[0].trim())) return body;
  } else if (/◆/.test(body)) {
    var splitParts = body.split(/◆\s*/);
    lead = splitParts[0].replace(/[：:；，,]\s*$/, '');
    items = splitParts.slice(1).filter(function(p){ return p.trim(); });
    if (items.length < 2) return body;
    var circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮'];
    items = items.map(function(it, idx){ return circled[idx % circled.length] + it.replace(/[；;]\s*$/, ''); });
  } else if (/[①②③]/.test(body)) {
    var splitParts = body.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])/);
    lead = splitParts[0].replace(/[：:；]\s*$/, '');
    items = splitParts.slice(1).filter(function(p){ return p.trim(); });
    if (items.length < 2) return body;
    var lastItem = items[items.length - 1];
    var lastPeriod = lastItem.lastIndexOf('。');
    if (lastPeriod > 0 && lastPeriod < lastItem.length - 1) {
      items[items.length - 1] = lastItem.slice(0, lastPeriod + 1);
    }
  } else {
    return body;
  }
  var rgb = _hexRgb(accent || '#8a7a6a');
  var numMap = {'①':'1','②':'2','③':'3','④':'4','⑤':'5','⑥':'6','⑦':'7','⑧':'8','⑨':'9','⑩':'10','⑪':'11','⑫':'12','⑬':'13','⑭':'14','⑮':'15'};
  var hasGroups = items.some(function(it){ return /^【/.test(it.trim()); });
  if (hasGroups) return _formatGroupedBody(lead, items, accent, rgb, numMap);
  var html = '<div class="body-lead">' + lead + '</div><div class="body-items">';
  items.forEach(function(item) {
    html += _renderBodyCard(item, accent, rgb, numMap);
  });
  html += '</div>';
  return html;
}

function _renderBodyCard(item, accent, rgb, numMap) {
    item = item.trim().replace(/[；;]\s*$/, '');
    var m = item.match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|S[1-4])([\s\S]*)/);
    if (!m) return '<div style="font-size:12px;color:#6a6460;line-height:1.65">' + item + '</div>';
    var num = m[1];
    var displayNum = numMap[num] || num;
    var rest = m[2].trim();
    var di = rest.indexOf('——');
    if (di < 0) {
      var cm = rest.match(/^([^：]+(?:）|》|\)))\s*：\s*/);
      if (cm) di = cm[0].length - 1;
    }
    var name, desc;
    if (di >= 0 && rest.indexOf('——') === di) {
      name = rest.slice(0, di).trim();
      desc = rest.slice(di + 2).trim();
    } else if (di >= 0) {
      var cm2 = rest.match(/^([^：]+(?:）|》|\)))\s*：\s*/);
      name = cm2[1].trim();
      desc = rest.slice(cm2[0].length).trim();
    } else {
      name = rest;
      desc = '';
    }
    var _labelWords = {意义:1,局限:1,企业例:1,例子:1,应对:1,应用:1,比喻:1,例:1,意義:1,限界:1,局限:1};
    var labelName = name.replace(/[（(].*/,'').replace(/[：:].*/,'').trim();
    var _labelShort = {意义:'义',局限:'限',企业例:'例',例子:'例',应对:'应',应用:'用',比喻:'喻',例:'例',意義:'義',限界:'限'};
    if (_labelWords[labelName]) {
      displayNum = _labelShort[labelName] || labelName;
      name = '';
    }
    return '<div class="body-card" style="--accent:' + accent + '">'
      + '<span class="body-num" style="background:rgba('+rgb+',.1);border-color:rgba('+rgb+',.25);color:'+accent+';' + (_labelWords[labelName] ? 'font-size:9px;min-width:28px;padding:0 4px' : '') + '">' + displayNum + '</span>'
      + '<div class="body-card-content">'
      + '<div class="body-item-name">' + name + '</div>'
      + (desc ? '<div class="body-item-desc"' + (_labelWords[labelName] ? ' style="color:#3a3632;font-weight:400"' : '') + '>' + desc + '</div>' : '')
      + '</div></div>';
}

function _formatGroupedBody(lead, items, accent, rgb, numMap) {
  var _evalWords = {意义:1,局限:1,企业例:1,应对:1,应用:1,比喻:1,例子:1,例:1,意義:1,限界:1};
  var html = '<div class="body-lead">' + lead + '</div><div class="body-items">';
  var inGroup = false;
  items.forEach(function(item) {
    item = item.trim();
    var gm = item.match(/^【(.+?)】$/);
    if (gm) {
      if (inGroup) html += '</div></div>';
      html += '<div class="body-group">'
        + '<div class="body-group-title" onclick="this.parentElement.classList.toggle(\'open\')">' + gm[1] + '</div>'
        + '<div class="body-group-items" style="border-color:rgba('+rgb+',.15)">';
      inGroup = true;
    } else {
      var em = item.match(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*([^：:——]+)/);
      var evalName = em ? em[1].replace(/[（(].*/,'').trim() : '';
      if (!evalName) {
        var dm = item.match(/^◆\s*([^：:——]+)/);
        evalName = dm ? dm[1].replace(/[（(].*/,'').trim() : '';
      }
      if (inGroup && _evalWords[evalName]) {
        html += '</div></div>';
        inGroup = false;
      }
      if (/^◆/.test(item)) {
        item = '①' + item.slice(1);
      }
      html += _renderBodyCard(item, accent, rgb, numMap);
    }
  });
  if (inGroup) html += '</div></div>';
  html += '</div>';
  return html;
}

function renderKnowledgeItem(opts) {
  var title = opts.title;
  var body  = opts.body;
  var accent = opts.accent || '#8a7a6a';
  var id = opts.id;
  var q  = opts.query || '';

  var jpName = '';
  var jpVal = _jpLookup(title);
  if (jpVal) {
    var _jpRaw = jpVal.split('——')[0].trim();
    jpName = _jpRaw.replace(/<\/?strong>/g, '').replace(/[（(][^）)]*[）)]/g, '').trim();
    var _ex = _extractJP(body); if (_ex) body = _ex.rest;
  } else {
    var _ex2 = _extractJP(body);
    if (_ex2) { jpName = _ex2.jp.replace(/[（(][^）)]*[）)]/g, '').trim(); body = _ex2.rest; }
  }

  var _sn = opts.scholar || null;
  var titleDisplay = q ? _titleHtml(_hlText(title, q), accent, null, _sn, jpName) : _titleHtml(title, accent, null, _sn, jpName);
  var bodyHtml = q ? _formatBody(_hlText(body, q), accent) : _formatBody(body, accent);

  var schoolHtml = '';
  if (opts.schools && opts.schools.length > 0) {
    opts.schools.forEach(function(s) {
      var schDisplay = q ? _hlText(s.name, q) : s.name;
      schoolHtml += '<span class="cn-school" style="border-color:' + s.accent + ';color:' + s.accent + '"'
        + ' onclick="event.stopPropagation();show(\'' + s.key + '\')" title="前往学派详情"'
        + '>' + schDisplay + '</span>';
    });
  } else if (opts.school) {
    var schDisplay = q ? _hlText(opts.school, q) : opts.school;
    schoolHtml = '<span class="cn-school" style="border-color:' + accent + ';color:' + accent + '"'
      + (opts.schoolKey ? ' onclick="event.stopPropagation();show(\'' + opts.schoolKey + '\')" title="前往学派详情"' : '')
      + '>' + schDisplay + '</span>';
  }

  var quizHtml = '';
  if (opts.quizable) {
    var safeT = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var safeSch = (opts.school || '').replace(/'/g, "\\\\'");
    quizHtml = '<div style="margin-top:12px;text-align:right"><button class="pill-btn" onclick="event.stopPropagation();goQuiz(\'' + safeT + '\',\'' + safeSch + '\',\'' + accent + '\')">去练习 →</button></div>';
  }

  var cnKey = title.replace(/([（(][^）)]+[）)][\s]*)+$/, '').trim();
  var jaToggleHtml = '';
  if (typeof DATA_JA !== 'undefined' && DATA_JA[cnKey]) {
    jaToggleHtml = '<button class="pill-btn pill-sm ja-toggle" onclick="event.stopPropagation();toggleJaLang(\'' + id + '\',this)" title="切换日语/中文"><span>日本語</span></button>';
  }

  var card = '<div class="cn-item" id="' + id + '" style="--accent:' + accent + '" data-cn-key="' + cnKey.replace(/"/g, '&quot;') + '">'
    + '<div class="cn-header" onclick="toggleItem(\'' + id + '\',event)">'
    + '<span class="cn-arrow">▶</span>'
    + '<span class="cn-title">' + titleDisplay + '</span>'
    + schoolHtml
    + jaToggleHtml
    + '</div>'
    + '<div class="cn-body">' + bodyHtml + quizHtml + '</div>'
    + '</div>';

  if (opts.swipeable) {
    var realId = opts.kpId || id;
    var safeTitleAttr = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    card = '<div class="cn-swipe-wrap" data-cn-id="' + realId + '" data-cn-title="' + safeTitleAttr + '">'
      + '<button class="cn-edit-btn" onclick="openEditKP(\'' + realId + '\',\'' + (opts.contextSchool || '') + '\')"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span style="font-size:9px;opacity:.7">编辑</span></button>'
      + '<button class="cn-hide-btn" onclick="deltaDeleteKP(\'' + realId + '\',\'' + safeTitleAttr + '\')"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span style="font-size:9px;opacity:.7">删除</span></button>'
      + '<div class="cn-swipe-inner">' + card + '</div></div>';
  }

  if (opts.wrapper === 'li') {
    card = '<li' + (opts.kpId ? ' data-kp-id="' + opts.kpId + '"' : '') + '>' + card + '</li>';
  }
  return card;
}

function _renderCnItem(c, id, q) {
  return renderKnowledgeItem({
    title: c.title, body: c.body, accent: c.accent, id: id,
    kpId: c.id,
    school: c.school, schoolKey: c.key, scholar: c.scholar,
    schools: c.schools,
    swipeable: true, quizable: true, query: q
  });
}

// ---- Concepts tab ----

function _buildConceptsIndex() {
  if (CONCEPTS_INDEX) return CONCEPTS_INDEX;
  var list = [];
  KNOWLEDGE.forEach(function(k) {
    var schoolInfos = [];
    var cats = [];
    (k.schools || []).forEach(function(sKey) {
      var d = DATA[sKey];
      if (!d) return;
      var cat = TOPIC_MAP[sKey] || (d.badge ? d.badge.split('·')[0].trim() : 'その他');
      schoolInfos.push({ name: d.title, key: sKey, accent: d.accent });
      if (cats.indexOf(cat) < 0) cats.push(cat);
    });
    if (!schoolInfos.length) return;
    var cnKey = k.title.replace(/([（(][^）)]+[）)][\s]*)+$/, '').trim();
    var jaText = (typeof DATA_JA !== 'undefined' && DATA_JA[cnKey]) ? DATA_JA[cnKey] : '';
    list.push({
      id: k.id,
      title: _knFullTitle(k),
      body: k.body,
      en: k.en || '',
      ja: jaText,
      schools: schoolInfos,
      cats: cats,
      accent: schoolInfos[0].accent,
      school: schoolInfos[0].name,
      key: schoolInfos[0].key,
      cat: cats[0],
      scholar: _knScholarLastName(k)
    });
  });
  list.sort(function(a, b) {
    var ai = TOPIC_ORDER.indexOf(a.cat), bi = TOPIC_ORDER.indexOf(b.cat);
    if (ai < 0) ai = 99; if (bi < 0) bi = 99;
    if (ai !== bi) return ai - bi;
    return a.school < b.school ? -1 : a.school > b.school ? 1 : 0;
  });
  CONCEPTS_INDEX = list;
  return list;
}

function renderConcepts() {
  if (window._deltaReady && !window._deltaLoaded) {
    window._deltaReady.then(function() { renderConcepts(); });
    return;
  }
  var list   = _buildConceptsIndex();
  var inp    = document.getElementById('concept-search-input');
  var q      = inp ? inp.value.trim().toLowerCase() : '';
  var filtered = list;
  if (_cnSchoolFilter) {
    filtered = filtered.filter(function(c) {
      if (c.key === _cnSchoolFilter) return true;
      return c.schools && c.schools.some(function(s) { return s.key === _cnSchoolFilter; });
    });
  } else if (_cnCats.length > 0) {
    filtered = filtered.filter(function(c) {
      return c.cats.some(function(ct) { return _cnCats.indexOf(ct) >= 0; });
    });
  } else if (_cnCat !== 'all') {
    var l1Cats = _L1_CATS[_cnCat] || [];
    filtered = filtered.filter(function(c) {
      return c.cats.some(function(ct) { return l1Cats.indexOf(ct) >= 0; });
    });
  }
  if (q) {
    filtered = filtered.filter(function(c) {
      var schoolNames = c.schools ? c.schools.map(function(s) { return s.name; }).join(' ') : c.school;
      var baseMatch = ((c.id || '') + ' ' + c.title + ' ' + c.body + ' ' + (c.en || '') + ' ' + schoolNames).toLowerCase().indexOf(q) >= 0;
      var jaMatch = (c.ja || '').toLowerCase().indexOf(q) >= 0;
      c._showJa = !baseMatch && jaMatch;
      return baseMatch || jaMatch;
    });
  }
  var countEl  = document.getElementById('concept-count');
  var noResult = document.getElementById('concept-no-result');
  var listEl   = document.getElementById('concept-list');
  if (countEl) countEl.textContent = filtered.length ? filtered.length + ' 个知识点' : '';
  if (!filtered.length) {
    if (noResult) noResult.style.display = 'block';
    if (listEl) listEl.innerHTML = '';
    return;
  }
  if (noResult) noResult.style.display = 'none';
  var html = '';
  if (q) {
    var rows = '';
    filtered.forEach(function(c, i) { rows += _renderCnItem(c, 'cnq-' + i, q); });
    html = '<div class="cn-items-list">' + rows + '</div>';
  } else {
    var cats = []; var groups = {};
    filtered.forEach(function(c) {
      if (!groups[c.cat]) { groups[c.cat] = []; cats.push(c.cat); }
      groups[c.cat].push(c);
    });
    var _cnIdx = 0;
    cats.forEach(function(cat) {
      var rows = '';
      groups[cat].forEach(function(c, i) {
        rows += _renderCnItem(c, 'cng-' + (_cnIdx++), '');
      });
      html += '<div class="section-label" onclick="toggleSection(this)"><span>' + cat
        + ' <span style="opacity:.5;font-weight:400;letter-spacing:0">' + groups[cat].length + '</span></span>'
        + _foldArrowSVG + '</div>'
        + '<div class="cn-items-list">' + rows + '</div>';
    });
  }
  if (listEl) {
    listEl.innerHTML = html;
    _initSwipe(listEl);
    if (q) {
      filtered.forEach(function(c, i) {
        if (c._showJa) {
          var el = document.getElementById('cnq-' + i);
          if (el) {
            el.classList.add('open');
            var btn = el.querySelector('.ja-toggle');
            if (btn) btn.click();
          }
        }
      });
    }
  }
}

function segSelect(l1) {
  _cnCat = l1;
  _cnCats = [];
  _cnSchoolFilter = '';
  document.querySelectorAll('#cat-filter .seg-item').forEach(function(b) {
    b.classList.toggle('active', b.dataset.l1 === l1);
  });
  var subsEl = document.getElementById('concept-subs');
  if (l1 === 'all') {
    subsEl.classList.remove('open');
    subsEl.innerHTML = '';
  } else {
    var schools = _getSchoolsByL1(l1);
    var pills = schools.map(function(k) {
      return '<button class="seg-sub-pill" data-school="' + k + '" onclick="conceptFilterBySchool(\'' + k + '\')">' + DATA[k].title + '</button>';
    }).join(' ');
    subsEl.innerHTML = '<div class="seg-sub-row">' + pills + '</div>';
    subsEl.classList.add('open');
  }
  renderConcepts();
}

function conceptFilterBySchool(key) {
  _cnSchoolFilter = (_cnSchoolFilter === key) ? '' : key;
  _cnCats = [];
  document.querySelectorAll('#concept-subs .seg-sub-pill').forEach(function(p) {
    var isActive = p.dataset.school === _cnSchoolFilter;
    p.classList.toggle('active', isActive);
    if (isActive) {
      p.style.background = DATA[key] ? DATA[key].accent : '';
    } else {
      p.style.background = '';
    }
  });
  renderConcepts();
}

function toggleCatPill(btn) {
  var school = btn.dataset.school;
  if (school) { conceptFilterBySchool(school); return; }
  var cat = btn.dataset.cat;
  btn.classList.toggle('active');
  var color = _l1Colors[_cnCat] || '#1d1d1f';
  if (btn.classList.contains('active')) {
    btn.style.background = color;
  } else {
    btn.style.background = '';
  }
  _cnCats = [];
  document.querySelectorAll('#concept-subs .seg-sub-pill.active').forEach(function(p) {
    if (p.dataset.cat) _cnCats.push(p.dataset.cat);
  });
  renderConcepts();
}

function conceptSearch(val) {
  var cb = document.getElementById('concept-search-clear');
  if (cb) cb.style.display = val ? 'block' : 'none';
  renderConcepts();
}

function conceptSearchClear() {
  var inp = document.getElementById('concept-search-input');
  if (inp) { inp.value = ''; inp.focus(); }
  conceptSearch('');
}

// ---- Scholar cards ----

function renderScholarCards() {
  var ct = document.getElementById('scholar-cards-container');
  if (!ct || typeof SCHOLAR_ORDER === 'undefined') return;
  var html = '';
  SCHOLAR_ORDER.forEach(function(sec) {
    var secColor = sec.color || '#86868b';
    var secLabel = '<span style="border-left:2px solid ' + secColor + ';padding-left:10px">' + sec.label
      + '<span style="color:#aeaeb2;font-weight:400;margin-left:6px">' + sec.keys.length + '</span>'
      + (sec.en ? '<span style="color:#aeaeb2;font-weight:400;margin-left:8px;font-size:10px;letter-spacing:0.04em;text-transform:uppercase">' + sec.en + '</span>' : '')
      + '</span>';
    html += '<div class="section-label" onclick="toggleSection(this)">' + secLabel + _foldArrowSVG + '</div><div class="cards-grid">';
    sec.keys.forEach(function(key) {
      var s = SCHOLARS[key];
      if (!s) return;
      var era = _scholarEra(s);
      html += '<div class="card" style="--accent:' + _scholarAccent(s) + '" onclick="showScholar(\'' + key + '\')">'
        + '<span class="card-flag">' + s.flag + '</span>'
        + '<div class="card-title">' + s.name + '</div>'
        + '<div class="card-sub">' + s.en + '</div>'
        + '<div class="card-ja">' + s.ja + '</div>'
        + '<div class="card-era">' + era + '</div></div>';
    });
    html += '</div>';
  });
  ct.innerHTML = html;
}

function scholarSearch(q) {
  var clearBtn = document.getElementById('scholar-search-clear');
  clearBtn.style.display = q ? 'block' : 'none';
  _applyScholarFilter();
}

function scholarSearchClear() {
  var input = document.getElementById('scholar-search-input');
  input.value = '';
  scholarSearch('');
  input.focus();
}

function _getSchoolsByL1(l1) {
  var groupMap = { SM: [6,7,10,12], OB: [1,2], OT: [3,4,5,8,11] };
  var groups = groupMap[l1] || [];
  return Object.keys(DATA).filter(function(k) {
    var g = DATA[k].group;
    if (!g) return false;
    return Array.isArray(g) ? g.some(function(x){ return groups.indexOf(x) >= 0; }) : groups.indexOf(g) >= 0;
  }).sort(function(a, b) {
    var ga = Array.isArray(DATA[a].group) ? DATA[a].group[0] : DATA[a].group;
    var gb = Array.isArray(DATA[b].group) ? DATA[b].group[0] : DATA[b].group;
    return ga - gb;
  });
}

function scholarSegSelect(l1) {
  _scholarL1 = l1;
  _scholarSubLabels = [];
  _scholarSchoolFilter = '';
  var filter = document.getElementById('scholar-filter');
  filter.querySelectorAll('.seg-item').forEach(function(b) {
    b.classList.toggle('active', b.dataset.l1 === l1);
  });
  var subsEl = document.getElementById('scholar-subs');
  if (l1 === 'all') {
    subsEl.classList.remove('open');
    subsEl.innerHTML = '';
  } else {
    var schools = _getSchoolsByL1(l1);
    var pills = schools.map(function(k) {
      return '<button class="seg-sub-pill" data-school="' + k + '" onclick="scholarFilterBySchool(\'' + k + '\')">' + DATA[k].title + '</button>';
    }).join(' ');
    subsEl.innerHTML = '<div class="seg-sub-row" style="margin-top:0">' + pills + '</div>';
    subsEl.classList.add('open');
  }
  _applyScholarFilter();
}

function scholarFilterBySchool(schoolKey) {
  _scholarSchoolFilter = (_scholarSchoolFilter === schoolKey) ? '' : schoolKey;
  document.querySelectorAll('#scholar-subs .seg-sub-pill').forEach(function(p) {
    var isActive = p.dataset.school === _scholarSchoolFilter;
    p.classList.toggle('active', isActive);
    if (isActive) {
      p.style.background = DATA[schoolKey] ? DATA[schoolKey].accent : '';
    } else {
      p.style.background = '';
    }
  });
  _applyScholarFilter();
}

function _applyScholarFilter() {
  var labels = document.querySelectorAll('#panel-scholar #scholar-cards-container > .section-label');
  var color = _scholarL1Colors[_scholarL1];
  var totalVisible = 0;
  var noResult = document.getElementById('scholar-no-result');

  var inp = document.getElementById('scholar-search-input');
  var q = inp ? inp.value.trim().toLowerCase() : '';

  var schoolWhoKeys = null;
  if (_scholarSchoolFilter && DATA[_scholarSchoolFilter]) {
    schoolWhoKeys = {};
    KNOWLEDGE.forEach(function(k) {
      if (k.scholar && k.schools && k.schools.indexOf(_scholarSchoolFilter) >= 0) {
        schoolWhoKeys[k.scholar] = true;
      }
    });
    var whoList = DATA[_scholarSchoolFilter].who || [];
    Object.keys(SCHOLARS).forEach(function(sk) {
      if (schoolWhoKeys[sk]) return;
      var s = SCHOLARS[sk];
      var sName = s.name || '';
      var sEn = s.en || '';
      var matched = whoList.some(function(w) {
        return w.indexOf(sName) >= 0 || sName.indexOf(w.replace(/\s*[A-Za-z].*$/, '').trim()) >= 0
          || w.indexOf(sEn) >= 0 || sEn.indexOf(w.replace(/^[^\x00-\x7F\s]+\s*/, '').trim()) >= 0;
      });
      if (matched) schoolWhoKeys[sk] = true;
    });
  }

  var allCards = document.querySelectorAll('#panel-scholar .card');
  allCards.forEach(function(card) {
    ['card-title', 'card-sub', 'card-ja'].forEach(function(cls) {
      var el = card.querySelector('.' + cls);
      if (el && el._orig === undefined) el._orig = el.innerHTML;
    });
  });

  labels.forEach(function(labelEl) {
    var grid = labelEl.nextElementSibling;
    if (!grid) return;
    var secIdx = Array.from(labelEl.parentNode.querySelectorAll('.section-label')).indexOf(labelEl);
    var sec = SCHOLAR_ORDER[secIdx];
    if (!sec) return;

    var secShow = true;
    if (_scholarL1 !== 'all') {
      if (sec.color !== color) {
        secShow = false;
      }
    }

    if (!secShow) {
      labelEl.style.display = 'none';
      grid.style.display = 'none';
      return;
    }

    grid.style.display = '';
    var cards = grid.querySelectorAll('.card');
    var secVisible = 0;

    cards.forEach(function(card, cardIdx) {
      var scholarKey = sec.keys[cardIdx] || '';

      if (schoolWhoKeys && !schoolWhoKeys[scholarKey]) {
        card.style.display = 'none';
        return;
      }

      var fields = ['card-title', 'card-sub', 'card-ja'].map(function(cls) {
        return card.querySelector('.' + cls);
      });
      if (!q) {
        card.style.display = '';
        secVisible++;
        fields.forEach(function(el) { if (el && el._orig) el.innerHTML = el._orig; });
      } else {
        var texts = fields.map(function(el) { return el ? (el._orig || '').toLowerCase() : ''; });
        var matched = texts.some(function(t) { return t.indexOf(q) !== -1; });
        if (matched) {
          card.style.display = '';
          secVisible++;
          fields.forEach(function(el) { if (el) el.innerHTML = _hlText(el._orig, q); });
        } else {
          card.style.display = 'none';
          fields.forEach(function(el) { if (el && el._orig) el.innerHTML = el._orig; });
        }
      }
    });

    labelEl.style.display = secVisible > 0 ? '' : 'none';
    if (secVisible === 0) grid.style.display = 'none';
    totalVisible += secVisible;
  });

  var countEl = document.getElementById('scholar-search-count');
  if (countEl) countEl.textContent = totalVisible > 0 ? (q ? '找到 ' + totalVisible + ' 位学者' : totalVisible + ' 位学者') : '';
  if (noResult) noResult.style.display = totalVisible === 0 ? 'block' : 'none';
}

function toggleSection(labelEl) {
  var grid = labelEl.nextElementSibling;
  if (!grid) return;
  labelEl.classList.toggle('collapsed');
  grid.classList.toggle('folded');
}

// ---- Initial render calls ----
renderScholarCards();
renderHomeGrid();
updateTabCounts();
