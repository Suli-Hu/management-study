// ===== quiz.js — Quiz system =====

function goQuiz(concept, school, accent) {
  _quizConcept = concept;
  _quizSchool = school;
  _quizAccent = accent || '#7a5c45';
  _quizConcepts = null;
  _quizDetails = null;
  var quizBtn = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < quizBtn.length; i++) {
    if (quizBtn[i].textContent.indexOf('练习') >= 0) {
      switchTab('quiz', quizBtn[i]);
      break;
    }
  }
  _loadQuizQuestion();
}

function goSchoolQuiz(schoolKey, accent) {
  var d = DATA[schoolKey];
  if (!d) return;
  var titles = [];
  var details = [];
  KNOWLEDGE.forEach(function(kn) {
    if ((kn.schools || []).indexOf(schoolKey) < 0) return;
    titles.push(kn.title);
    var text = (_knFullTitle(kn) + '——' + kn.body).replace(/<[^>]+>/g, '').replace(/◆/g, '\n◆');
    details.push(text);
  });
  if (!titles.length) return;
  _quizConcept = d.title;
  _quizSchool = d.badge || '';
  _quizAccent = accent || '#7a5c45';
  _quizConcepts = titles;
  _quizDetails = details;
  var quizBtn = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < quizBtn.length; i++) {
    if (quizBtn[i].textContent.indexOf('练习') >= 0) {
      switchTab('quiz', quizBtn[i]);
      break;
    }
  }
  _loadQuizQuestion();
}

// =====================================================
//  SCHOOL BANK QUIZ
// =====================================================

function _sbLoadAll() {
  try { return JSON.parse(localStorage.getItem(_sbStorageKey) || '{}'); } catch(e) { return {}; }
}
function _sbLoad(key) {
  var p = _sbLoadAll()[key] || { done: {}, completions: 0 };
  if (!p.feedback) p.feedback = {};
  return p;
}
function _sbSave(key, data) {
  var all = _sbLoadAll();
  all[key] = data;
  localStorage.setItem(_sbStorageKey, JSON.stringify(all));
}

function _schoolBankProgress(key) {
  if (typeof SCHOOL_QUIZ === 'undefined' || !SCHOOL_QUIZ[key]) return '';
  var prog = _sbLoad(key);
  var badCount = 0;
  SCHOOL_QUIZ[key].forEach(function(q) { if (prog.feedback[q.id] && prog.feedback[q.id].rating === 'bad') badCount++; });
  var total = SCHOOL_QUIZ[key].length - badCount;
  if (total <= 0) total = 1;
  var done = Object.keys(prog.done).length;
  var pct = Math.round(done / total * 100);
  if (done === 0 && prog.completions === 0) return '';
  return '<div style="display:flex;align-items:center;gap:8px;margin-top:10px">'
    + '<div style="flex:1;height:3px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden"><div style="height:100%;background:rgba(255,255,255,0.6);border-radius:2px;width:' + pct + '%"></div></div>'
    + '<span style="font-size:10px;color:rgba(255,255,255,0.6)">' + done + '/' + total
    + (prog.completions > 0 ? ' · 通关' + prog.completions : '') + '</span>'
    + '</div>';
}

function _schoolCardProgress(key) {
  if (typeof SCHOOL_QUIZ === 'undefined' || !SCHOOL_QUIZ[key]) return '';
  var prog = _sbLoad(key);
  var badCount = 0;
  SCHOOL_QUIZ[key].forEach(function(q) { if (prog.feedback[q.id] && prog.feedback[q.id].rating === 'bad') badCount++; });
  var total = SCHOOL_QUIZ[key].length - badCount;
  if (total <= 0) total = 1;
  var done = Object.keys(prog.done).length;
  if (done === 0 && prog.completions === 0) return '';
  var pct = Math.round(done / total * 100);
  return '<div class="card-bank-prog" style="position:absolute;bottom:0;left:0;right:0;height:2px;background:rgba(0,0,0,0.04);border-radius:0 0 14px 14px;overflow:hidden">'
    + '<div style="height:100%;width:' + pct + '%;background:var(--accent);opacity:0.35;border-radius:0 0 0 14px"></div>'
    + '</div>';
}

function _shufArr(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
}

function startSchoolBank(key, accent) {
  var bank = (typeof SCHOOL_QUIZ !== 'undefined') ? SCHOOL_QUIZ[key] : null;
  if (!bank || !bank.length) return;
  var prog = _sbLoad(key);

  var undone = [], done = [], skipped = 0;
  bank.forEach(function(q, i) {
    var fb = prog.feedback[q.id];
    if (fb && fb.rating === 'bad') { skipped++; return; }
    if (prog.done[q.id]) done.push(i); else undone.push(i);
  });
  var total = bank.length - skipped;
  if (total <= 0) { alert('所有题目都已被标记为问题题，请重置反馈后再试'); return; }
  _shufArr(undone); _shufArr(done);
  var queue = undone.concat(done);
  if (undone.length === 0 && done.length === total) {
    prog.completions++;
    prog.done = {};
    _sbSave(key, prog);
    if (!_masteredKeys[key]) {
      _masteredKeys[key] = 1;
      localStorage.setItem('mastered', JSON.stringify(_masteredKeys));
      var card = document.querySelector('.card[onclick*="' + key + '"]');
      if (card) { card.classList.add('mastered'); var star = card.querySelector('.card-star'); if (star) star.textContent = '\u2605'; }
    }
    queue = done.slice();
    _shufArr(queue);
  }

  _sbActive = true;
  var quizBtn = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < quizBtn.length; i++) {
    if (quizBtn[i].textContent.indexOf('练习') >= 0) { switchTab('quiz', quizBtn[i]); break; }
  }
  _sbActive = false;

  _sbRenderQuestion(key, accent, bank, queue, 0, prog);
}

function _sbRenderQuestion(key, accent, bank, queue, pos, prog) {
  var el = document.getElementById('quiz-mount');
  if (!el) return;
  var qIdx = queue[pos];
  var q = bank[qIdx];
  var badCount = 0;
  bank.forEach(function(qq) { if (prog.feedback[qq.id] && prog.feedback[qq.id].rating === 'bad') badCount++; });
  var total = bank.length - badCount;
  var doneCount = Object.keys(prog.done).length;
  var d = DATA[key];
  var title = d ? d.title : key;

  var optMap = ['A','B','C','D'].slice();
  _shufArr(optMap);
  var displayLabels = ['A','B','C','D'];

  el.innerHTML =
    '<div class="qz-wrap">'
    + '<div class="qz-top">'
    +   '<span class="qz-ctr">' + title + ' · 已做 <b>' + doneCount + '</b> / 共 <b>' + total + '</b>'
    +   (prog.completions > 0 ? '<span class="qz-rnlabel">通关 ' + prog.completions + ' 次</span>' : '') + '</span>'
    +   '<div class="qz-prog-wrap"><div class="qz-prog-fill" id="qz-pf" style="width:' + (doneCount/total*100) + '%;background:' + accent + '"></div></div>'
    + '</div>'
    + '<div class="qz-qcard">'
    +   '<div class="qz-meta"><span class="qz-num">Q' + (doneCount + 1) + '</span></div>'
    +   '<p class="qz-qtx" id="qz-qtx"></p>'
    + '</div>'
    + '<div class="qz-opts" id="qz-opts"></div>'
    + '<div id="qz-ra"></div>'
    + '</div>';

  document.getElementById('qz-qtx').textContent = q.question;
  var optsEl = document.getElementById('qz-opts');
  displayLabels.forEach(function(dk, i) {
    var origKey = optMap[i];
    var div = document.createElement('div');
    div.className = 'qz-opt';
    div.id = 'qz-o' + dk;
    div.innerHTML = '<span class="qz-okey">' + dk + '</span><span class="qz-otx"></span>';
    div.querySelector('.qz-otx').textContent = q.options[displayLabels.indexOf(origKey)].replace(/^[A-D]\.\s*/, '');
    div.addEventListener('click', function() {
      _sbPickAnswer(key, accent, bank, queue, pos, prog, dk, optMap, displayLabels);
    });
    optsEl.appendChild(div);
  });
  el.scrollTop = 0;
}

function _sbPickAnswer(key, accent, bank, queue, pos, prog, displayKey, optMap, displayLabels) {
  var qIdx = queue[pos];
  var q = bank[qIdx];
  var pickedOrigKey = optMap[displayLabels.indexOf(displayKey)];
  var correctDisplayKey = displayLabels[optMap.indexOf(q.answer)];
  var good = pickedOrigKey === q.answer;

  _fbCtx = { type: 'school', key: key, qid: q.id };

  prog.done[q.id] = true;
  _sbSave(key, prog);

  var doneCount = Object.keys(prog.done).length;
  var badCount = 0;
  bank.forEach(function(qq) { if (prog.feedback[qq.id] && prog.feedback[qq.id].rating === 'bad') badCount++; });
  var total = bank.length - badCount;
  var isComplete = doneCount >= total;

  displayLabels.forEach(function(dk) {
    var el = document.getElementById('qz-o' + dk);
    el.classList.add('lk');
    el.replaceWith(el.cloneNode(true));
    el = document.getElementById('qz-o' + dk);
    if (dk === correctDisplayKey) el.classList.add('cor');
    else if (dk === displayKey) el.classList.add('wrg');
    else el.classList.add('dim');
  });

  document.getElementById('qz-pf').style.width = (doneCount/total*100) + '%';
  var ctrEl = document.querySelector('.qz-ctr');
  if (ctrEl) {
    var d = DATA[key];
    ctrEl.innerHTML = (d?d.title:key) + ' · 已做 <b>' + doneCount + '</b> / 共 <b>' + total + '</b>'
      + (prog.completions > 0 ? '<span class="qz-rnlabel">通关 ' + prog.completions + ' 次</span>' : '');
  }

  var rows = displayLabels.map(function(dk, i) {
    var origK = optMap[i];
    var isAns = origK === q.answer;
    return '<tr><td><strong>' + dk + '</strong></td>'
      + '<td><span class="qz-tg ' + (isAns?'y':'n') + '">' + (isAns?'正解':'誤り') + '</span></td>'
      + '<td>' + (q.explanations[origK] || '') + '</td></tr>';
  }).join('');

  var nextLabel = isComplete ? '通关！查看结果 →' : '次の問題 →';
  var raEl = document.getElementById('qz-ra');
  raEl.innerHTML =
    '<div class="qz-rp ' + (good?'g':'r') + '">'
    + '<div class="qz-rv">' + (good ? '正解 ✓' : '不正解 — 正解は ' + correctDisplayKey + ' です') + '</div>'
    + '<div class="qz-re">' + (q.explanations[pickedOrigKey] || '') + '</div>'
    + '<div class="qz-atitle">全選択肢の解析</div>'
    + '<table class="qz-atb"><thead><tr>'
    + '<th style="width:48px">選択肢</th><th style="width:60px">判定</th><th>解説</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + _renderFbHTML('sb')
    + '<button class="qz-btn" id="qz-nextbtn">' + nextLabel + '</button>'
    + '</div>';

  document.getElementById('qz-nextbtn').addEventListener('click', function() {
    if (isComplete) {
      prog.completions++;
      prog.done = {};
      _sbSave(key, prog);
      if (!_masteredKeys[key]) {
        _masteredKeys[key] = 1;
        localStorage.setItem('mastered', JSON.stringify(_masteredKeys));
        var card = document.querySelector('.card[onclick*="' + key + '"]');
        if (card) { card.classList.add('mastered'); var star = card.querySelector('.card-star'); if (star) star.textContent = '\u2605'; }
      }
      _sbShowComplete(key, accent, bank, prog);
    } else {
      var nextPos = pos + 1;
      if (nextPos >= queue.length) {
        var remaining = [];
        prog = _sbLoad(key);
        bank.forEach(function(qq, i) {
          var fb = prog.feedback[qq.id];
          if (fb && fb.rating === 'bad') return;
          if (!prog.done[qq.id]) remaining.push(i);
        });
        _shufArr(remaining);
        queue = remaining;
        nextPos = 0;
      }
      _sbRenderQuestion(key, accent, bank, queue, nextPos, prog);
    }
  });
  var _ra = raEl;
  setTimeout(function() { if (_ra && _ra.parentNode) _ra.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 80);
}

function _sbShowComplete(key, accent, bank, prog) {
  var el = document.getElementById('quiz-mount');
  var d = DATA[key];
  el.innerHTML =
    '<div class="qz-wrap"><div class="qz-fc">'
    + '<div style="font-size:40px;margin-bottom:8px">&#127881;</div>'
    + '<div class="qz-ftitle">通关！</div>'
    + '<div class="qz-fsub">' + (d?d.title:key) + ' 全部 ' + bank.length + ' 道题已完成</div>'
    + '<div style="margin:16px 0;padding:14px 20px;background:#f5f3ef;border-radius:12px">'
    +   '<div style="font-size:24px;font-weight:700;color:' + accent + '">' + prog.completions + ' <span style="font-size:14px;font-weight:400">次通关</span></div>'
    +   '<div style="font-size:12px;color:#9a9288;margin-top:4px">已自动标记为「已会」</div>'
    + '</div>'
    + '<div style="display:flex;gap:10px;margin-top:1rem">'
    +   '<button class="qz-btn qz-btn-ghost" onclick="show(\'' + key + '\')">← 返回学派</button>'
    +   '<button class="qz-btn" id="sb-retry">再来一轮</button>'
    + '</div>'
    + '</div></div>';
  document.getElementById('sb-retry').addEventListener('click', function() {
    startSchoolBank(key, accent);
  });
  el.scrollTop = 0;
}

// =====================================================
//  统一反馈系统
// =====================================================

function _renderFbHTML(uid) {
  return '<div class="qz-fb-wrap" id="qz-fb-' + uid + '">'
    + '<div class="qz-fb-title">这道题的质量如何？</div>'
    + '<div class="qz-fb-btns">'
    +   '<button class="qz-fb-b" onclick="_fbRate(this,\'good\',\'' + uid + '\')">好题</button>'
    +   '<button class="qz-fb-b" onclick="_fbRate(this,\'bad\',\'' + uid + '\')">有问题</button>'
    + '</div>'
    + '<div class="qz-fb-reasons" id="qz-fbr-' + uid + '">'
    +   '<button class="qz-fb-r" onclick="_fbReason(this,\'' + uid + '\')">答案有误</button>'
    +   '<button class="qz-fb-r" onclick="_fbReason(this,\'' + uid + '\')">选项区分度不够</button>'
    +   '<button class="qz-fb-r" onclick="_fbReason(this,\'' + uid + '\')">太简单</button>'
    +   '<button class="qz-fb-r" onclick="_fbReason(this,\'' + uid + '\')">太难</button>'
    + '</div>'
    + '<div class="qz-fb-done" id="qz-fbd-' + uid + '">✓ 已记录，感谢反馈</div>'
    + '</div>';
}

function _fbRate(btn, rating, uid) {
  var btns = btn.parentElement.querySelectorAll('.qz-fb-b');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('sel-good', 'sel-bad');
  btn.classList.add(rating === 'good' ? 'sel-good' : 'sel-bad');
  var reasonsEl = document.getElementById('qz-fbr-' + uid);
  if (rating === 'bad') {
    reasonsEl.classList.add('show');
  } else {
    reasonsEl.classList.remove('show');
    document.getElementById('qz-fbd-' + uid).classList.add('show');
  }
  _fbPersist(rating, []);
}

function _fbReason(btn, uid) {
  btn.classList.toggle('sel');
  document.getElementById('qz-fbd-' + uid).classList.add('show');
  var reasons = [];
  var rBtns = document.getElementById('qz-fbr-' + uid).querySelectorAll('.qz-fb-r.sel');
  for (var i = 0; i < rBtns.length; i++) reasons.push(rBtns[i].textContent);
  _fbPersist('bad', reasons);
}

function _fbPersist(rating, reasons) {
  if (!_fbCtx) return;
  var ctx = _fbCtx;
  if (ctx.type === 'school') {
    var prog = _sbLoad(ctx.key);
    prog.feedback[ctx.qid] = { rating: rating, reasons: reasons };
    _sbSave(ctx.key, prog);
  } else if (ctx.type === 'bank') {
    QZ.saveRecord(ctx.qid, null, ctx.question, { rating: rating, reason: reasons.join(', ') });
  } else if (ctx.type === 'ai') {
    if (QUIZ_WORKER_URL) {
      fetch(QUIZ_WORKER_URL + '/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + QUIZ_AUTH_TOKEN },
        body: JSON.stringify({ concept: ctx.concept || '', rating: rating, reasons: reasons, question: ctx.question || '' })
      }).catch(function() {});
    }
  }
}

// =====================================================
//  AI Quiz
// =====================================================

function _loadQuizQuestion() {
  _quizData = null;
  _quizAnswered = false;

  var mount = document.getElementById('quiz-mount');
  var _unis = [
    {logo:'logos/todai.svg',jp:'東京大学',en:'The University of Tokyo'},
    {logo:'logos/kyodai.svg',jp:'京都大学',en:'Kyoto University'},
    {logo:'logos/handai.svg',jp:'大阪大学',en:'Osaka University'},
    {logo:'logos/hitotsubashi.svg',jp:'一橋大学',en:'Hitotsubashi University'},
    {logo:'logos/waseda.svg',jp:'早稲田大学',en:'Waseda University'},
    {logo:'logos/kobe.svg',jp:'神戸大学',en:'Kobe University'},
    {logo:'logos/keio.svg',jp:'慶應義塾大学',en:'Keio University'}
  ];
  var slides = '';
  for (var i = 0; i < _unis.length; i++) {
    var u = _unis[i];
    slides += '<div class="uni-slide' + (i===0?' active':'') + '" data-uni="'+i+'">'
      + '<img class="uni-logo" src="'+u.logo+'" alt="'+u.jp+'">'
      + '<div class="uni-name-jp">'+u.jp+'</div>'
      + '<div class="uni-name-en">'+u.en+'</div>'
      + '</div>';
  }
  mount.innerHTML = '<div class="qz2-wrap"><div class="qz2-loading">'
    + '<div class="qz-spinner"></div>'
    + '<div style="font-size:13px;color:#9a9288">正在为「' + (_quizConcepts ? _quizConcept + '（综合）' : _quizConcept.split('（')[0]) + '」出题...</div>'
    + '<div class="uni-carousel">' + slides + '</div>'
    + '<div style="font-size:11px;color:#bbb">AI 正在根据教材和偏好生成题目</div>'
    + '</div></div>';
  var _uniIdx = 0;
  _quizUniTimer = setInterval(function() {
    var all = mount.querySelectorAll('.uni-slide');
    if (!all.length) { clearInterval(_quizUniTimer); return; }
    all[_uniIdx].classList.remove('active');
    _uniIdx = (_uniIdx + 1) % _unis.length;
    all[_uniIdx].classList.add('active');
  }, 2000);

  var related = _findRelatedConcepts(_quizConcept, 5);

  fetch(QUIZ_WORKER_URL + '/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + QUIZ_AUTH_TOKEN
    },
    body: JSON.stringify(_quizConcepts
      ? { concept: _quizConcept, category: _quizSchool, concepts: _quizConcepts, details: _quizDetails || [] }
      : { concept: _quizConcept, category: _quizSchool, relatedConcepts: related }
    )
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    _quizData = data;
    _renderQuiz(data);
  })
  .catch(function(err) {
    if (_quizUniTimer) { clearInterval(_quizUniTimer); _quizUniTimer = null; }
    var mount = document.getElementById('quiz-mount');
    mount.innerHTML = '<div class="qz2-wrap"><div class="qz2-error">'
      + '<div style="font-size:28px;margin-bottom:12px">⚠️</div>'
      + '<div class="qz2-error-msg">' + (err.message || '出题失败') + '</div>'
      + '<button class="qz2-retry-btn" onclick="_loadQuizQuestion()">重试</button>'
      + '</div></div>';
  });
}

function _findRelatedConcepts(concept, count) {
  var list = _buildConceptsIndex();
  var result = [];
  var conceptBase = concept.split('（')[0].trim();
  for (var i = 0; i < list.length && result.length < count; i++) {
    var t = list[i].title.split('（')[0].trim();
    if (t !== conceptBase) result.push(list[i].title);
  }
  for (var j = result.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = result[j]; result[j] = result[k]; result[k] = tmp;
  }
  return result.slice(0, count);
}

function _renderQuiz(data) {
  if (_quizUniTimer) { clearInterval(_quizUniTimer); _quizUniTimer = null; }
  var mount = document.getElementById('quiz-mount');
  var html = '<div class="qz2-wrap">';

  html += '<div class="qz2-concept-tag" style="background:' + _quizAccent + '">'
    + (_quizConcepts ? _quizConcept + '（综合）' : _quizConcept.split('（')[0]) + '</div>';

  html += '<div class="qz2-question">' + data.question + '</div>';

  html += '<div class="qz2-opts" id="qz2-opts">';
  var keys = ['A', 'B', 'C', 'D'];
  for (var i = 0; i < data.options.length; i++) {
    var optText = data.options[i].replace(/^[A-D][\.\s、．]+/, '');
    html += '<div class="qz2-opt" data-key="' + keys[i] + '" onclick="_selectAnswer(this, \'' + keys[i] + '\')">'
      + '<span class="qz2-key">' + keys[i] + '</span>'
      + '<span class="qz2-text">' + optText + '</span>'
      + '</div>';
  }
  html += '</div>';

  html += '<div id="qz2-explain" style="display:none"></div>';
  html += '<div id="qz2-feedback" style="display:none"></div>';
  html += '<div id="qz2-actions" style="display:none"></div>';

  html += '</div>';
  mount.innerHTML = html;
}

function _selectAnswer(el, key) {
  if (_quizAnswered) return;
  _quizAnswered = true;

  var correct = _quizData.answer;

  var _aiQid = 'ai_' + (_quizData.question || '').slice(0, 40).replace(/[^a-zA-Z0-9\u3000-\u9fff]/g, '').slice(0, 20);
  QZ.saveRecord(_aiQid, key === correct, _quizData.question);
  var opts = document.querySelectorAll('#qz2-opts .qz2-opt');

  for (var i = 0; i < opts.length; i++) {
    opts[i].classList.add('locked');
    var k = opts[i].getAttribute('data-key');
    if (k === correct) {
      opts[i].classList.add('correct');
    } else if (k === key && k !== correct) {
      opts[i].classList.add('wrong');
    } else {
      opts[i].classList.add('dim');
    }
  }

  var expEl = document.getElementById('qz2-explain');
  var expHtml = '<div class="qz2-explain"><div class="qz2-explain-title">📝 各选项解析</div>';
  var keys = ['A', 'B', 'C', 'D'];
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j];
    var exp = _quizData.explanations ? (_quizData.explanations[k] || '') : '';
    var isCorrect = k === correct;
    expHtml += '<div class="qz2-explain-item"><strong>' + k + (isCorrect ? ' ✅' : ' ❌') + '：</strong>' + exp + '</div>';
  }
  expHtml += '</div>';
  expEl.innerHTML = expHtml;
  expEl.style.display = 'block';

  _fbCtx = { type: 'ai', concept: _quizConcept, question: _quizData ? _quizData.question : '' };

  var fbEl = document.getElementById('qz2-feedback');
  fbEl.innerHTML = _renderFbHTML('ai');
  fbEl.style.display = 'block';

  var actEl = document.getElementById('qz2-actions');
  actEl.innerHTML = '<div class="qz2-actions">'
    + '<button class="qz2-btn-back" onclick="_backToConcepts()">返回知识点</button>'
    + '<button class="qz2-btn-next" onclick="_loadQuizQuestion()">下一题 →</button>'
    + '</div>';
  actEl.style.display = 'block';
}

function _backToConcepts() {
  var tabs = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].textContent.indexOf('知识点') >= 0) {
      switchTab('concepts', tabs[i]);
      break;
    }
  }
}

// =====================================================
//  QZ — Bank quiz state machine
// =====================================================
var QZ = {
  qs: [],
  loaded: false,
  selectedTopics: [],
  kvRecords: {},
  kvLoaded: false,

  queue: [],
  queuePos: 0,
  sessionDone: {},
  completions: 0,
  topicKey: '',
  curOptMap: [],

  _kvURL: QUIZ_WORKER_URL,
  _kvToken: QUIZ_AUTH_TOKEN,

  loadStats: function(cb) {
    var self = this;
    if (this.kvLoaded) { if (cb) cb(); return; }
    fetch(this._kvURL + '/bank/stats', {
      headers: { 'Authorization': 'Bearer ' + this._kvToken }
    }).then(function(r) { return r.json(); })
      .then(function(d) {
        self.kvRecords = d.records || {};
        self.kvLoaded = true;
        if (cb) cb();
      }).catch(function() {
        self.kvLoaded = true;
        if (cb) cb();
      });
  },

  saveRecord: function(qid, correct, question, feedback) {
    var body = { qid: qid, correct: correct, source: 'bank', question: question };
    if (feedback) body.feedback = feedback;
    fetch(this._kvURL + '/bank/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this._kvToken
      },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.record) QZ.kvRecords[qid] = d.record;
      }).catch(function() {});
  },

  _storageKey: 'quiz_sessions',

  _loadSession: function() {
    try {
      var all = JSON.parse(localStorage.getItem(this._storageKey) || '{}');
      var data = all[this.topicKey];
      if (data) {
        this.sessionDone = data.sessionDone || {};
        this.completions = data.completions || 0;
        return true;
      }
    } catch(e) {}
    this.sessionDone = {};
    this.completions = 0;
    return false;
  },

  _saveSession: function() {
    var all = {};
    try { all = JSON.parse(localStorage.getItem(this._storageKey) || '{}'); } catch(e) {}
    all[this.topicKey] = {
      sessionDone: this.sessionDone,
      completions: this.completions
    };
    localStorage.setItem(this._storageKey, JSON.stringify(all));
  },

  _getAllSessions: function() {
    try { return JSON.parse(localStorage.getItem(this._storageKey) || '{}'); } catch(e) { return {}; }
  },

  mount: function() {
    var el = document.getElementById('quiz-mount');
    if (!el) return;
    if (typeof QUIZ_BANK !== 'undefined' && QUIZ_BANK.length) {
      if (!this.loaded) {
        this.allBank = QUIZ_BANK;
        this.loaded = true;
      }
      var self = this;
      if (!this.kvLoaded) {
        el.innerHTML = '<div class="qz-loading"><div class="qz-spinner"></div><div class="qz-loading-txt">加载练习记录...</div></div>';
        this.loadStats(function() { self.showTopicSelect(); });
      } else {
        this.showTopicSelect();
      }
      return;
    }
    el.innerHTML = '<div class="qz-err">'
      + '<div class="qz-err-title">题库未加载</div>'
      + '<div class="qz-err-msg">未找到 QUIZ_BANK 数据</div>'
      + '<div class="qz-err-sub">请确认 <code>questions.js</code> 与 <code>index.html</code> 在同一目录。</div>'
      + '</div>';
  },

  showTopicSelect: function() {
    var el = document.getElementById('quiz-mount');
    if (!el) return;
    var self = this;
    var topics = [];
    var topicCount = {};
    var topicQids = {};
    this.allBank.forEach(function(q) {
      if (!topicCount[q.topic]) { topicCount[q.topic] = 0; topics.push(q.topic); topicQids[q.topic] = []; }
      topicCount[q.topic]++;
      topicQids[q.topic].push('bank_' + q.id);
    });

    var sessions = this._getAllSessions();

    var html = '<div class="qz-wrap" style="padding-top:24px">'
      + '<div style="text-align:center;margin-bottom:24px">'
      + '<div style="font-size:17px;font-weight:700;color:#2a2825;margin-bottom:6px">题库练习</div>'
      + '<div style="font-size:12px;color:#9a9288">共 ' + this.allBank.length + ' 道题 · 选择一个主题开始</div>'
      + '</div>'
      + '<div id="qz-topic-list" style="display:flex;flex-direction:column;gap:8px">';

    topics.forEach(function(t) {
      var total = topicCount[t];
      var sess = sessions[t] || {};
      var doneCnt = Object.keys(sess.sessionDone || {}).length;
      var completions = sess.completions || 0;
      var pct = Math.round(doneCnt / total * 100);
      var everDone = 0;
      topicQids[t].forEach(function(qid) { if (self.kvRecords[qid]) everDone++; });

      var statusHtml = '';
      if (completions > 0) {
        statusHtml = '<span style="font-size:10px;color:#7a5c45;background:#f5f3ef;padding:2px 7px;border-radius:99px">通关 ' + completions + ' 次</span>';
      }

      html += '<div class="qz-topic-card" data-topic="' + t + '" style="padding:14px 18px;background:#fff;border:1px solid #e8e4dc;border-radius:12px;cursor:pointer;transition:all .2s">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
        +   '<span style="font-size:14px;font-weight:600;color:#2a2825">' + t + '</span>'
        +   '<span style="font-size:11px;color:#b8b0a4">' + total + '题</span>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">'
        +   '<div style="flex:1;height:5px;background:#f0ece6;border-radius:3px;overflow:hidden"><div style="height:100%;background:' + (pct >= 100 ? '#5a9e35' : '#7a5c45') + ';border-radius:3px;width:' + pct + '%;transition:width .3s"></div></div>'
        +   '<span style="font-size:11px;color:#7a5c45;font-weight:500;min-width:36px;text-align:right">' + doneCnt + '/' + total + '</span>'
        + '</div>'
        + '<div style="display:flex;align-items:center;justify-content:space-between">'
        +   '<span style="font-size:10.5px;color:#b8b0a4">' + (everDone > 0 ? '做过 ' + everDone + '/' + total + ' 道' : '尚未开始') + '</span>'
        +   statusHtml
        + '</div>'
        + '</div>';
    });

    html += '</div></div>';
    el.innerHTML = html;

    document.querySelectorAll('.qz-topic-card').forEach(function(card) {
      card.addEventListener('click', function() {
        self.selectedTopics = [card.getAttribute('data-topic')];
        self.loadFiltered();
      });
    });
  },

  loadFiltered: function() {
    var self = this;
    var filtered = this.allBank.filter(function(q) {
      return self.selectedTopics.indexOf(q.topic) >= 0;
    });
    this.qs = filtered.map(function(q) {
      return {
        qid: 'bank_' + q.id,
        tag: q.topic + (q.source ? '·' + q.source : ''),
        tx: q.question,
        op: { A: q.options[0].replace(/^[A-D]\.\s*/, ''), B: q.options[1].replace(/^[A-D]\.\s*/, ''), C: q.options[2].replace(/^[A-D]\.\s*/, ''), D: q.options[3].replace(/^[A-D]\.\s*/, '') },
        ans: q.answer,
        ex: q.explanations || {},
        pt: ''
      };
    });
    this.startQuiz();
  },

  shuf: function(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  },

  buildQueue: function() {
    var self = this;
    var unseen = [];
    var seen = [];
    this.qs.forEach(function(q, i) {
      if (self.sessionDone[q.qid]) return;
      var rec = self.kvRecords[q.qid];
      if (!rec || (rec.c + rec.w === 0)) {
        unseen.push(i);
      } else {
        seen.push(i);
      }
    });
    this.queue = this.shuf(unseen).concat(this.shuf(seen));
    this.queuePos = 0;
  },

  startQuiz: function() {
    this.topicKey = this.selectedTopics[0];
    this._loadSession();
    this.buildQueue();
    if (this.queue.length === 0 && Object.keys(this.sessionDone).length >= this.qs.length) {
      this._showComplete();
    } else if (this.queue.length > 0) {
      this.render();
    } else {
      this.showTopicSelect();
    }
  },

  render: function() {
    var qIdx = this.queue[this.queuePos];
    var q = this.qs[qIdx];
    var doneCount = Object.keys(this.sessionDone).length;
    var totalCount = this.qs.length;

    this.curOptMap = this.shuf(['A','B','C','D']);
    var displayLabels = ['A','B','C','D'];
    var el = document.getElementById('quiz-mount');
    var rec = this.kvRecords[q.qid];
    var statsBadge = rec ? '<span class="qz-stats-badge"><span class="sb-g">' + rec.c + '✓</span><span class="sb-r">' + rec.w + '✗</span></span>' : '';
    el.innerHTML =
      '<div class="qz-wrap">'
      + '<div class="qz-top">'
      +   '<span class="qz-ctr">已做 <b>' + doneCount + '</b> / 共 <b>' + totalCount + '</b>'
      +   (this.completions > 0 ? '<span class="qz-rnlabel">通关 ' + this.completions + ' 次</span>' : '') + '</span>'
      +   '<div class="qz-prog-wrap"><div class="qz-prog-fill" id="qz-pf" style="width:' + (doneCount/totalCount*100) + '%"></div></div>'
      + '</div>'
      + '<div class="qz-qcard">'
      +   '<div class="qz-meta"><span class="qz-num">Q' + (doneCount + 1) + '</span><span class="qz-tag">' + q.tag + '</span>' + statsBadge + '</div>'
      +   '<p class="qz-qtx" id="qz-qtx"></p>'
      + '</div>'
      + '<div class="qz-opts" id="qz-opts"></div>'
      + '<div id="qz-ra"></div>'
      + '</div>';
    document.getElementById('qz-qtx').textContent = q.tx;
    var self = this;
    var optsEl = document.getElementById('qz-opts');
    displayLabels.forEach(function(dk, i) {
      var origKey = self.curOptMap[i];
      var d = document.createElement('div');
      d.className = 'qz-opt';
      d.id = 'qz-o' + dk;
      d.innerHTML = '<span class="qz-okey">' + dk + '</span><span class="qz-otx"></span>';
      d.querySelector('.qz-otx').textContent = q.op[origKey];
      d.addEventListener('click', function() { self.pick(dk); });
      optsEl.appendChild(d);
    });
  },

  pick: function(displayKey) {
    var qIdx = this.queue[this.queuePos];
    var q = this.qs[qIdx];
    var self = this;
    var displayLabels = ['A','B','C','D'];
    var pickedOrigKey = this.curOptMap[displayLabels.indexOf(displayKey)];
    var correctDisplayKey = displayLabels[this.curOptMap.indexOf(q.ans)];
    var good = pickedOrigKey === q.ans;

    _fbCtx = { type: 'bank', qid: q.qid, question: q.tx };

    this.saveRecord(q.qid, good, q.tx);

    this.sessionDone[q.qid] = true;
    this._saveSession();

    displayLabels.forEach(function(dk) {
      var el = document.getElementById('qz-o' + dk);
      el.classList.add('lk');
      el.replaceWith(el.cloneNode(true));
      el = document.getElementById('qz-o' + dk);
      if (dk === correctDisplayKey)  el.classList.add('cor');
      else if (dk === displayKey)    el.classList.add('wrg');
      else                           el.classList.add('dim');
    });

    var doneCount = Object.keys(this.sessionDone).length;
    var totalCount = this.qs.length;
    var isComplete = doneCount >= totalCount;

    document.getElementById('qz-pf').style.width = (doneCount/totalCount*100) + '%';
    var ctrEl = document.querySelector('.qz-ctr');
    if (ctrEl) ctrEl.innerHTML = '已做 <b>' + doneCount + '</b> / 共 <b>' + totalCount + '</b>'
      + (this.completions > 0 ? '<span class="qz-rnlabel">通关 ' + this.completions + ' 次</span>' : '');

    var rows = displayLabels.map(function(dk, i) {
      var origK = self.curOptMap[i];
      var isAns = origK === q.ans;
      return '<tr><td><strong>' + dk + '</strong></td>'
        + '<td><span class="qz-tg ' + (isAns?'y':'n') + '">' + (isAns?'正解':'誤り') + '</span></td>'
        + '<td>' + (q.ex[origK] || '—') + '</td></tr>';
    }).join('');

    var nextLabel = isComplete ? '通关！查看结果 →' : '次の問題 →';

    var raEl = document.getElementById('qz-ra');
    raEl.innerHTML =
      '<div class="qz-rp ' + (good?'g':'r') + '">'
      + '<div class="qz-rv">' + (good ? '正解 ✓' : '不正解 — 正解は ' + correctDisplayKey + ' です') + '</div>'
      + '<div class="qz-re">' + (q.ex[pickedOrigKey] || (good ? '正解です。' : '不正解です。')) + '</div>'
      + (q.pt ? '<div class="qz-pb"><strong>ポイント：</strong>' + q.pt + '</div>' : '')
      + '<div class="qz-atitle">全選択肢の解析</div>'
      + '<table class="qz-atb"><thead><tr>'
      + '<th style="width:48px">選択肢</th><th style="width:60px">判定</th><th>解説</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>'
      + _renderFbHTML('bk' + qIdx)
      + '<button class="qz-btn" id="qz-nextbtn">' + nextLabel + '</button>'
      + '</div>';

    document.getElementById('qz-nextbtn').addEventListener('click', function() {
      if (isComplete) {
        self.completions++;
        self.sessionDone = {};
        self._saveSession();
        self._showComplete();
      } else {
        self.queuePos++;
        self.render();
        var el = document.getElementById('quiz-mount');
        if (el) el.scrollTop = 0;
      }
    });
    var _ra2 = raEl;
    setTimeout(function() { if (_ra2 && _ra2.parentNode) _ra2.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 80);
  },

  _showComplete: function() {
    var self = this;
    var el = document.getElementById('quiz-mount');
    var totalC = 0, totalW = 0;
    this.qs.forEach(function(q) {
      var rec = self.kvRecords[q.qid];
      if (rec) { totalC += rec.c; totalW += rec.w; }
    });
    var totalAttempts = totalC + totalW;
    var rate = totalAttempts > 0 ? Math.round(totalC / totalAttempts * 100) : 0;

    el.innerHTML =
      '<div class="qz-wrap">'
      + '<div class="qz-fc">'
      +   '<div style="font-size:40px;margin-bottom:8px">&#127881;</div>'
      +   '<div class="qz-ftitle">通关！</div>'
      +   '<div class="qz-fsub">已完成本范围全部 ' + this.qs.length + ' 道题</div>'
      +   '<div style="margin:16px 0;padding:14px 20px;background:#f5f3ef;border-radius:12px">'
      +     '<div style="font-size:24px;font-weight:700;color:#7a5c45">' + this.completions + ' <span style="font-size:14px;font-weight:400">次通关</span></div>'
      +     '<div style="font-size:12px;color:#9a9288;margin-top:4px">累计正确率 ' + rate + '%</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:10px;margin-top:1rem">'
      +     '<button class="qz-btn qz-btn-ghost" id="qz-back-topics">← 重新选题</button>'
      +     '<button class="qz-btn" id="qz-retry">再来一轮</button>'
      +   '</div>'
      + '</div></div>';
    document.getElementById('qz-retry').addEventListener('click', function() {
      self.buildQueue();
      if (self.queue.length > 0) {
        self.render();
      } else {
        self.showTopicSelect();
      }
    });
    document.getElementById('qz-back-topics').addEventListener('click', function() { self.showTopicSelect(); });
    if (el) el.scrollTop = 0;
  }
};
