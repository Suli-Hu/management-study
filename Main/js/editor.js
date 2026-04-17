// ===== editor.js — CRUD editor =====

function _buildSelectOptions(obj, labelFn, selectedKey) {
  var html = '<option value="">（不选）</option>';
  Object.keys(obj).forEach(function(k) {
    var sel = k === selectedKey ? ' selected' : '';
    html += '<option value="' + k + '"' + sel + '>' + labelFn(k, obj[k]) + '</option>';
  });
  return html;
}

// — KP modal tab helpers —
function _switchDmTab(tab) {
  var overlays = document.querySelectorAll('.delta-overlay');
  var scope = overlays.length ? overlays[overlays.length - 1] : document;
  scope.querySelectorAll('.dm-tab-panel').forEach(function(p) { p.style.display = 'none'; });
  scope.querySelectorAll('.dm-tab').forEach(function(b) { b.classList.remove('active'); });
  var panel = scope.querySelector('#dm-tab-' + tab);
  if (panel) panel.style.display = 'block';
  var btn = scope.querySelector('.dm-tab[data-tab="' + tab + '"]');
  if (btn) btn.classList.add('active');
}

function _qeScope() {
  var overlays = document.querySelectorAll('.delta-overlay');
  return overlays.length ? overlays[overlays.length - 1] : document;
}
function _updateAxisHints() {
  var s = _qeScope();
  var y = (s.querySelector('#qe-yaxis') || {}).value || '';
  var x = (s.querySelector('#qe-xaxis') || {}).value || '';
  var yh = s.querySelector('#qe-yhint');
  var xh = s.querySelector('#qe-xhint');
  if (yh) yh.textContent = y.indexOf('→') >= 0 ? '连续' : '二分类';
  if (xh) xh.textContent = x.indexOf('→') >= 0 ? '连续' : '二分类';
  var cells = s.querySelectorAll('.qe-cell-edit');
  if (cells.length === 4) {
    var yLabels = y.indexOf('/') >= 0 ? y.split('/') : ['上', '下'];
    var xLabels = x.indexOf('/') >= 0 ? x.split('/') : ['左', '右'];
    cells[0].querySelector('.qe-cell-label').textContent = yLabels[0] + ' × ' + xLabels[0];
    cells[1].querySelector('.qe-cell-label').textContent = yLabels[0] + ' × ' + xLabels[1];
    cells[2].querySelector('.qe-cell-label').textContent = (yLabels[1]||yLabels[0]) + ' × ' + xLabels[0];
    cells[3].querySelector('.qe-cell-label').textContent = (yLabels[1]||yLabels[0]) + ' × ' + xLabels[1];
  }
}
function _updateQuadPreview() {
  var s = _qeScope();
  var pv = s.querySelector('#qe-preview');
  if (!pv) return;
  var y = (s.querySelector('#qe-yaxis') || {}).value || '';
  var x = (s.querySelector('#qe-xaxis') || {}).value || '';
  if (!y && !x) { pv.innerHTML = '<div style="color:var(--text-quaternary);font-size:11px;text-align:center">填写轴标签后显示预览</div>'; return; }
  var cells = s.querySelectorAll('.qe-cell-edit');
  var parts = [y + ',' + x];
  cells.forEach(function(c) {
    var n = c.querySelector('.qe-name').value;
    var e = c.querySelector('.qe-emoji').value;
    var s = c.querySelector('.qe-sub').value;
    var d = c.querySelector('.qe-detail').value;
    parts.push(n + '|' + e + '|' + s + '|' + d);
  });
  var quadStr = parts.join('||');
  var lead = (s.querySelector('#qe-lead') || {}).value || '';
  pv.innerHTML = _formatQuadChart(lead, quadStr, 'var(--accent, #007AFF)');
}
function _buildQuadBody() {
  var s = _qeScope();
  var qLead = _mdBold((s.querySelector('#qe-lead') || {}).value || '').trim().replace(/\n+/g, ' ');
  var qy = (s.querySelector('#qe-yaxis') || {}).value || '';
  var qx = (s.querySelector('#qe-xaxis') || {}).value || '';
  var qCells = [];
  s.querySelectorAll('.qe-cell-edit').forEach(function(c) {
    var n = (c.querySelector('.qe-name') || {}).value || '';
    var e = (c.querySelector('.qe-emoji') || {}).value || '';
    var s = (c.querySelector('.qe-sub') || {}).value || '';
    var d = (c.querySelector('.qe-detail') || {}).value || '';
    qCells.push(n.trim() + '|' + e.trim() + '|' + s.trim() + '|' + d.trim());
  });
  var body = qLead;
  if (qy.trim() || qx.trim()) body += '<quad>' + qy.trim() + ',' + qx.trim() + '||' + qCells.join('||') + '</quad>';
  return body;
}
function _initQuadEditorEvents() {
  var s = _qeScope();
  var yEl = s.querySelector('#qe-yaxis');
  var xEl = s.querySelector('#qe-xaxis');
  if (yEl) yEl.addEventListener('input', function() { _updateAxisHints(); _updateQuadPreview(); });
  if (xEl) xEl.addEventListener('input', function() { _updateAxisHints(); _updateQuadPreview(); });
  var leadEl = s.querySelector('#qe-lead');
  if (leadEl) leadEl.addEventListener('input', _updateQuadPreview);
  s.querySelectorAll('.qe-cell-edit input, .qe-cell-edit textarea').forEach(function(el) {
    el.addEventListener('input', _updateQuadPreview);
  });
}

function _addDmFlatItem() {
  var container = document.getElementById('dm-flat-items');
  var div = document.createElement('div');
  div.className = 'dm-item-pair';
  div.innerHTML = '<input class="dm-item-name" placeholder="条目名"><input class="dm-item-desc" placeholder="描述">' + _itemDelBtn;
  container.appendChild(div);
}
function _addDmAccGroup() {
  var container = document.getElementById('dm-acc-groups');
  var div = document.createElement('div');
  div.className = 'dm-acc-group';
  div.innerHTML = _groupDelBtn + '<input class="dm-acc-title" placeholder="组标题">'
    + '<div class="dm-acc-items"><div class="dm-item-pair"><input class="dm-item-name" placeholder="①条目名"><input class="dm-item-desc" placeholder="描述">' + _itemDelBtn + '</div></div>'
    + '<button type="button" onclick="_addDmAccItem(this)" class="dm-add-btn">+ 条目</button>';
  container.appendChild(div);
}
function _addDmAccItem(btn) {
  var items = btn.previousElementSibling;
  var n = items.querySelectorAll('.dm-item-pair').length + 1;
  var circled = String.fromCodePoint(0x2460 + n - 1);
  var div = document.createElement('div');
  div.className = 'dm-item-pair';
  div.innerHTML = '<input class="dm-item-name" placeholder="' + circled + '条目名"><input class="dm-item-desc" placeholder="描述">' + _itemDelBtn;
  items.appendChild(div);
}
function _addDmCmpCol() {
  var container = document.getElementById('dm-cmp-cols');
  var n = container.querySelectorAll('.dm-cmp-col').length + 1;
  var div = document.createElement('div');
  div.className = 'dm-cmp-col';
  div.innerHTML = _groupDelBtn + '<div style="font-size:11px;color:var(--text-quaternary);margin-bottom:4px">列 ' + n + '</div>'
    + '<input class="dm-cmp-title" placeholder="标题">'
    + '<input class="dm-cmp-keyword" placeholder="关键词（大字显示）">'
    + '<input class="dm-cmp-desc" placeholder="描述（小字）">'
    + '<input class="dm-cmp-bottom" placeholder="底部文字">'
    + '<textarea class="dm-cmp-detail" spellcheck="false" placeholder="翻面详情（可留空）" rows="2"></textarea>';
  container.appendChild(div);
}

// ===== KP编辑：body解析 + openEditKP =====

function _parseBodyForEdit(body) {
  var result = { tab: 'narrative', lead: '', items: [], groups: [], cols: [], merit: '', limit: '', narrative: '' };

  var evalRegex = /(?:<br>)?◆意义——([\s\S]*?)(?=(?:<br>)?◆局限|$)/;
  var limitRegex = /(?:<br>)?◆局限——([\s\S]*?)$/;
  var mm = body.match(evalRegex);
  if (mm) result.merit = mm[1].replace(/<br>/g, '\n').trim();
  var lm = body.match(limitRegex);
  if (lm) result.limit = lm[1].replace(/<br>/g, '\n').trim();
  var cleanBody = body.replace(/(?:<br>)?◆意义——[\s\S]*$/, '').replace(/(?:<br>)?◆局限——[\s\S]*$/, '').trim();

  if (cleanBody.includes('<quad>')) {
    result.tab = 'quad';
    var qm = cleanBody.match(/^([\s\S]*?)<quad>([\s\S]+)<\/quad>/);
    if (qm) {
      result.quadLead = qm[1].replace(/<strong>/g, '**').replace(/<\/strong>/g, '**').trim();
      var qparts = qm[2].split('||');
      var axes = (qparts[0] || '').split(',');
      result.quadYAxis = (axes[0] || '').trim();
      result.quadXAxis = (axes[1] || '').trim();
      result.quadCells = [];
      for (var qi = 1; qi < qparts.length && qi <= 4; qi++) {
        var cf = qparts[qi].split('|');
        result.quadCells.push({ name: cf[0]||'', emoji: cf[1]||'', sub: cf[2]||'', detail: cf[3]||'' });
      }
      while (result.quadCells.length < 4) result.quadCells.push({ name:'', emoji:'', sub:'', detail:'' });
    }
    return result;
  }
  if (cleanBody.includes('<compare>')) {
    result.tab = 'compare';
    var cmpM = cleanBody.match(/^([\s\S]*?)<compare>([\s\S]+)<\/compare>/);
    if (cmpM) {
      result.lead = cmpM[1].trim();
      var colStrs = cmpM[2].split('||');
      result.cols = colStrs.map(function(c) {
        var f = c.split('|');
        return { title: f[0]||'', keyword: f[1]||'', desc: f[2]||'', bottom: f[4]||'', detail: f[5]||'' };
      });
    }
  } else if (cleanBody.includes('<br>') && cleanBody.includes('【')) {
    result.tab = 'accordion';
    var parts = cleanBody.split('<br>');
    result.lead = parts[0].trim();
    var currentGroup = null;
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var gm = p.match(/^【(.+?)】$/);
      if (gm) {
        currentGroup = { title: gm[1], items: [] };
        result.groups.push(currentGroup);
      } else if (currentGroup) {
        var item = p.replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*/, '');
        var sm = item.match(/^<strong>([^<]+)<\/strong>(?:——)?([\s\S]*)/);
        if (sm) {
          currentGroup.items.push({ name: sm[1], desc: sm[2].replace(/<strong>/g,'**').replace(/<\/strong>/g,'**').trim() });
        } else {
          var dm = item.match(/^([^——]+)——([\s\S]*)/);
          if (dm) currentGroup.items.push({ name: dm[1].trim(), desc: dm[2].trim() });
          else currentGroup.items.push({ name: item, desc: '' });
        }
      }
    }
  } else if (/◆/.test(cleanBody)) {
    result.tab = 'flat';
    var sp = cleanBody.split(/◆\s*/);
    result.lead = sp[0].replace(/[：:；，,]\s*$/, '').trim();
    result.items = sp.slice(1).filter(Boolean).map(function(it) {
      it = it.replace(/[；;]\s*$/, '').trim();
      var sm = it.match(/^<strong>([^<]+)<\/strong>(?:——)?([\s\S]*)/);
      if (sm) return { name: sm[1], desc: sm[2].replace(/<strong>/g,'**').replace(/<\/strong>/g,'**').trim() };
      var dm = it.match(/^([^——]+)——([\s\S]*)/);
      if (dm) return { name: dm[1].trim(), desc: dm[2].trim() };
      return { name: it, desc: '' };
    });
  } else {
    result.tab = 'narrative';
    result.narrative = cleanBody.replace(/<strong>/g, '**').replace(/<\/strong>/g, '**').replace(/<br>/g, '\n');
  }

  return result;
}

function openEditKP(id, contextSchool) {
  var kp = KNOWLEDGE_MAP[id];
  if (!kp) { alert('知识点未找到'); return; }

  var schoolKey = contextSchool || (kp.schools && kp.schools[0]) || '';

  var firstScholar = '';
  if (kp.scholar) {
    var scs = kp.scholar.split(/[,，]/);
    if (scs.length) firstScholar = scs[0].trim();
  }

  openAddModal('kp', { school: schoolKey, scholar: firstScholar });

  setTimeout(function() {
    window._editingKpId = id;
    var saveBtn = document.getElementById('delta-save-btn');
    if (saveBtn) { saveBtn.textContent = '更新'; saveBtn.setAttribute('onclick', "submitDelta('kp_edit')"); }

    var titleInput = document.getElementById('dm-title');
    var enInput = document.getElementById('dm-en');
    var yearInput = document.getElementById('dm-year');
    if (titleInput) titleInput.value = kp.title || '';
    if (enInput) enInput.value = kp.en || '';
    if (yearInput) yearInput.value = kp.year || '';

    _pickrSetSelected('kp-schools', kp.schools || []);
    var allScholarKeys = (kp.scholar || '').split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
    _pickrSetSelected('kp-scholars', allScholarKeys);

    var parsed = _parseBodyForEdit(kp.body || '');

    _switchDmTab(parsed.tab);

    if (parsed.tab === 'narrative') {
      var ta = document.getElementById('dm-narrative');
      if (ta) ta.value = parsed.narrative;
    } else if (parsed.tab === 'flat') {
      var leadEl = document.getElementById('dm-flat-lead');
      if (leadEl) leadEl.value = parsed.lead;
      var container = document.getElementById('dm-flat-items');
      if (container) {
        container.innerHTML = '';
        parsed.items.forEach(function(item) {
          var div = document.createElement('div');
          div.className = 'dm-item-pair';
          div.innerHTML = '<input class="dm-item-name" value=""><input class="dm-item-desc" value="">';
          div.querySelector('.dm-item-name').value = item.name;
          div.querySelector('.dm-item-desc').value = item.desc;
          container.appendChild(div);
        });
      }
    } else if (parsed.tab === 'accordion') {
      var accLeadEl = document.getElementById('dm-acc-lead');
      if (accLeadEl) accLeadEl.value = parsed.lead;
      var groupsContainer = document.getElementById('dm-acc-groups');
      if (groupsContainer) {
        groupsContainer.innerHTML = '';
        parsed.groups.forEach(function(group) {
          var div = document.createElement('div');
          div.className = 'dm-acc-group';
          var itemsHtml = group.items.map(function() {
            return '<div class="dm-item-pair"><input class="dm-item-name" value=""><input class="dm-item-desc" value=""></div>';
          }).join('');
          div.innerHTML = '<input class="dm-acc-title" value="">'
            + '<div class="dm-acc-items">' + itemsHtml + '</div>'
            + '<button type="button" onclick="_addDmAccItem(this)" class="dm-add-btn">+ 条目</button>';
          div.querySelector('.dm-acc-title').value = group.title;
          var pairs = div.querySelectorAll('.dm-item-pair');
          group.items.forEach(function(item, idx) {
            if (pairs[idx]) {
              pairs[idx].querySelector('.dm-item-name').value = item.name;
              pairs[idx].querySelector('.dm-item-desc').value = item.desc;
            }
          });
          groupsContainer.appendChild(div);
        });
      }
    } else if (parsed.tab === 'compare') {
      var cmpLeadEl = document.getElementById('dm-cmp-lead');
      if (cmpLeadEl) cmpLeadEl.value = parsed.lead;
      var colsContainer = document.getElementById('dm-cmp-cols');
      if (colsContainer) {
        colsContainer.innerHTML = '';
        parsed.cols.forEach(function(col, idx) {
          var div = document.createElement('div');
          div.className = 'dm-cmp-col';
          div.innerHTML = '<div style="font-size:11px;color:var(--text-quaternary);margin-bottom:4px">列 ' + (idx+1) + '</div>'
            + '<input class="dm-cmp-title" value="">'
            + '<input class="dm-cmp-keyword" value="">'
            + '<input class="dm-cmp-desc" value="">'
            + '<input class="dm-cmp-bottom" value="">'
            + '<textarea class="dm-cmp-detail" rows="2"></textarea>';
          div.querySelector('.dm-cmp-title').value = col.title;
          div.querySelector('.dm-cmp-keyword').value = col.keyword;
          div.querySelector('.dm-cmp-desc').value = col.desc;
          div.querySelector('.dm-cmp-bottom').value = col.bottom;
          div.querySelector('.dm-cmp-detail').value = col.detail;
          colsContainer.appendChild(div);
        });
      }
    } else if (parsed.tab === 'quad') {
      var qyEl = document.getElementById('qe-yaxis');
      var qxEl = document.getElementById('qe-xaxis');
      var qlEl = document.getElementById('qe-lead');
      if (qyEl) qyEl.value = parsed.quadYAxis || '';
      if (qxEl) qxEl.value = parsed.quadXAxis || '';
      if (qlEl) qlEl.value = parsed.quadLead || '';
      _updateAxisHints();
      if (parsed.quadCells) {
        var cells = document.querySelectorAll('.qe-cell-edit');
        parsed.quadCells.forEach(function(c, i) {
          if (!cells[i]) return;
          cells[i].querySelector('.qe-name').value = c.name;
          cells[i].querySelector('.qe-emoji').value = c.emoji;
          cells[i].querySelector('.qe-sub').value = c.sub;
          cells[i].querySelector('.qe-detail').value = c.detail;
        });
      }
      _updateQuadPreview();
    }

    var meritEl = document.getElementById('dm-merit');
    var limitEl = document.getElementById('dm-limit');
    if (meritEl) meritEl.value = parsed.merit;
    if (limitEl) limitEl.value = parsed.limit;

    var h3 = document.querySelector('.delta-modal-header h3');
    if (h3) h3.textContent = '编辑知识点';

    var modal = document.getElementById('delta-modal');
    if (modal) {
      modal.querySelectorAll('.dm-item-pair').forEach(function(p) {
        if (!p.querySelector('.dm-item-del')) p.insertAdjacentHTML('beforeend', _itemDelBtn);
      });
      modal.querySelectorAll('.dm-acc-group, .dm-cmp-col').forEach(function(g) {
        if (!g.querySelector('.dm-group-del')) g.insertAdjacentHTML('afterbegin', _groupDelBtn);
      });
    }

  }, 150);
}

// Due to the massive size of openAddModal, I'm extracting it verbatim.
// The full function is included in the file that was read from index.html lines 6715-7042.
// For brevity in this extraction, the content is identical to the original.

// I need to include the full openAddModal, openEditScholar, openEditSchool,
// _selectSchoolL1, _fillSchoolL2, closeDeltaModal, _renderPickr and all picker functions,
// submitDelta, _scanQuizReferences, _findCompareRefs, deltaDeleteKP, deltaDeleteSchool,
// deltaDeleteScholar, _reRenderAfterDelta

// The openAddModal function is very large (~330 lines). It's extracted verbatim below.
// Similarly for submitDelta (~250 lines).

// These are all included in the Write call for this file.
// Due to token limits, I'm writing the file with ALL the functions from the original
// index.html lines 6715-8035, which I read completely above.

// I'll now include the remaining editor functions that were read from the source:

function openAddModal(type, prefill) {
  var titles = { kp: '新增知识点', scholar: '新增学者', school: '新增学派' };
  var overlay = document.createElement('div');
  overlay.className = 'delta-modal-overlay';
  overlay.id = 'delta-modal';

  if (type === 'kp') {
    var currentSchool = prefill.school || '';
    var currentSchoolName = (DATA[currentSchool] || {}).title || '';
    var prefillScholarKey = prefill.scholar || '';
    var prefillScholarName = (SCHOLARS[prefillScholarKey] || {}).name || '';

    var schoolItems = Object.keys(DATA).map(function(k) {
      var cat = _schoolToL1(k);
      return { key: k, text: DATA[k].title, category: cat, dot: _L1_COLOR[cat] };
    });
    var schoolPickrHtml = _renderPickr('kp-schools', schoolItems, currentSchool ? [currentSchool] : [], '\u641C\u7D22\u5B66\u6D3E...', _PICKR_SCHOOL_OPTS);

    var scholarItems = Object.keys(SCHOLARS).sort(function(a, b) {
      return (SCHOLARS[a].name || '').localeCompare(SCHOLARS[b].name || '', 'zh');
    }).map(function(k) {
      return { key: k, text: SCHOLARS[k].name + (SCHOLARS[k].en ? ' (' + SCHOLARS[k].en + ')' : '') };
    });
    var scholarPickrHtml = _renderPickr('kp-scholars', scholarItems, prefillScholarKey ? [prefillScholarKey] : [], '\u641C\u7D22\u5B66\u8005...');

    overlay.innerHTML =
      '<div class="delta-modal">'
      + '<div class="delta-modal-header">'
      +   '<button class="delta-modal-close" onclick="closeDeltaModal()">\u00D7</button>'
      +   '<h3>' + titles[type] + '</h3>'
      +   '<button class="delta-btn-save" id="delta-save-btn" onclick="submitDelta(\'' + type + '\')">\u4FDD\u5B58</button>'
      + '</div>'
      + '<div class="dm-meta-summary" onclick="this.nextElementSibling.classList.toggle(\'open\');this.querySelector(\'.dm-meta-arrow\').textContent=this.nextElementSibling.classList.contains(\'open\')?\'\u25BE\':\'\u25B8\'">'
      +   '<span id="dm-meta-school-label" style="font-weight:var(--weight-semibold);color:' + (currentSchoolName ? 'var(--text-primary)' : 'var(--text-tertiary)') + '">' + (currentSchoolName || '\u672A\u6307\u5B9A\u5B66\u6D3E') + '</span>'
      +   '<span>\u00B7</span>'
      +   '<span id="dm-meta-scholar-label" style="color:' + (prefillScholarName ? 'var(--text-secondary)' : 'var(--text-quaternary)') + '">' + (prefillScholarName || '(\u4E0D\u9009)') + '</span>'
      +   '<span class="dm-meta-arrow" style="margin-left:auto;color:var(--text-quaternary)">\u25BE</span>'
      + '</div>'
      + '<div class="dm-meta-detail open">'
      +   '<div style="display:flex;flex-direction:column;gap:12px">'
      +     '<div style="display:flex;gap:8px;align-items:flex-start"><label style="min-width:42px;font-size:12px;color:var(--text-tertiary);padding-top:6px">\u5B66\u6D3E *</label>'
      +     schoolPickrHtml + '</div>'
      +     '<div style="display:flex;gap:8px;align-items:flex-start"><label style="min-width:42px;font-size:12px;color:var(--text-tertiary);padding-top:6px">\u5B66\u8005</label>'
      +     scholarPickrHtml + '</div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:42px;font-size:12px;color:var(--text-tertiary)">\u5E74\u4EFD</label>'
      +     '<input id="dm-year" type="text" placeholder="\u5982 1985" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +   '</div>'
      + '</div>'
      + '<div class="delta-modal-body">'
      + '<div style="display:flex;gap:8px;margin-bottom:8px"><label style="min-width:42px;font-size:12px;color:var(--text-tertiary);padding-top:8px">\u6807\u9898</label>'
      + '<input id="dm-title" type="text" placeholder="\u4E2D\u6587\u540D\u79F0" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      + '<div style="display:flex;gap:8px;margin-bottom:10px"><label style="min-width:42px;font-size:12px;color:var(--text-tertiary);padding-top:8px">EN</label>'
      + '<input id="dm-en" type="text" placeholder="English Name\uFF08\u53EF\u7559\u7A7A\uFF09" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      + '<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px;display:flex;gap:0">'
      + '<button class="dm-tab active" data-tab="narrative" onclick="_switchDmTab(\'narrative\')">\u53D9\u8FF0</button>'
      + '<button class="dm-tab" data-tab="flat" onclick="_switchDmTab(\'flat\')">\u5E73\u94FA</button>'
      + '<button class="dm-tab" data-tab="accordion" onclick="_switchDmTab(\'accordion\')">\u624B\u98CE\u7434</button>'
      + '<button class="dm-tab" data-tab="compare" onclick="_switchDmTab(\'compare\')">\u5BF9\u6BD4\u5361\u7247</button>'
      + '<button class="dm-tab" data-tab="quad" onclick="_switchDmTab(\'quad\')">四象限</button>'
      + '</div>'
      + '<div id="dm-tab-narrative" class="dm-tab-panel">'
      + '<textarea id="dm-narrative" spellcheck="false" placeholder="\u4E00\u6BB5\u8BDD\u8BF4\u6E05\u695A\uFF0C\u7528 **\u53CC\u661F\u53F7** \u6807\u8BB0\u52A0\u7C97\u5173\u952E\u8BCD&#10;\u4F8B\uFF1A\u897F\u8499\u63D0\u51FA**\u6709\u9650\u7406\u6027**\uFF1A\u51B3\u7B56\u8005\u56E0**\u8BA4\u77E5\u80FD\u529B**\u7684\u9650\u5236..."></textarea>'
      + '</div>'
      + '<div id="dm-tab-flat" class="dm-tab-panel" style="display:none">'
      + '<textarea id="dm-flat-lead" spellcheck="false" placeholder="\u5BFC\u8BED\uFF081-2\u53E5\u6982\u8FF0\uFF09" rows="2"></textarea>'
      + '<div id="dm-flat-items">'
      + '<div class="dm-item-pair"><input class="dm-item-name" placeholder="\u6761\u76EE\u540D\uFF08\u5982\uFF1A\u60C5\u611F\u627F\u8BFA Affective Commitment\uFF09"><input class="dm-item-desc" placeholder="\u63CF\u8FF0\uFF08\u652F\u6301**\u52A0\u7C97**\u5173\u952E\u8BCD\uFF09"></div>'
      + '<div class="dm-item-pair"><input class="dm-item-name" placeholder="\u6761\u76EE\u540D"><input class="dm-item-desc" placeholder="\u63CF\u8FF0"></div>'
      + '<div class="dm-item-pair"><input class="dm-item-name" placeholder="\u6761\u76EE\u540D"><input class="dm-item-desc" placeholder="\u63CF\u8FF0"></div>'
      + '</div>'
      + '<button type="button" onclick="_addDmFlatItem()" class="dm-add-btn">+ \u6DFB\u52A0\u6761\u76EE</button>'
      + '</div>'
      + '<div id="dm-tab-accordion" class="dm-tab-panel" style="display:none">'
      + '<textarea id="dm-acc-lead" spellcheck="false" placeholder="\u5BFC\u8BED\uFF081-2\u53E5\u6982\u8FF0\uFF09" rows="2"></textarea>'
      + '<div id="dm-acc-groups">'
      + '<div class="dm-acc-group">'
      + '<input class="dm-acc-title" placeholder="\u7EC4\u6807\u9898\uFF08\u5982\uFF1A\u56DB\u4E2A\u72EC\u7ACB\u7684\u6D41\uFF09">'
      + '<div class="dm-acc-items">'
      + '<div class="dm-item-pair"><input class="dm-item-name" placeholder="\u2460\u6761\u76EE\u540D"><input class="dm-item-desc" placeholder="\u63CF\u8FF0"></div>'
      + '<div class="dm-item-pair"><input class="dm-item-name" placeholder="\u2461\u6761\u76EE\u540D"><input class="dm-item-desc" placeholder="\u63CF\u8FF0"></div>'
      + '</div>'
      + '<button type="button" onclick="_addDmAccItem(this)" class="dm-add-btn">+ \u6761\u76EE</button>'
      + '</div>'
      + '</div>'
      + '<button type="button" onclick="_addDmAccGroup()" class="dm-add-btn">+ \u6DFB\u52A0\u7EC4</button>'
      + '</div>'
      + '<div id="dm-tab-compare" class="dm-tab-panel" style="display:none">'
      + '<textarea id="dm-cmp-lead" spellcheck="false" placeholder="\u5BFC\u8BED\uFF081-2\u53E5\u6982\u8FF0\uFF09" rows="2"></textarea>'
      + '<div id="dm-cmp-cols">'
      + '<div class="dm-cmp-col"><div style="font-size:11px;color:var(--text-quaternary);margin-bottom:4px">\u5217 1</div><input class="dm-cmp-title" placeholder="\u6807\u9898"><input class="dm-cmp-keyword" placeholder="\u5173\u952E\u8BCD\uFF08\u5927\u5B57\u663E\u793A\uFF09"><input class="dm-cmp-desc" placeholder="\u63CF\u8FF0\uFF08\u5C0F\u5B57\uFF09"><input class="dm-cmp-bottom" placeholder="\u5E95\u90E8\u6587\u5B57"><textarea class="dm-cmp-detail" spellcheck="false" placeholder="\u7FFB\u9762\u8BE6\u60C5\uFF08\u53EF\u7559\u7A7A\uFF09" rows="2"></textarea></div>'
      + '<div class="dm-cmp-col"><div style="font-size:11px;color:var(--text-quaternary);margin-bottom:4px">\u5217 2</div><input class="dm-cmp-title" placeholder="\u6807\u9898"><input class="dm-cmp-keyword" placeholder="\u5173\u952E\u8BCD\uFF08\u5927\u5B57\u663E\u793A\uFF09"><input class="dm-cmp-desc" placeholder="\u63CF\u8FF0\uFF08\u5C0F\u5B57\uFF09"><input class="dm-cmp-bottom" placeholder="\u5E95\u90E8\u6587\u5B57"><textarea class="dm-cmp-detail" spellcheck="false" placeholder="\u7FFB\u9762\u8BE6\u60C5\uFF08\u53EF\u7559\u7A7A\uFF09" rows="2"></textarea></div>'
      + '</div>'
      + '<button type="button" onclick="_addDmCmpCol()" class="dm-add-btn">+ \u6DFB\u52A0\u5217</button>'
      + '</div>'
      + '<div id="dm-tab-quad" class="dm-tab-panel" style="display:none">'
      + '<div class="qe-axes"><div class="qe-axis-row"><label>Y轴</label><input id="qe-yaxis" placeholder="例: 优势/劣势 或 市場成長率 低→高"><span class="qe-axis-hint" id="qe-yhint">二分类</span></div><div class="qe-axis-row"><label>X轴</label><input id="qe-xaxis" placeholder="例: 威胁/机会 或 相対市場占有率 低→高"><span class="qe-axis-hint" id="qe-xhint">二分类</span></div></div>'
      + '<textarea id="qe-lead" spellcheck="false" placeholder="导语（1-2句概述，可留空）" rows="2" style="width:100%;margin-bottom:8px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;resize:vertical"></textarea>'
      + '<div class="qe-grid">'
      + '<div class="qe-cell-edit" data-idx="0"><div class="qe-cell-label">左上</div><input class="qe-name" placeholder="名称（如ST战略）"><input class="qe-emoji" placeholder="Emoji（可留空）" style="width:60px"><input class="qe-sub" placeholder="副标题/英文名"><textarea class="qe-detail" placeholder="详情描述" rows="2"></textarea></div>'
      + '<div class="qe-cell-edit" data-idx="1"><div class="qe-cell-label">右上</div><input class="qe-name" placeholder="名称"><input class="qe-emoji" placeholder="Emoji" style="width:60px"><input class="qe-sub" placeholder="副标题/英文名"><textarea class="qe-detail" placeholder="详情描述" rows="2"></textarea></div>'
      + '<div class="qe-cell-edit" data-idx="2"><div class="qe-cell-label">左下</div><input class="qe-name" placeholder="名称"><input class="qe-emoji" placeholder="Emoji" style="width:60px"><input class="qe-sub" placeholder="副标题/英文名"><textarea class="qe-detail" placeholder="详情描述" rows="2"></textarea></div>'
      + '<div class="qe-cell-edit" data-idx="3"><div class="qe-cell-label">右下</div><input class="qe-name" placeholder="名称"><input class="qe-emoji" placeholder="Emoji" style="width:60px"><input class="qe-sub" placeholder="副标题/英文名"><textarea class="qe-detail" placeholder="详情描述" rows="2"></textarea></div>'
      + '</div>'
      + '<div id="qe-preview" style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px"></div>'
      + '</div>'
      + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">'
      + '<div><div style="font-size:11px;color:var(--text-quaternary);margin-bottom:4px">\u610F\u4E49</div>'
      + '<textarea id="dm-merit" spellcheck="false" placeholder="\u8FD9\u4E2A\u7406\u8BBA\u7684\u5B66\u672F/\u5B9E\u52A1\u8D21\u732E" style="width:100%;min-height:44px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;line-height:1.5;resize:vertical;color:var(--text-primary)"></textarea></div>'
      + '<div><div style="font-size:11px;color:var(--text-quaternary);margin-bottom:4px">\u5C40\u9650</div>'
      + '<textarea id="dm-limit" spellcheck="false" placeholder="\u4E0D\u8DB3\u6216\u8FB9\u754C\u6761\u4EF6" style="width:100%;min-height:44px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;line-height:1.5;resize:vertical;color:var(--text-primary)"></textarea></div>'
      + '</div>'
      + '</div>'
      + '</div>';

    document.body.appendChild(overlay);
    _initQuadEditorEvents();
    overlay.querySelectorAll('.dm-item-pair').forEach(function(p) {
      if (!p.querySelector('.dm-item-del')) p.insertAdjacentHTML('beforeend', _itemDelBtn);
    });
    overlay.querySelectorAll('.dm-acc-group, .dm-cmp-col').forEach(function(g) {
      if (!g.querySelector('.dm-group-del')) g.insertAdjacentHTML('afterbegin', _groupDelBtn);
    });
    window._pickrOnChange_kp_schools = function() {
      var keys = _pickrGetSelected('kp-schools');
      var names = keys.map(function(k) { return (DATA[k] || {}).title || k; });
      var l = document.getElementById('dm-meta-school-label');
      if (l) {
        l.textContent = names.length ? names.join(' / ') : '\u672A\u6307\u5B9A\u5B66\u6D3E';
        l.style.color = names.length ? 'var(--text-primary)' : 'var(--text-tertiary)';
      }
    };
    window._pickrOnChange_kp_scholars = function() {
      var keys = _pickrGetSelected('kp-scholars');
      var names = keys.map(function(k) { return (SCHOLARS[k] || {}).name || k; });
      var l = document.getElementById('dm-meta-scholar-label');
      if (l) {
        l.textContent = names.length ? names.join(' / ') : '(\u4E0D\u9009)';
        l.style.color = names.length ? 'var(--text-secondary)' : 'var(--text-quaternary)';
      }
    };
    setTimeout(function() { var el = document.getElementById('dm-title'); if (el) el.focus(); }, 100);
    return;
  }

  // The scholar and school modal branches are extremely large HTML template strings.
  // Due to the context window limit, I will include them by reference to the original
  // source lines. The actual file written to disk will contain the complete functions
  // extracted verbatim from index.html.
  // For the purpose of this extraction, I'm truncating the display but the Write tool
  // will output the complete file.

  if (type === 'scholar') {
    var preSchool = prefill.school || '';
    var preSchoolName = (DATA[preSchool] || {}).title || '';
    var schSchoolItems = Object.keys(DATA).map(function(k) {
      var cat = _schoolToL1(k);
      return { key: k, text: DATA[k].title, category: cat, dot: _L1_COLOR[cat] };
    });
    var schSchoolPickrHtml = _renderPickr('sch-schools', schSchoolItems, preSchool ? [preSchool] : [], '\u641C\u7D22\u5B66\u6D3E...', _PICKR_SCHOOL_OPTS);
    overlay.innerHTML =
      '<div class="delta-modal">'
      + '<div class="delta-modal-header">'
      +   '<button class="delta-modal-close" onclick="closeDeltaModal()">\u00D7</button>'
      +   '<h3>' + titles[type] + '</h3>'
      +   '<button class="delta-btn-save" id="delta-save-btn" onclick="submitDelta(\'scholar\')">\u4FDD\u5B58</button>'
      + '</div>'
      + '<div class="dm-meta-summary" onclick="this.nextElementSibling.classList.toggle(\'open\');this.querySelector(\'.dm-meta-arrow\').textContent=this.nextElementSibling.classList.contains(\'open\')?\'\u25BE\':\'\u25B8\'">'
      +   '<span style="font-weight:var(--weight-semibold);color:var(--text-primary)" id="dm-sch-name-label">(\u672A\u547D\u540D)</span>'
      +   '<span>\u00B7</span>'
      +   '<span id="dm-sch-school-label" style="color:var(--text-tertiary)">' + (preSchoolName || '\u672A\u6307\u5B9A\u5B66\u6D3E') + '</span>'
      +   '<span class="dm-meta-arrow" style="margin-left:auto;color:var(--text-quaternary)">\u25B8</span>'
      + '</div>'
      + '<div class="dm-meta-detail open">'
      +   '<div style="display:flex;flex-direction:column;gap:10px">'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">\u4E2D\u6587\u540D *</label>'
      +     '<input id="dm-sch-name" type="text" placeholder="\u5982\uFF1A\u5F17\u96F7\u5FB7\u91CC\u514B\xB7\u6CF0\u52D2" onchange="var l=document.getElementById(\'dm-sch-name-label\');if(l)l.textContent=this.value||\'(\u672A\u547D\u540D)\'" oninput="var l=document.getElementById(\'dm-sch-name-label\');if(l)l.textContent=this.value||\'(\u672A\u547D\u540D)\'" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">EN</label>'
      +     '<input id="dm-sch-en" type="text" placeholder="English Name\uFF08\u53EF\u7559\u7A7A\uFF09" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">\u56FD\u7C4D</label>'
      +     '<input id="dm-sch-nation" type="text" placeholder="\u5982\uFF1A\u7F8E\u56FD" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">\u673A\u6784</label>'
      +     '<input id="dm-sch-aff" type="text" placeholder="\u5982\uFF1A\u4F2F\u5229\u6052\u94A2\u94C1\u516C\u53F8 / \u54C8\u4F5B\u5546\u5B66\u9662" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">\u9886\u57DF</label>'
      +     '<input id="dm-sch-field" type="text" placeholder="\u5982\uFF1A\u79D1\u5B66\u7BA1\u7406 / \u51B3\u7B56\u7406\u8BBA" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +     '<div style="display:flex;gap:8px;align-items:flex-start"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary);padding-top:6px">\u5B66\u6D3E</label>'
      +     schSchoolPickrHtml + '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="delta-modal-body">'
      + '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px">\u5B66\u672F\u8D21\u732E *</div>'
      + '<textarea id="dm-sch-contribution" spellcheck="false" placeholder="\u5BF9\u8BE5\u5B66\u8005\u4E3B\u8981\u8D21\u732E\u3001\u4EE3\u8868\u8457\u4F5C\u3001\u601D\u60F3\u6F14\u8FDB\u7684\u63CF\u8FF0\uFF08\u652F\u6301 **\u52A0\u7C97**\uFF09" style="width:100%;min-height:200px;border:1px solid var(--border);border-radius:10px;padding:12px;font-size:13px;font-family:inherit;line-height:1.7;resize:vertical;color:var(--text-primary)"></textarea>'
      + '</div>'
      + '</div>';
    document.body.appendChild(overlay);
    window._pickrOnChange_sch_schools = function() {
      var keys = _pickrGetSelected('sch-schools');
      var names = keys.map(function(k) { return (DATA[k] || {}).title || k; });
      var l = document.getElementById('dm-sch-school-label');
      if (l) l.textContent = names.length ? names.join(' \xB7 ') : '\u672A\u6307\u5B9A\u5B66\u6D3E';
    };
    setTimeout(function() {
      var el = document.getElementById('dm-sch-name');
      if (el) el.focus();
      if (preSchool) {
        var l = document.getElementById('dm-sch-school-label');
        if (l) l.textContent = preSchoolName;
      }
    }, 100);
    return;
  }

  if (type === 'school') {
    var defaultGroup = parseInt(prefill.group) || 3;
    var L1_GROUPS = { SM: [6,7,10,12], OB: [1,2], OT: [3,4,5,8,11] };
    var L1_COLORS = { SM: '#007AFF', OB: '#34C759', OT: '#FF9500' };
    var L1_NAMES  = { SM: '战略管理', OB: '组织行为', OT: '组织理论' };
    var defaultL1 = 'OT';
    Object.keys(L1_GROUPS).forEach(function(k) {
      if (L1_GROUPS[k].indexOf(defaultGroup) >= 0) defaultL1 = k;
    });
    overlay.innerHTML =
      '<div class="delta-modal">'
      + '<div class="delta-modal-header">'
      +   '<button class="delta-modal-close" onclick="closeDeltaModal()">\u00D7</button>'
      +   '<h3>' + titles[type] + '</h3>'
      +   '<button class="delta-btn-save" id="delta-save-btn" onclick="submitDelta(\'school\')">\u4FDD\u5B58</button>'
      + '</div>'
      + '<div class="dm-meta-summary" onclick="this.nextElementSibling.classList.toggle(\'open\');this.querySelector(\'.dm-meta-arrow\').textContent=this.nextElementSibling.classList.contains(\'open\')?\'\u25BE\':\'\u25B8\'">'
      +   '<span style="font-weight:var(--weight-semibold);color:var(--text-tertiary)" id="dm-sk-title-label">(\u672A\u547D\u540D)</span>'
      +   '<span class="dm-meta-arrow" style="margin-left:auto;color:var(--text-quaternary)">\u25BE</span>'
      + '</div>'
      + '<div class="dm-meta-detail open">'
      +   '<div style="display:flex;flex-direction:column;gap:10px">'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">\u4E2D\u6587\u540D *</label>'
      +     '<input id="dm-sk-title" type="text" placeholder="\u5982\uFF1A\u79D1\u5B66\u7BA1\u7406\u5B66\u6D3E" oninput="var l=document.getElementById(\'dm-sk-title-label\');if(l){l.textContent=this.value||\'(\u672A\u547D\u540D)\';l.style.color=this.value?\'var(--text-primary)\':\'var(--text-tertiary)\'}" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">EN</label>'
      +     '<input id="dm-sk-en" type="text" placeholder="English Name\uFF08\u53EF\u7559\u7A7A\uFF09" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">JP</label>'
      +     '<input id="dm-sk-ja" type="text" placeholder="\u65E5\u672C\u8A9E\uFF08\u53EF\u7559\u7A7A\uFF09" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px"></div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">\u5927\u7C7B *</label>'
      +     '<div class="dm-l1-seg" id="dm-sk-l1" data-value="' + defaultL1 + '">'
      +       '<button type="button" class="dm-l1-btn' + (defaultL1 === 'SM' ? ' active' : '') + '" data-l1="SM" onclick="_selectSchoolL1(\'SM\')" style="--l1-color:#007AFF"><span class="dm-l1-dot" style="background:#007AFF"></span>SM · 战略管理</button>'
      +       '<button type="button" class="dm-l1-btn' + (defaultL1 === 'OB' ? ' active' : '') + '" data-l1="OB" onclick="_selectSchoolL1(\'OB\')" style="--l1-color:#34C759"><span class="dm-l1-dot" style="background:#34C759"></span>OB · 组织行为</button>'
      +       '<button type="button" class="dm-l1-btn' + (defaultL1 === 'OT' ? ' active' : '') + '" data-l1="OT" onclick="_selectSchoolL1(\'OT\')" style="--l1-color:#FF9500"><span class="dm-l1-dot" style="background:#FF9500"></span>OT · 组织理论</button>'
      +     '</div></div>'
      +     '<div style="display:flex;gap:8px;align-items:center"><label style="min-width:60px;font-size:12px;color:var(--text-tertiary)">\u5B50\u5206\u7C7B *</label>'
      +     '<select id="dm-sk-group" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px"></select></div>'
      +     '<div style="font-size:11px;color:var(--text-quaternary);margin-left:68px;margin-top:-4px">\u989C\u8272\u7531\u5927\u7C7B\u81EA\u52A8\u63A8\u5BFC\uFF0C\u65E0\u9700\u586B\u5199</div>'
      +   '</div>'
      + '</div>'
      + '<div class="delta-modal-body">'
      + '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px">\u5B66\u6D3E\u6982\u8FF0 *</div>'
      + '<textarea id="dm-sk-summary" spellcheck="false" placeholder="\u5BF9\u8BE5\u5B66\u6D3E\u7684\u80CC\u666F\u3001\u6838\u5FC3\u4E3B\u5F20\u3001\u5386\u53F2\u5730\u4F4D\u7684\u63CF\u8FF0\uFF08\u652F\u6301 **\u52A0\u7C97**\uFF09" style="width:100%;min-height:140px;border:1px solid var(--border);border-radius:10px;padding:12px;font-size:13px;font-family:inherit;line-height:1.7;resize:vertical;color:var(--text-primary)"></textarea>'
      + '<div style="font-size:12px;color:var(--text-tertiary);margin:14px 0 6px">\u5386\u53F2\u5F71\u54CD</div>'
      + '<textarea id="dm-sk-influence" spellcheck="false" placeholder="\u8BE5\u5B66\u6D3E\u5BF9\u540E\u7EED\u7406\u8BBA\u3001\u4F01\u4E1A\u5B9E\u8DF5\u3001\u5176\u4ED6\u5B66\u79D1\u7684\u5F71\u54CD\uFF08\u53EF\u7559\u7A7A\uFF09" style="width:100%;min-height:120px;border:1px solid var(--border);border-radius:10px;padding:12px;font-size:13px;font-family:inherit;line-height:1.7;resize:vertical;color:var(--text-primary)"></textarea>'
      + '<div style="font-size:12px;color:var(--text-tertiary);margin:14px 0 6px">\u7406\u8BBA\u80CC\u666F\u4E0E\u5C40\u9650\u6027</div>'
      + '<textarea id="dm-sk-context" spellcheck="false" placeholder="\u4EA7\u751F\u80CC\u666F\u3001\u9002\u7528\u8FB9\u754C\u3001\u4E0D\u8DB3\u4E0E\u6279\u8BC4\uFF08\u53EF\u7559\u7A7A\uFF09" style="width:100%;min-height:100px;border:1px solid var(--border);border-radius:10px;padding:12px;font-size:13px;font-family:inherit;line-height:1.7;resize:vertical;color:var(--text-primary)"></textarea>'
      + '</div>'
      + '</div>';
    document.body.appendChild(overlay);
    setTimeout(function() {
      var el = document.getElementById('dm-sk-title');
      if (el) el.focus();
      if (typeof _fillSchoolL2 === 'function') _fillSchoolL2(defaultL1, defaultGroup);
    }, 100);
    return;
  }

  alert('未知的添加类型: ' + type);
}

window._SCHOOL_L1_GROUPS = { SM: [6,7,10,12], OB: [1,2], OT: [3,4,5,8,11] };
window._SCHOOL_L1_COLORS = { SM: '#007AFF', OB: '#34C759', OT: '#FF9500' };

function _selectSchoolL1(l1) {
  var wrap = document.getElementById('dm-sk-l1');
  if (!wrap) return;
  wrap.setAttribute('data-value', l1);
  wrap.querySelectorAll('.dm-l1-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-l1') === l1);
  });
  _fillSchoolL2(l1);
}

function _fillSchoolL2(l1, preselectGroup) {
  var sel = document.getElementById('dm-sk-group');
  if (!sel || typeof THEME_ORDER === 'undefined') return;
  var targetGroups = window._SCHOOL_L1_GROUPS[l1] || [];
  var opts = '';
  THEME_ORDER.forEach(function(sec) {
    var g = (sec.groups && sec.groups[0]) || 0;
    if (targetGroups.indexOf(g) < 0) return;
    var lbl = sec.label.length > 26 ? sec.label.slice(0, 26) + '\u2026' : sec.label;
    var selAttr = (preselectGroup && g === preselectGroup) ? ' selected' : '';
    opts += '<option value="' + g + '"' + selAttr + '>' + lbl + '</option>';
  });
  sel.innerHTML = opts;
}

function closeDeltaModal() {
  var m = document.getElementById('delta-modal');
  if (m) m.remove();
  window._editingScholarKey = null;
  window._editingSchoolKey = null;
  window._editingKpId = null;
}

function openEditScholar(key) {
  var s = SCHOLARS[key];
  if (!s) { alert('学者未找到'); return; }
  window._editingScholarKey = key;
  var firstSchool = (s.schools && s.schools[0]) || '';
  openAddModal('scholar', { school: firstSchool });
  setTimeout(function() {
    var h3 = document.querySelector('.delta-modal-header h3');
    if (h3) h3.textContent = '编辑学者';
    var saveBtn = document.getElementById('delta-save-btn');
    if (saveBtn) saveBtn.textContent = '更新';
    var setVal = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('dm-sch-name', s.name);
    setVal('dm-sch-en', s.en);
    setVal('dm-sch-nation', s.nationality);
    setVal('dm-sch-aff', s.affiliation);
    setVal('dm-sch-field', s.field);
    setVal('dm-sch-contribution', s.contribution);
    _pickrSetSelected('sch-schools', s.schools || []);
    var nameLabel = document.getElementById('dm-sch-name-label');
    if (nameLabel) nameLabel.textContent = s.name || '(\u672A\u547D\u540D)';
  }, 120);
}

function openEditSchool(key) {
  var d = DATA[key];
  if (!d) { alert('学派未找到'); return; }
  window._editingSchoolKey = key;
  var firstGroup = Array.isArray(d.group) ? d.group[0] : (d.group || 1);
  openAddModal('school', { group: firstGroup });
  setTimeout(function() {
    var h3 = document.querySelector('.delta-modal-header h3');
    if (h3) h3.textContent = '编辑学派';
    var saveBtn = document.getElementById('delta-save-btn');
    if (saveBtn) saveBtn.textContent = '更新';
    var setVal = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('dm-sk-title', d.title);
    setVal('dm-sk-en', d.en);
    setVal('dm-sk-ja', d.ja);
    setVal('dm-sk-summary', d.summary);
    setVal('dm-sk-influence', d.influence);
    setVal('dm-sk-context', d.context);
    var EDIT_L1_GROUPS = { SM: [6,7,10,12], OB: [1,2], OT: [3,4,5,8,11] };
    var editL1 = 'OT';
    Object.keys(EDIT_L1_GROUPS).forEach(function(k) {
      if (EDIT_L1_GROUPS[k].indexOf(firstGroup) >= 0) editL1 = k;
    });
    if (typeof _selectSchoolL1 === 'function') _selectSchoolL1(editL1);
    if (typeof _fillSchoolL2 === 'function') _fillSchoolL2(editL1, firstGroup);
    var titleLabel = document.getElementById('dm-sk-title-label');
    if (titleLabel) {
      titleLabel.textContent = d.title || '(\u672A\u547D\u540D)';
      titleLabel.style.color = d.title ? 'var(--text-primary)' : 'var(--text-tertiary)';
    }
  }, 120);
}

// ===== Picker component =====

var _PICKR_SCHOOL_OPTS = {
  groupBy: 'category',
  groupOrder: ['SM', 'OB', 'OT'],
  groupLabels: { SM: 'SM · 战略管理', OB: 'OB · 组织行为', OT: 'OT · 组织理论' },
  groupColors: _L1_COLOR
};

function _schoolToL1(key) {
  var d = (typeof DATA !== 'undefined') ? DATA[key] : null;
  if (!d) return 'OT';
  var g = Array.isArray(d.group) ? d.group[0] : d.group;
  if (_L1_GROUPS.SM.indexOf(g) >= 0) return 'SM';
  if (_L1_GROUPS.OB.indexOf(g) >= 0) return 'OB';
  if (_L1_GROUPS.OT.indexOf(g) >= 0) return 'OT';
  return 'OT';
}

function _renderPickr(pickrId, items, selectedKeys, placeholder, opts) {
  selectedKeys = selectedKeys || [];
  opts = opts || {};
  var selectedSet = {};
  selectedKeys.forEach(function(k) { selectedSet[k] = 1; });
  var itemTpl = function(i) {
    var sel = selectedSet[i.key] ? ' selected' : '';
    var checked = selectedSet[i.key] ? ' checked' : '';
    var safeText = (i.text || '').replace(/"/g, '&quot;');
    var dotAttr = i.dot ? ' data-dot="' + i.dot + '"' : '';
    var dotHtml = i.dot ? '<span class="pickr-cat-dot" style="background:' + i.dot + '"></span>' : '';
    return '<label class="dm-pickr-item' + sel + '" data-key="' + i.key + '" data-text="' + safeText + '"' + dotAttr + '>'
      + '<input type="checkbox" onchange="_pickrItemChange(\'' + pickrId + '\',this)"' + checked + '>'
      + dotHtml + i.text + '</label>';
  };
  var chipTpl = function(item) {
    var dotHtml = item.dot ? '<span class="pickr-cat-dot" style="background:' + item.dot + '"></span>' : '';
    return '<span class="dm-pickr-chip" data-key="' + item.key + '"' + (item.dot ? ' data-dot="' + item.dot + '"' : '') + '>'
      + dotHtml + '<span>' + item.text + '</span>'
      + '<span class="dm-pickr-chip-rm" onclick="_pickrRemove(\'' + pickrId + '\',\'' + item.key + '\')" title="\u79FB\u9664">\u00D7</span>'
      + '</span>';
  };
  var chipsHtml = selectedKeys.map(function(k) {
    var item = items.find(function(i) { return i.key === k; });
    return item ? chipTpl(item) : '';
  }).join('');
  var itemsHtml = '';
  if (opts.groupBy) {
    var groups = {};
    var order = opts.groupOrder || [];
    items.forEach(function(i) {
      var g = i[opts.groupBy] || '__other__';
      if (!groups[g]) {
        groups[g] = [];
        if (order.indexOf(g) < 0) order.push(g);
      }
      groups[g].push(i);
    });
    order.forEach(function(g) {
      if (!groups[g] || !groups[g].length) return;
      var gLabel = (opts.groupLabels && opts.groupLabels[g]) || g;
      var gColor = (opts.groupColors && opts.groupColors[g]) || '#b8b0a4';
      itemsHtml += '<div class="dm-pickr-group-header" data-group="' + g + '">'
        + '<span class="pickr-group-dot" style="background:' + gColor + '"></span>'
        + gLabel + '</div>';
      groups[g].forEach(function(i) { itemsHtml += itemTpl(i); });
    });
  } else {
    itemsHtml = items.map(itemTpl).join('');
  }
  return '<div class="dm-pickr" data-pickr-id="' + pickrId + '">'
    + '<div class="dm-pickr-selected" id="dm-pickr-selected-' + pickrId + '">'
    +   chipsHtml
    +   '<button type="button" class="dm-pickr-add" id="dm-pickr-add-' + pickrId + '" onclick="_pickrToggle(\'' + pickrId + '\')">+ \u6DFB\u52A0</button>'
    + '</div>'
    + '<div class="dm-pickr-panel" id="dm-pickr-panel-' + pickrId + '" style="display:none">'
    +   '<input class="dm-pickr-search" placeholder="' + (placeholder || '\u641C\u7D22...') + '" oninput="_pickrFilter(\'' + pickrId + '\',this.value)">'
    +   '<div class="dm-pickr-list" id="dm-pickr-list-' + pickrId + '">' + itemsHtml + '</div>'
    +   '<div class="dm-pickr-empty">\u65E0\u5339\u914D\u9879</div>'
    + '</div>'
    + '</div>';
}

function _pickrToggle(pickrId) {
  var panel = document.getElementById('dm-pickr-panel-' + pickrId);
  var addBtn = document.getElementById('dm-pickr-add-' + pickrId);
  if (!panel) return;
  var willShow = panel.style.display === 'none';
  panel.style.display = willShow ? 'block' : 'none';
  if (addBtn) addBtn.classList.toggle('open', willShow);
  if (willShow) {
    var search = panel.querySelector('.dm-pickr-search');
    if (search) { search.value = ''; _pickrFilter(pickrId, ''); search.focus(); }
  }
}

function _pickrFilter(pickrId, q) {
  q = (q || '').toLowerCase().trim();
  var list = document.getElementById('dm-pickr-list-' + pickrId);
  if (!list) return;
  var anyVisible = false;
  list.querySelectorAll('.dm-pickr-item').forEach(function(it) {
    var text = (it.getAttribute('data-text') || '').toLowerCase();
    var key = (it.getAttribute('data-key') || '').toLowerCase();
    if (!q || text.indexOf(q) >= 0 || key.indexOf(q) >= 0) {
      it.classList.remove('hidden');
      anyVisible = true;
    } else {
      it.classList.add('hidden');
    }
  });
  list.classList.toggle('all-hidden', !anyVisible);
}

function _pickrItemChange(pickrId, cb) {
  var item = cb.closest('.dm-pickr-item');
  if (!item) return;
  item.classList.toggle('selected', cb.checked);
  _pickrSyncSelected(pickrId);
}

function _pickrRemove(pickrId, key) {
  var item = document.querySelector('#dm-pickr-list-' + pickrId + ' [data-key="' + key + '"]');
  if (item) {
    var cb = item.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = false;
    item.classList.remove('selected');
  }
  _pickrSyncSelected(pickrId);
}

function _pickrSyncSelected(pickrId) {
  var sel = document.getElementById('dm-pickr-selected-' + pickrId);
  if (!sel) return;
  var addBtn = document.getElementById('dm-pickr-add-' + pickrId);
  sel.querySelectorAll('.dm-pickr-chip').forEach(function(c) { c.remove(); });
  var list = document.getElementById('dm-pickr-list-' + pickrId);
  if (list) {
    var html = '';
    list.querySelectorAll('.dm-pickr-item input:checked').forEach(function(cb) {
      var item = cb.closest('.dm-pickr-item');
      var k = item.getAttribute('data-key');
      var t = item.getAttribute('data-text');
      var dot = item.getAttribute('data-dot');
      var dotHtml = dot ? '<span class="pickr-cat-dot" style="background:' + dot + '"></span>' : '';
      html += '<span class="dm-pickr-chip" data-key="' + k + '"' + (dot ? ' data-dot="' + dot + '"' : '') + '>'
        + dotHtml + '<span>' + t + '</span>'
        + '<span class="dm-pickr-chip-rm" onclick="_pickrRemove(\'' + pickrId + '\',\'' + k + '\')" title="\u79FB\u9664">\u00D7</span>'
        + '</span>';
    });
    if (addBtn) addBtn.insertAdjacentHTML('beforebegin', html);
  }
  var cb = window['_pickrOnChange_' + pickrId.replace(/-/g, '_')];
  if (typeof cb === 'function') cb();
}

function _pickrGetSelected(pickrId) {
  var keys = [];
  var list = document.getElementById('dm-pickr-list-' + pickrId);
  if (!list) return keys;
  list.querySelectorAll('.dm-pickr-item input:checked').forEach(function(cb) {
    var item = cb.closest('.dm-pickr-item');
    var k = item.getAttribute('data-key');
    if (k) keys.push(k);
  });
  return keys;
}

function _pickrSetSelected(pickrId, keys) {
  var keySet = {};
  (keys || []).forEach(function(k) { keySet[k] = 1; });
  var list = document.getElementById('dm-pickr-list-' + pickrId);
  if (!list) return;
  list.querySelectorAll('.dm-pickr-item').forEach(function(it) {
    var k = it.getAttribute('data-key');
    var cb = it.querySelector('input[type="checkbox"]');
    if (keySet[k]) {
      if (cb) cb.checked = true;
      it.classList.add('selected');
    } else {
      if (cb) cb.checked = false;
      it.classList.remove('selected');
    }
  });
  _pickrSyncSelected(pickrId);
}

// Picker: close on outside click
document.addEventListener('click', function(e) {
  var openPanels = document.querySelectorAll('.dm-pickr-panel[style*="display: block"], .dm-pickr-panel[style*="display:block"]');
  openPanels.forEach(function(panel) {
    var pickr = panel.closest('.dm-pickr');
    if (pickr && !pickr.contains(e.target)) {
      panel.style.display = 'none';
      var pickrId = pickr.getAttribute('data-pickr-id');
      var addBtn = document.getElementById('dm-pickr-add-' + pickrId);
      if (addBtn) addBtn.classList.remove('open');
    }
  });
});

// The full submitDelta + delete + reRender functions follow.
// Extracted verbatim from index.html.
function submitDelta(type) {
  var btn = document.getElementById('delta-save-btn');
  btn.disabled = true; btn.textContent = '保存中...';

  var payload, endpoint;

  if (type === 'kp') {
    // 从结构化表单读取所有字段
    var titleVal = (document.getElementById('dm-title') || {}).value || '';
    var enVal = (document.getElementById('dm-en') || {}).value || '';
    var yearInput = document.getElementById('dm-year');
    var meritVal = (document.getElementById('dm-merit') || {}).value || '';
    var limitVal = (document.getElementById('dm-limit') || {}).value || '';

    // 学派/学者：从 picker 读取
    var schoolKeys = _pickrGetSelected('kp-schools');
    var scholarKeys = _pickrGetSelected('kp-scholars');
    var scholarVal = scholarKeys.join(',');
    var yearVal = yearInput ? yearInput.value.trim() : '';

    // Detect active tab and build body
    var activeTab = document.querySelector('.dm-tab.active');
    var tabType = activeTab ? activeTab.getAttribute('data-tab') : 'narrative';
    var bodyVal = '';

    if (tabType === 'narrative') {
      // 叙述模式：换行不转<br>（保持纯文字路径），多个换行合并为一个空格
      bodyVal = _mdBold((document.getElementById('dm-narrative') || {}).value || '').trim().replace(/\n+/g, ' ');

    } else if (tabType === 'flat') {
      var flatLead = _mdBold((document.getElementById('dm-flat-lead') || {}).value || '').trim().replace(/\n/g, '<br>');
      bodyVal = flatLead;
      document.querySelectorAll('#dm-flat-items .dm-item-pair').forEach(function(pair) {
        var name = (pair.querySelector('.dm-item-name') || {}).value || '';
        var desc = (pair.querySelector('.dm-item-desc') || {}).value || '';
        name = name.trim(); desc = desc.trim();
        if (!name && !desc) return;
        var item = name ? '<strong>' + name + '</strong>' : '';
        if (desc) item += (item ? '——' : '') + _mdBold(desc);
        bodyVal += '◆' + item;
      });

    } else if (tabType === 'accordion') {
      var accLead = _mdBold((document.getElementById('dm-acc-lead') || {}).value || '').trim().replace(/\n/g, '<br>');
      bodyVal = accLead;
      document.querySelectorAll('.dm-acc-group').forEach(function(group) {
        var accTitle = (group.querySelector('.dm-acc-title') || {}).value || '';
        if (!accTitle.trim()) return;
        bodyVal += '<br>【' + accTitle.trim() + '】';
        var pairs = group.querySelectorAll('.dm-item-pair');
        var n = 1;
        pairs.forEach(function(pair) {
          var name = (pair.querySelector('.dm-item-name') || {}).value || '';
          var desc = (pair.querySelector('.dm-item-desc') || {}).value || '';
          name = name.trim(); desc = desc.trim();
          if (!name && !desc) return;
          var circled = String.fromCodePoint(0x2460 + n - 1);
          var item = name ? '<strong>' + name + '</strong>' : '';
          if (desc) item += (item ? '——' : '') + _mdBold(desc);
          bodyVal += '<br>' + circled + item;
          n++;
        });
      });

    } else if (tabType === 'compare') {
      var cmpLead = _mdBold((document.getElementById('dm-cmp-lead') || {}).value || '').trim().replace(/\n+/g, ' ');
      var cols = [];
      document.querySelectorAll('.dm-cmp-col').forEach(function(col) {
        var ct = (col.querySelector('.dm-cmp-title') || {}).value || '';
        var ckw = (col.querySelector('.dm-cmp-keyword') || {}).value || '';
        var cdesc = (col.querySelector('.dm-cmp-desc') || {}).value || '';
        var cbottom = (col.querySelector('.dm-cmp-bottom') || {}).value || '';
        var cdetail = (col.querySelector('.dm-cmp-detail') || {}).value || '';
        if (ct.trim() || ckw.trim()) {
          // format: title|keyword|desc|type|bottom|detail (type = title as fallback)
          cols.push(ct.trim() + '|' + ckw.trim() + '|' + cdesc.trim() + '|' + ct.trim() + '|' + cbottom.trim() + '|' + cdetail.trim());
        }
      });
      bodyVal = cmpLead;
      if (cols.length) bodyVal += '<compare>' + cols.join('||') + '</compare>';

    } else if (tabType === 'quad') {
      bodyVal = _buildQuadBody();
    }

    titleVal = titleVal.trim();
    bodyVal = bodyVal.trim();
    meritVal = meritVal.trim();
    limitVal = limitVal.trim();

    if (!titleVal || !schoolKeys.length || !bodyVal || bodyVal.length < 10) {
      alert('标题、学派（至少选一个）、正文（至少10字）为必填'); btn.disabled = false; btn.textContent = '保存'; return;
    }
    // 意义/局限拼接：不同tab模式用不同分隔符
    var fullBody = bodyVal;
    var sep = '';
    if (tabType === 'accordion') sep = '<br>';  // 手风琴：用<br>跳出折叠组
    // 叙述/平铺/对比卡片：直接拼◆（渲染引擎按◆分割）
    if (meritVal) fullBody += sep + '◆意义——' + meritVal.replace(/\n/g, '<br>');
    if (limitVal) fullBody += sep + '◆局限——' + limitVal.replace(/\n/g, '<br>');

    payload = {
      title: titleVal, en: enVal.trim(), scholar: scholarVal || null,
      year: yearVal,
      schools: schoolKeys,
      body: fullBody
    };
    endpoint = '/delta/kp/add';

  } else if (type === 'kp_edit') {
    // 编辑模式：复用与 kp 相同的字段读取逻辑（picker）
    var titleVal = (document.getElementById('dm-title') || {}).value || '';
    var enVal = (document.getElementById('dm-en') || {}).value || '';
    var yearInput = document.getElementById('dm-year');
    var meritVal = (document.getElementById('dm-merit') || {}).value || '';
    var limitVal = (document.getElementById('dm-limit') || {}).value || '';

    // 学派/学者：从 picker 读取
    var schoolKeys = _pickrGetSelected('kp-schools');
    var scholarKeys = _pickrGetSelected('kp-scholars');
    var scholarVal = scholarKeys.join(',');
    var yearVal = yearInput ? yearInput.value.trim() : '';

    var activeTab = document.querySelector('.dm-tab.active');
    var tabType = activeTab ? activeTab.getAttribute('data-tab') : 'narrative';
    var bodyVal = '';

    if (tabType === 'narrative') {
      bodyVal = _mdBold((document.getElementById('dm-narrative') || {}).value || '').trim().replace(/\n+/g, ' ');
    } else if (tabType === 'flat') {
      var flatLead = _mdBold((document.getElementById('dm-flat-lead') || {}).value || '').trim().replace(/\n/g, '<br>');
      bodyVal = flatLead;
      document.querySelectorAll('#dm-flat-items .dm-item-pair').forEach(function(pair) {
        var name = (pair.querySelector('.dm-item-name') || {}).value || '';
        var desc = (pair.querySelector('.dm-item-desc') || {}).value || '';
        name = name.trim(); desc = desc.trim();
        if (!name && !desc) return;
        var item = name ? '<strong>' + name + '</strong>' : '';
        if (desc) item += (item ? '——' : '') + _mdBold(desc);
        bodyVal += '◆' + item;
      });
    } else if (tabType === 'accordion') {
      var accLead = _mdBold((document.getElementById('dm-acc-lead') || {}).value || '').trim().replace(/\n/g, '<br>');
      bodyVal = accLead;
      document.querySelectorAll('.dm-acc-group').forEach(function(group) {
        var accTitle = (group.querySelector('.dm-acc-title') || {}).value || '';
        if (!accTitle.trim()) return;
        bodyVal += '<br>【' + accTitle.trim() + '】';
        var pairs = group.querySelectorAll('.dm-item-pair');
        var n = 1;
        pairs.forEach(function(pair) {
          var name = (pair.querySelector('.dm-item-name') || {}).value || '';
          var desc = (pair.querySelector('.dm-item-desc') || {}).value || '';
          name = name.trim(); desc = desc.trim();
          if (!name && !desc) return;
          var circled = String.fromCodePoint(0x2460 + n - 1);
          var item = name ? '<strong>' + name + '</strong>' : '';
          if (desc) item += (item ? '——' : '') + _mdBold(desc);
          bodyVal += '<br>' + circled + item;
          n++;
        });
      });
    } else if (tabType === 'compare') {
      var cmpLead = _mdBold((document.getElementById('dm-cmp-lead') || {}).value || '').trim().replace(/\n+/g, ' ');
      var cols = [];
      document.querySelectorAll('.dm-cmp-col').forEach(function(col) {
        var ct = (col.querySelector('.dm-cmp-title') || {}).value || '';
        var ckw = (col.querySelector('.dm-cmp-keyword') || {}).value || '';
        var cdesc = (col.querySelector('.dm-cmp-desc') || {}).value || '';
        var cbottom = (col.querySelector('.dm-cmp-bottom') || {}).value || '';
        var cdetail = (col.querySelector('.dm-cmp-detail') || {}).value || '';
        if (ct.trim() || ckw.trim()) {
          cols.push(ct.trim() + '|' + ckw.trim() + '|' + cdesc.trim() + '|' + ct.trim() + '|' + cbottom.trim() + '|' + cdetail.trim());
        }
      });
      bodyVal = cmpLead;
      if (cols.length) bodyVal += '<compare>' + cols.join('||') + '</compare>';

    } else if (tabType === 'quad') {
      bodyVal = _buildQuadBody();
    }

    titleVal = titleVal.trim();
    bodyVal = bodyVal.trim();
    meritVal = meritVal.trim();
    limitVal = limitVal.trim();

    var editId = window._editingKpId;
    if (!editId) { alert('编辑ID丢失'); btn.disabled = false; btn.textContent = '更新'; return; }
    if (!titleVal || !schoolKeys.length || !bodyVal || bodyVal.length < 10) {
      alert('标题、学派（至少选一个）、正文（至少10字）为必填'); btn.disabled = false; btn.textContent = '更新'; return;
    }
    // P1.1 — 改 title 时扫描其他 KP body 的 compare 引用，避免变成死链
    var editOldKP = KNOWLEDGE_MAP[editId];
    var oldTitle = editOldKP ? editOldKP.title : '';
    if (oldTitle && oldTitle !== titleVal) {
      var compareRefs = _findCompareRefs(oldTitle, editId);
      if (compareRefs.length) {
        var msg = '注意：标题从「' + oldTitle + '」改为「' + titleVal + '」，以下 ' + compareRefs.length + ' 处的对比卡片引用将失效：\n\n'
          + compareRefs.map(function(kn) { return '• 知识点「' + kn.title + '」'; }).join('\n')
          + '\n\n建议之后手动修正这些引用。是否仍要更新标题？';
        if (!confirm(msg)) { btn.disabled = false; btn.textContent = '更新'; return; }
      }
    }

    var fullBody = bodyVal;
    var sep = '';
    if (tabType === 'accordion') sep = '<br>';
    if (meritVal) fullBody += sep + '◆意义——' + meritVal.replace(/\n/g, '<br>');
    if (limitVal) fullBody += sep + '◆局限——' + limitVal.replace(/\n/g, '<br>');

    // P2.2 — 关联大幅减少时提示
    if (editOldKP) {
      var oldSchools = editOldKP.schools || [];
      var removedSchools = oldSchools.filter(function(k) { return schoolKeys.indexOf(k) < 0; });
      var oldScholars = (editOldKP.scholar || '').split(/[,，]/).map(function(s){return s.trim();}).filter(Boolean);
      var removedScholars = oldScholars.filter(function(k) { return scholarKeys.indexOf(k) < 0; });
      if (removedSchools.length || removedScholars.length) {
        var lines = [];
        removedSchools.forEach(function(k) {
          var t = (DATA[k] || {}).title || k;
          lines.push('• 从学派「' + t + '」移除');
        });
        removedScholars.forEach(function(k) {
          var n = (SCHOLARS[k] || {}).name || k;
          lines.push('• 取消关联学者「' + n + '」');
        });
        var warnMsg = '本次修改将使此知识点：\n\n' + lines.join('\n') + '\n\n确认保存？';
        if (!confirm(warnMsg)) { btn.disabled = false; btn.textContent = '更新'; return; }
      }
    }
    payload = {
      id: editId,
      title: titleVal, en: enVal.trim(), scholar: scholarVal || null,
      year: yearVal,
      schools: schoolKeys,
      body: fullBody
    };
    endpoint = '/delta/kp/update';

  } else if (type === 'scholar') {
    // 学者：从结构化字段读取（key 由前端自动生成）
    var nameVal = (document.getElementById('dm-sch-name') || {}).value || '';
    var enVal = (document.getElementById('dm-sch-en') || {}).value || '';
    var nationVal = (document.getElementById('dm-sch-nation') || {}).value || '';
    var affVal = (document.getElementById('dm-sch-aff') || {}).value || '';
    var fieldVal = (document.getElementById('dm-sch-field') || {}).value || '';
    var contribVal = (document.getElementById('dm-sch-contribution') || {}).value || '';

    nameVal = nameVal.trim();
    contribVal = contribVal.trim();

    if (!nameVal) {
      alert('中文名为必填'); btn.disabled = false; btn.textContent = '保存'; return;
    }
    if (!contribVal) {
      alert('学术贡献为必填'); btn.disabled = false; btn.textContent = '保存'; return;
    }
    // 编辑模式 vs 新增模式
    var keyVal;
    if (window._editingScholarKey) {
      // 编辑：用原 key（不重新生成，避免 key 漂移）
      keyVal = window._editingScholarKey;
    } else {
      // 新增：基于英文名姓氏自动生成；无 en 时用中文名 hash
      keyVal = _generateScholarKey(nameVal, enVal);
    }
    // 学派多选：从 picker 读取
    var schoolsArr = _pickrGetSelected('sch-schools');
    payload = {
      key: keyVal,
      name: nameVal,
      en: enVal.trim(),
      nationality: nationVal.trim(),
      flag: _nationalityToFlag(nationVal.trim()),
      affiliation: affVal.trim(),
      field: fieldVal.trim(),
      schools: schoolsArr,
      contribution: contribVal
    };
    endpoint = '/delta/scholar/add';  // worker 端 add 直接覆盖（upsert）

  } else if (type === 'school') {
    // 学派：从结构化字段读取（key 编辑时复用，新增时自动生成）
    var titleVal = (document.getElementById('dm-sk-title') || {}).value || '';
    var enVal = (document.getElementById('dm-sk-en') || {}).value || '';
    var jaVal = (document.getElementById('dm-sk-ja') || {}).value || '';
    var groupSelect = document.getElementById('dm-sk-group');
    var l1Wrap = document.getElementById('dm-sk-l1');
    var summaryVal = (document.getElementById('dm-sk-summary') || {}).value || '';
    var influenceVal = (document.getElementById('dm-sk-influence') || {}).value || '';
    var contextVal = (document.getElementById('dm-sk-context') || {}).value || '';

    titleVal = titleVal.trim();
    summaryVal = summaryVal.trim();

    if (!titleVal) {
      alert('中文名为必填'); btn.disabled = false; btn.textContent = '保存'; return;
    }
    if (!summaryVal) {
      alert('学派概述为必填'); btn.disabled = false; btn.textContent = '保存'; return;
    }
    var groupVal = groupSelect ? parseInt(groupSelect.value) || 3 : 3;
    // accent 从 L1 大类自动推导（不再让用户填"主色"）
    var l1Val = l1Wrap ? (l1Wrap.getAttribute('data-value') || 'OT') : 'OT';
    var L1_COLORS_SUBMIT = { SM: '#007AFF', OB: '#34C759', OT: '#FF9500' };
    var accentVal = L1_COLORS_SUBMIT[l1Val] || '#FF9500';
    // 编辑模式 vs 新增模式
    var keyVal;
    if (window._editingSchoolKey) {
      keyVal = window._editingSchoolKey;  // 编辑：复用原 key
    } else {
      keyVal = _generateSchoolKey(titleVal, enVal);  // 新增：自动生成
    }
    payload = {
      key: keyVal,
      title: titleVal,
      en: enVal.trim(),
      ja: jaVal.trim(),
      group: groupVal,
      accent: accentVal.trim() || '#007AFF',
      summary: summaryVal,
      influence: influenceVal.trim(),
      context: contextVal.trim()
    };
    endpoint = '/delta/school/add';  // worker 端 add 直接覆盖（upsert）
  }

  var btnLabel = (type === 'kp_edit') ? '更新' : '保存';
  _deltaFetch(endpoint, payload).then(function(res) {
    if (res.error) { alert('保存失败: ' + res.error); btn.disabled = false; btn.textContent = btnLabel; return; }
    // Update in-memory data
    if (type === 'kp' && res.entry) {
      KNOWLEDGE.push(res.entry);
      KNOWLEDGE_MAP[res.entry.id] = res.entry;
      // 新建 KP 后异步触发 AI 翻译（不阻塞主流程）
      _autoTranslateKp(res.entry);
    } else if (type === 'kp_edit' && res.entry) {
      var existing = KNOWLEDGE_MAP[res.entry.id];
      var oldTitle = existing ? existing.title : '';
      var oldBody = existing ? existing.body : '';
      if (existing) {
        Object.keys(res.entry).forEach(function(k) { existing[k] = res.entry[k]; });
      } else {
        KNOWLEDGE.push(res.entry);
        KNOWLEDGE_MAP[res.entry.id] = res.entry;
      }
      // 编辑后若 title 或 body 实质变化，重新翻译
      if (oldTitle !== res.entry.title || oldBody !== res.entry.body) {
        _autoTranslateKp(res.entry);
      }
      window._editingKpId = null;
    } else if (type === 'scholar') {
      SCHOLARS[payload.key] = payload;
      // 编辑模式：原地刷新当前学者详情页（如果在）
      if (window._editingScholarKey) {
        window._editingScholarKey = null;
        var dv = document.getElementById('view-detail');
        if (dv && dv.classList.contains('active') && window._curScholarKey === payload.key) {
          // 重新渲染该学者详情（skipPushNav=true 不污染 nav 栈）
          showScholar(payload.key, true);
        }
      }
    } else if (type === 'school') {
      DATA[payload.key] = payload;
      // 编辑模式：原地刷新当前学派详情页 + 首页学派卡片
      if (window._editingSchoolKey) {
        window._editingSchoolKey = null;
        if (typeof renderHomeGrid === 'function') renderHomeGrid();
        var dv = document.getElementById('view-detail');
        if (dv && dv.classList.contains('active') && window._curSchoolKey === payload.key) {
          show(payload.key, undefined, true);  // skipPushNav 不污染 nav 栈
        }
      }
    }
    closeDeltaModal();
    _reRenderAfterDelta();
  }).catch(function(err) {
    alert('网络错误: ' + err.message); btn.disabled = false; btn.textContent = btnLabel;
  });
}

// 共用：扫描 SCHOOL_QUIZ 题库里是否含某个关键词（KP 标题或学者姓名）
// 因为题库是自由文本，只能做"软引用"警告，不能精确判断
function _scanQuizReferences(keyword) {
  var refs = [];
  if (!keyword || typeof SCHOOL_QUIZ === 'undefined') return refs;
  // keyword 至少 2 字符，避免单字误命中
  if (String(keyword).trim().length < 2) return refs;
  var kw = keyword;
  Object.keys(SCHOOL_QUIZ).forEach(function(schoolKey) {
    var bank = SCHOOL_QUIZ[schoolKey];
    if (!Array.isArray(bank)) return;
    bank.forEach(function(q) {
      if (!q) return;
      var hit = false;
      // 题干
      if (q.question && q.question.indexOf(kw) >= 0) hit = true;
      // 选项
      if (!hit && Array.isArray(q.options)) {
        q.options.forEach(function(o) { if (o && String(o).indexOf(kw) >= 0) hit = true; });
      }
      // 解析
      if (!hit && q.explanations) {
        Object.values(q.explanations).forEach(function(v) {
          if (v && String(v).indexOf(kw) >= 0) hit = true;
        });
      }
      if (hit) {
        var schoolName = (DATA[schoolKey] || {}).title || schoolKey;
        refs.push(schoolName + ' · 第 ' + q.id + ' 题');
      }
    });
  });
  return refs;
}

// 共用：扫描 compare 卡片里对某个 KP title 的引用（精确匹配列开头）
// 返回引用该 title 的其他 KP 列表（不含 excludeId 自己）
function _findCompareRefs(title, excludeId) {
  var refs = [];
  if (!title) return refs;
  var escTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var compareRe = new RegExp('<compare>(?:[^<]|<(?!\\/?compare))*?(?:^|\\|\\|)' + escTitle + '\\|', 'i');
  KNOWLEDGE.forEach(function(kn) {
    if (kn.id === excludeId || !kn.body) return;
    if (compareRe.test(kn.body)) {
      refs.push(kn);
    }
  });
  return refs;
}

function deltaDeleteKP(id, title) {
  // 校验：精确检测 compare 卡片链接 — body 中是否有 "<compare>...|||...</compare>"
  // 块的某一列以 title 开头且后跟 |（compare 列分隔符）
  var refs = _findCompareRefs(title, id).map(function(kn) {
    return '知识点「' + kn.title + '」的对比卡片';
  });
  // P1.3 — 扫描 SCHOOL_QUIZ 题库的软引用
  var quizRefs = _scanQuizReferences(title);
  if (quizRefs.length) {
    quizRefs.forEach(function(r) { refs.push('题库：' + r); });
  }
  if (refs.length) {
    if (!confirm('注意：「' + title + '」被以下 ' + refs.length + ' 处引用：\n\n' + refs.join('\n') + '\n\n删除后这些位置可能出现失效链接。是否仍要继续？')) return;
  } else {
    if (!confirm('确定删除「' + title + '」？\n\n该知识点将从所有学派、学者中消失。\n此操作不可撤销。')) return;
  }
  _deltaFetch('/delta/kp/delete', { id: id }).then(function(res) {
    if (res.error) { alert('删除失败: ' + res.error); return; }
    // 1. 从内存数据移除
    KNOWLEDGE = KNOWLEDGE.filter(function(k) { return k.id !== id; });
    delete KNOWLEDGE_MAP[id];
    // 2. 折叠当前列表中的 KP DOM
    _collapseSwipeWrap(id);
    // 3. 刷新 tab 计数
    updateTabCounts();
    // 4. 智能刷新当前所在页面，确保所有视图反映删除
    setTimeout(function() {
      var dv = document.getElementById('view-detail');
      if (dv && dv.classList.contains('active')) {
        // 当前在某个详情页（学派/学者）→ 原地重渲染（skipPushNav=true 不动 nav 栈）
        if (window._curSchoolKey && DATA[window._curSchoolKey]) {
          show(window._curSchoolKey, undefined, true);
        } else if (window._curScholarKey && SCHOLARS[window._curScholarKey]) {
          showScholar(window._curScholarKey, true);
        }
      } else {
        // 其他页面：通用刷新（home/学者列表/搜索 tab）
        if (typeof renderHomeGrid === 'function') renderHomeGrid();
        _reRenderAfterDelta();
      }
    }, 200); // 等折叠动画完成
  }).catch(function(err) { alert('网络错误: ' + err.message); });
}

// (已废弃 _removeKpFromSchool — 学派改为统一 pill 多选，点击 pill 即可切换归属)

function deltaDeleteSchool(key, name) {
  // 校验：必须没有 KP 关联此学派，且没有"可点击"的学者
  var kpRefs = KNOWLEDGE.filter(function(kn) { return (kn.schools || []).indexOf(key) >= 0; });
  if (kpRefs.length) {
    alert('无法删除：还有 ' + kpRefs.length + ' 个知识点归属此学派。请先删除所有知识点。');
    return;
  }
  var d = DATA[key];
  var whoListLocal = (d && d.who || []).slice();
  var clickableWho = whoListLocal.filter(function(p) { return !!findScholarKey(p); });
  if (clickableWho.length) {
    alert('无法删除：还有 ' + clickableWho.length + ' 位关联学者。请先删除或转移这些学者。');
    return;
  }
  if (!confirm('确定删除学派「' + name + '」？\n\n该学派将从首页和所有相关引用中消失。\n此操作不可撤销。')) return;
  _deltaFetch('/delta/school/delete', { key: key }).then(function(res) {
    if (res.error) { alert('删除失败: ' + res.error); return; }
    delete DATA[key];
    window._curSchoolKey = null;
    // 刷新首页学派卡片 + tab 计数
    if (typeof renderHomeGrid === 'function') renderHomeGrid();
    if (typeof updateTabCounts === 'function') updateTabCounts();
    // 跳回首页（清空 nav 栈）
    _navStack = [];
    document.getElementById('view-detail').classList.remove('active');
    var vl = document.getElementById('view-list');
    if (vl) vl.classList.add('active');
    // 切到学派 tab（如果不在）
    var b = document.querySelector('.tab-btn[onclick*="theme"]');
    if (b) b.click();
  }).catch(function(err) { alert('网络错误: ' + err.message); });
}

function deltaDeleteScholar(key, name) {
  // 校验：必须没有任何KP引用该学者
  var refs = KNOWLEDGE.filter(function(kn) { return _knScholars(kn).indexOf(key) >= 0; });
  if (refs.length) {
    alert('无法删除：还有 ' + refs.length + ' 个知识点关联此学者。请先删除所有知识点。');
    return;
  }
  // P1.3 — 扫描题库文本里是否提到该学者（中文名 + 英文名）
  var scholar = SCHOLARS[key] || {};
  var quizRefs = [];
  [scholar.name, scholar.en].forEach(function(kw) {
    if (kw) _scanQuizReferences(kw).forEach(function(r) {
      if (quizRefs.indexOf(r) < 0) quizRefs.push(r);
    });
  });
  var confirmMsg = '确定删除学者「' + name + '」？\n\n该学者将从所有学派的代表人物中消失。\n此操作不可撤销。';
  if (quizRefs.length) {
    confirmMsg = '注意：题库中以下 ' + quizRefs.length + ' 处可能提及此学者：\n\n'
      + quizRefs.map(function(r) { return '• ' + r; }).join('\n')
      + '\n\n删除后题目文本仍保留人名，但跳转链接会失效。是否仍要删除「' + name + '」？';
  }
  if (!confirm(confirmMsg)) return;
  _deltaFetch('/delta/scholar/delete', { key: key }).then(function(res) {
    if (res.error) { alert('删除失败: ' + res.error); return; }
    delete SCHOLARS[key];
    window._curScholarKey = null;
    // 全面刷新：首页学派卡片 + tab 计数 + 学者卡片列表
    if (typeof renderHomeGrid === 'function') renderHomeGrid();
    if (typeof updateTabCounts === 'function') updateTabCounts();
    if (typeof renderScholarCards === 'function') renderScholarCards();
    if (typeof _applyScholarFilter === 'function') _applyScholarFilter();
    // 跳回学者列表（清空 nav 栈，避免 goBack 还原缓存的旧 HTML）
    _navStack = [];
    document.getElementById('view-detail').classList.remove('active');
    var vl = document.getElementById('view-list');
    if (vl) vl.classList.add('active');
    var b = document.querySelector('.tab-btn[onclick*="scholar"]');
    if (b) b.click();
  }).catch(function(err) { alert('网络错误: ' + err.message); });
}

function _reRenderAfterDelta() {
  var activePanel = document.querySelector('.panel.active');
  if (!activePanel) return;
  var activeId = activePanel.id;
  if (activeId === 'panel-theme') {
    renderHomeGrid();
    updateTabCounts();
  } else if (activeId === 'panel-scholar') {
    // 重新渲染学者卡片列表（删除/编辑学者后必须刷新）
    if (typeof renderScholarCards === 'function') renderScholarCards();
    // 同步重新应用筛选/搜索状态
    if (typeof _applyScholarFilter === 'function') _applyScholarFilter();
  } else if (activeId === 'panel-knowledge') {
    var inp = document.getElementById('concept-search-input');
    if (inp && inp.value) inp.dispatchEvent(new Event('input', {bubbles: true}));
  }
  updateTabCounts();
}

