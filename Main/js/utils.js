// ===== utils.js — Global variables + utility functions =====

// --- Stubs for functions defined in quiz.js (idle-preload) ---
// 如果用户在 quiz.js 加载完成前点击学派详情页的 "在线答题" / "题库答题"，
// 这两个 stub 会触发 _ensureQuizModules 加载 quiz.js，然后调用真函数。
// quiz.js 加载后其 function 声明会覆盖这些 stub（浏览器 function declaration 后声明覆盖前声明）。
function goSchoolQuiz() {
  var args = arguments;
  if (typeof window._ensureQuizModules === 'function') {
    window._ensureQuizModules(function() {
      if (window.goSchoolQuiz && window.goSchoolQuiz !== goSchoolQuiz) {
        window.goSchoolQuiz.apply(null, args);
      }
    });
  }
}
function startSchoolBank() {
  var args = arguments;
  if (typeof window._ensureQuizModules === 'function') {
    window._ensureQuizModules(function() {
      if (window.startSchoolBank && window.startSchoolBank !== startSchoolBank) {
        window.startSchoolBank.apply(null, args);
      }
    });
  }
}

var _navStack = [];
var _listState = null; // 从列表跳到详情时保存列表滚动位置

var _jaSwapCache = {};

var _masteredKeys = JSON.parse(localStorage.getItem('mastered') || '{}');

var _currentOpenedSwipe = null;

var QUIZ_WORKER_URL = 'https://quiz-worker.husuli0623.workers.dev';
// TODO: 迁移到 Worker 端 Origin 校验，移除客户端明文 token
var QUIZ_AUTH_TOKEN = 'quiz_token_2026';

var _quizConcept = '';
var _quizSchool = '';
var _quizAccent = '#7a5c45';
var _quizData = null;
var _quizAnswered = false;
var _quizUniTimer = null;
var _quizConcepts = null; // multi-concept mode (school quiz)
var _quizDetails = null;  // detailed content for deep school quiz

var CONCEPTS_INDEX = null;
var _cnCat = 'all';    // 'all' or L1 name
var _cnCats = [];      // multi-select sub-categories
var _cnSchoolFilter = ''; // filter by specific school key

// 对应 PDF 思维导图文件名的分类体系
var TOPIC_MAP = {
  // === SM 戦略理論 ===
  io:'競争戦略', rbv:'競争戦略', dynamic:'競争戦略', harvard:'競争戦略',
  // === SM 戦略形成学派 ===
  design_s:'戦略形成学派', planning_s:'戦略形成学派', positioning_s:'戦略形成学派',
  entrepreneur_s:'戦略形成学派', cognitive_s:'戦略形成学派', learning_s:'戦略形成学派',
  power_s:'戦略形成学派', culture_s:'戦略形成学派', environment_s:'戦略形成学派',
  configuration_s:'戦略形成学派',
  // === SM イノベーション・知識 ===
  innovation:'イノベーション戦略', platform:'イノベーション戦略', km:'イノベーション戦略',
  // === SM 国際経営 ===
  international_strategy:'国際戦略',
  // === SM ガバナンス・CSR ===
  csr:'ガバナンス・CSR', agency:'ガバナンス・CSR', tce:'ガバナンス・CSR',
  // === OB 個体 ===
  personality:'人格・知覚',
  attitude_emotion:'態度・情緒',
  behavioral:'モチベーション・学習', ob:'モチベーション・学習', beh_econ:'モチベーション・学習',
  // === OB リーダーシップ／コンフリクト ===
  ohio:'リーダーシップ', michigan:'リーダーシップ', situational:'リーダーシップ',
  leadership_theory:'リーダーシップ',
  conflict:'コンフリクト',
  // === OB 組織 ===
  change:'組織文化・変革',
  // km already defined above
  stanford:'組織学習', org_learning:'組織学習',
  // === OB HRM ===
  hrm:'人的資源管理',
  hitotsubashi:'日本的経営', japanese_mgmt:'日本的経営',
  // === OT 経営基礎 ===
  scientific:'経営史', bureaucracy:'経営史', process:'経営史', humanrel:'経営史', static_structure:'経営史',
  carnegie:'意思決定論', equilibrium:'意思決定論', evolution_process:'意思決定論',
  decision_theory:'意思決定論',
  // === OT 組織設計 ===
  contingency:'組織構造・設計', systems:'組織構造・設計', adaptive_design:'組織構造・設計',
  tavistock:'組織構造・設計', aston:'組織構造・設計', org_types:'組織構造・設計',
  // === OT 制度・生態 ===
  institutional:'制度理論',
  // === OT ネットワーク ===
  social_network:'ソーシャル・ネットワーク', chicago:'ソーシャル・ネットワーク'
};
var TOPIC_ORDER = [
  // SM
  '競争戦略','戦略形成学派','イノベーション戦略','国際戦略','ガバナンス・CSR',
  // OB
  '人格・知覚','態度・情緒','モチベーション・学習','リーダーシップ','コンフリクト','組織文化・変革','組織学習','人的資源管理','日本的経営',
  // OT
  '経営史','意思決定論','組織構造・設計','制度理論','ソーシャル・ネットワーク'
];

// L1 → 子分类映射
var _L1_CATS = {
  SM: ['競争戦略','戦略形成学派','イノベーション戦略','国際戦略','ガバナンス・CSR'],
  OB: ['人格・知覚','態度・情緒','モチベーション・学習','リーダーシップ','コンフリクト','組織文化・変革','組織学習','人的資源管理','日本的経営'],
  OT: ['経営史','意思決定論','組織構造・設計','制度理論','ソーシャル・ネットワーク']
};
var _l1Colors = { SM:'#007AFF', OB:'#34C759', OT:'#FF9500' };

// Scholar L1 color → key mapping
var _scholarL1Colors = { SM: '#007AFF', OB: '#34C759', OT: '#FF9500' };
var _scholarL1 = 'all';
var _scholarSubLabels = [];
var _scholarSchoolFilter = '';

var SCHOLAR_NAME_MAP = {
  "泰勒": "taylor", "Taylor": "taylor", "Frederick W. Taylor": "taylor",
  "法约尔": "fayol", "Fayol": "fayol", "Henri Fayol": "fayol",
  "韦伯": "weber", "Weber": "weber", "Max Weber": "weber",
  "吉尔布雷思": "gilbreth", "Gilbreth": "gilbreth",
  "梅奥": "mayo", "Mayo": "mayo", "Elton Mayo": "mayo",
  "马斯洛": "maslow", "Maslow": "maslow", "Abraham Maslow": "maslow",
  "麦格雷戈": "mcgregor", "McGregor": "mcgregor", "Douglas McGregor": "mcgregor",
  "赫茨伯格": "herzberg", "Herzberg": "herzberg", "Frederick Herzberg": "herzberg",
  "弗鲁姆": "vroom", "Vroom": "vroom", "Victor Vroom": "vroom",
  "巴纳德": "barnard", "Barnard": "barnard", "Chester Barnard": "barnard",
  "李克特": "likert", "Likert": "likert", "Rensis Likert": "likert",
  "西蒙": "simon", "Simon": "simon", "Herbert Simon": "simon",
  "马奇": "march", "March": "march", "James March": "march",
  "赛厄特": "cyert", "Richard Cyert": "cyert", "理查德·赛厄特": "cyert", "Cyert": "cyert",
  "安索夫": "ansoff", "Ansoff": "ansoff", "Igor Ansoff": "ansoff",
  "钱德勒": "chandler", "Chandler": "chandler", "Alfred Chandler": "chandler",
  "波特": "porter", "Porter": "porter", "Michael Porter": "porter",
  "巴尼": "barney", "Barney": "barney", "Jay Barney": "barney",
  "蒂斯": "teece", "Teece": "teece", "David Teece": "teece",
  "彭罗斯": "penrose", "Penrose": "penrose", "Edith Penrose": "penrose",
  "威廉姆森": "williamson", "Williamson": "williamson", "Oliver Williamson": "williamson",
  "科斯": "coase", "Coase": "coase", "Ronald Coase": "coase",
  "迪马吉奥": "dimaggio", "DiMaggio": "dimaggio", "Paul DiMaggio": "dimaggio",
  "鲍威尔": "powell", "Powell": "powell", "Walter Powell": "powell",
  "詹森": "jensen", "Jensen": "jensen", "Michael Jensen": "jensen",
  "劳伦斯": "lawrence", "Lawrence": "lawrence", "Paul Lawrence": "lawrence",
  "斯托格迪尔": "stogdill", "Stogdill": "stogdill",
  "菲德勒": "fiedler", "Fiedler": "fiedler", "Fred Fiedler": "fiedler",
  "赫塞": "hersey", "Hersey": "hersey", "Paul Hersey": "hersey",
  "科特": "kotter", "Kotter": "kotter", "John Kotter": "kotter",
  "野中郁次郎": "nonaka", "Nonaka": "nonaka", "Ikujiro Nonaka": "nonaka",
  "竹内弘高": "takeuchi", "Takeuchi": "takeuchi", "Hirotaka Takeuchi": "takeuchi",
  "克里斯坦森": "christensen", "Christensen": "christensen", "Clayton Christensen": "christensen",
  "熊彼特": "schumpeter", "Schumpeter": "schumpeter", "Joseph Schumpeter": "schumpeter",
  "弗里曼": "freeman", "Freeman": "freeman", "R. Edward Freeman": "freeman",
  "勒温": "lewin", "Lewin": "lewin", "Kurt Lewin": "lewin",
  "特里斯特": "trist", "Trist": "trist", "Eric Trist": "trist",
  "洛施": "lorsch", "Lorsch": "lorsch", "Jay Lorsch": "lorsch", "杰·洛施": "lorsch",
  "伍德沃德": "woodward", "Woodward": "woodward", "Joan Woodward": "woodward", "琼·伍德沃德": "woodward",
  "弗里德曼": "friedman", "Friedman": "friedman", "Milton Friedman": "friedman", "米尔顿·弗里德曼": "friedman",
  "法马": "fama", "Fama": "fama", "Eugene Fama": "fama", "尤金·法马": "fama",
  "麦克林": "meckling", "Meckling": "meckling", "William Meckling": "meckling", "威廉·麦克林": "meckling",
  "斯金纳": "skinner", "Skinner": "skinner", "B.F. Skinner": "skinner",
  "亚当斯": "adams", "Adams": "adams", "Stacy Adams": "adams", "斯塔西·亚当斯": "adams",
  "布兰查德": "blanchard", "Blanchard": "blanchard", "Ken Blanchard": "blanchard", "肯·布兰查德": "blanchard",
  "切萨布鲁": "chesbrough", "Chesbrough": "chesbrough", "Henry Chesbrough": "chesbrough",
  "哈默尔": "hamel", "Hamel": "hamel", "Gary Hamel": "hamel", "盖瑞·汉默尔": "hamel",
  "沙因": "schein", "Schein": "schein", "Edgar Schein": "schein", "埃德加·沙因": "schein",
  "约翰·W·迈耶": "meyer", "John W. Meyer": "meyer", "J.W. Meyer": "meyer",
  "约翰·P·迈耶": "allen_meyer", "John P. Meyer": "allen_meyer",
  "汉南": "hannan", "Hannan": "hannan", "Michael Hannan": "hannan", "迈克尔·汉南": "hannan",
  "普伊": "pugh", "Pugh": "pugh", "Derek Pugh": "pugh", "德雷克·普伊": "pugh",
  "罗恩": "rowan", "Rowan": "rowan", "Brian Rowan": "rowan", "布赖恩·罗恩": "rowan",
  "甘特": "gantt", "Gantt": "gantt", "Henry Gantt": "gantt", "亨利·甘特": "gantt",
  "厄威克": "urwick", "Urwick": "urwick", "Lyndall Urwick": "urwick", "林道尔·厄威克": "urwick",
  "古利克": "gulick", "Gulick": "gulick", "Luther Gulick": "gulick", "路德·古利克": "gulick",
  "孔茨": "koontz", "Koontz": "koontz", "Harold Koontz": "koontz", "哈罗德·孔茨": "koontz",
  "福莱特": "follett", "Follett": "follett", "Mary Parker Follett": "follett", "玛丽·帕克·福莱特": "follett",
  "罗特利斯伯格": "roethlisberger", "Roethlisberger": "roethlisberger", "弗里茨·罗特利斯伯格": "roethlisberger",
  "豪斯": "house", "House": "house", "Robert House": "house", "罗伯特·豪斯": "house",
  "班杜拉": "bandura", "Bandura": "bandura", "Albert Bandura": "bandura", "阿尔伯特·班杜拉": "bandura",
  "贝塔朗菲": "bertalanffy", "Bertalanffy": "bertalanffy", "Von Bertalanffy": "bertalanffy", "路德维希·冯·贝塔朗菲": "bertalanffy",
  "安德鲁斯": "andrews", "Andrews": "andrews", "Kenneth Andrews": "andrews", "肯尼斯·安德鲁斯": "andrews",
  "沃纳费尔特": "wernerfelt", "Wernerfelt": "wernerfelt", "Birger Wernerfelt": "wernerfelt", "伯格·沃纳费尔特": "wernerfelt",
  "皮萨诺": "pisano", "Pisano": "pisano", "Gary Pisano": "pisano", "加里·皮萨诺": "pisano",
  "波兰尼": "polanyi", "Polanyi": "polanyi", "Michael Polanyi": "polanyi", "迈克尔·波兰尼": "polanyi",
  "帕克": "parker", "Parker": "parker", "Geoffrey Parker": "parker", "杰弗里·帕克": "parker",
  "布林约尔松": "brynjolfsson", "Brynjolfsson": "brynjolfsson", "Erik Brynjolfsson": "brynjolfsson", "埃里克·布林约尔松": "brynjolfsson",
  "麦卡菲": "mcafee", "McAfee": "mcafee", "Andrew McAfee": "mcafee", "安德鲁·麦卡菲": "mcafee",
  "斯蒂格勒": "stigler", "Stigler": "stigler", "George Stigler": "stigler", "乔治·斯蒂格勒": "stigler",
  "弗莱什曼": "fleishman", "Fleishman": "fleishman", "Edwin Fleishman": "fleishman", "爱德温·弗莱什曼": "fleishman",
  "卡茨": "katz_d", "Daniel Katz": "katz_d", "丹尼尔·卡茨": "katz_d",
  "班福斯": "bamforth", "Bamforth": "bamforth", "Ken Bamforth": "bamforth", "肯·班福斯": "bamforth",
  "艾默里": "emery", "Emery": "emery", "Fred Emery": "emery", "弗雷德·艾默里": "emery",
  "希克森": "hickson", "Hickson": "hickson", "David Hickson": "hickson", "大卫·希克森": "hickson",
  "西里尔·奥唐奈": "koontz",
  "埃德温·洛克": "locke_e", "Locke": "locke_e", "Edwin Locke": "locke_e", "洛克": "locke_e",
  "亨宁斯": "hinings", "Hinings": "hinings", "Chris Hinings": "hinings", "克里斯·亨宁斯": "hinings",
  "沼上幹": "numagami", "Numagami": "numagami", "沼上": "numagami",
  "罗歇": "rochet", "Rochet": "rochet", "Jean-Charles Rochet": "rochet", "罗卡比利": "rochet",
  "赖施": "raisch", "Raisch": "raisch", "Sebastian Raisch": "raisch",

  "ワイク": "weick", "Weick": "weick", "Karl Weick": "weick", "卡尔·韦克": "weick",
  "ミンツバーグ": "mintzberg", "Mintzberg": "mintzberg", "Henry Mintzberg": "mintzberg", "亨利·明茨伯格": "mintzberg",
  "トンプソン": "thompson_jd", "Thompson": "thompson_jd", "James Thompson": "thompson_jd", "詹姆斯·汤普森": "thompson_jd",
  "セルズニック": "selznick", "Selznick": "selznick", "Philip Selznick": "selznick", "菲利普·塞尔兹尼克": "selznick",

  "哈特": "hart", "Hart": "hart", "Oliver Hart": "hart", "奥利弗·哈特": "hart",
  "伯利": "berle", "Berle": "berle", "Adolf Berle": "berle", "阿道夫·伯利": "berle",
  "明斯": "means", "Means": "means", "Gardiner Means": "means", "加德纳·明斯": "means",
  "比尔": "beer_m", "Beer": "beer_m", "Michael Beer": "beer_m", "迈克尔·比尔": "beer_m",
  "格罗斯曼": "hart", "Grossman": "hart", "Sanford Grossman": "hart",
  "莫尔": "moore_jh", "John Moore": "moore_jh", "约翰·莫尔": "moore_jh",
  "沃尔顿": "walton_r", "Walton": "walton_r", "Richard Walton": "walton_r",
  "冯布伦": "fombrun", "Fombrun": "fombrun", "Charles Fombrun": "fombrun",

  "艾米·苏恩": "shuen", "Amy Shuen": "shuen",
  "悉尼·温特": "winter_s", "Sidney Winter": "winter_s", "Winter": "winter_s",
  "埃里克·冯·希佩尔": "vonhippel", "Eric von Hippel": "vonhippel", "冯·希佩尔": "vonhippel",
  "马歇尔·范·阿尔斯泰因": "van_alstyne", "Marshall Van Alstyne": "van_alstyne",
  "罗莎贝斯·莫斯·坎特": "kanter", "Rosabeth Moss Kanter": "kanter", "坎特": "kanter",
  "罗伯特·卡恩": "kahn_r", "Robert Kahn": "kahn_r",

  "戈尔曼": "goleman", "Goleman": "goleman", "Daniel Goleman": "goleman", "丹尼尔·戈尔曼": "goleman",
  "霍兰德": "holland", "Holland": "holland", "John Holland": "holland", "约翰·霍兰德": "holland",
  "哈克曼": "hackman", "Hackman": "hackman", "Richard Hackman": "hackman",
  "罗特": "rotter", "Rotter": "rotter", "Julian Rotter": "rotter", "朱利安·罗特": "rotter",
  "费斯廷格": "festinger", "Festinger": "festinger", "Leon Festinger": "festinger", "利昂·费斯廷格": "festinger",
  "凯利": "kelley", "Kelley": "kelley", "Harold Kelley": "kelley", "哈罗德·凯利": "kelley",
  "塔克曼": "tuckman", "Tuckman": "tuckman", "Bruce Tuckman": "tuckman", "布鲁斯·塔克曼": "tuckman",
  "Latham": "locke_e",

  "基尼": "keeney", "Keeney": "keeney", "Ralph Keeney": "keeney", "拉尔夫·基尼": "keeney",
  "雷法": "raiffa", "Raiffa": "raiffa", "Howard Raiffa": "raiffa", "霍华德·雷法": "raiffa",
  "奥尔波特": "allport", "Allport": "allport", "G. Allport": "allport", "Gordon Allport": "allport",
  "科斯塔": "costa_mccrae", "Costa": "costa_mccrae", "McCrae": "costa_mccrae",
  "阿吉里斯": "argyris", "Argyris": "argyris", "Chris Argyris": "argyris",
  "阿尔德弗": "alderfer", "Alderfer": "alderfer", "Clayton Alderfer": "alderfer",
  "麦克莱兰": "mcclelland", "McClelland": "mcclelland", "David McClelland": "mcclelland",
  "莱曼·波特": "porter_lw", "Lyman Porter": "porter_lw",
};

// Drag state
var _drag = { state: 'idle', timer: null, ghost: null, placeholder: null, startY: 0, startX: 0, offsetY: 0, items: [], currentIdx: -1, origIdx: -1, container: null, orderKey: null };

// Fold arrow SVG
var _foldArrowSVG = '<span class="fold-arrow"><svg viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg></span>';

// Feedback context
var _fbCtx = null;

// School bank state
var _sbStorageKey = 'school_bank_progress';
var _sbActive = false;

// Picker component L1 groups and colors
var _L1_GROUPS = { SM: [6,7,10,12], OB: [1,2], OT: [3,4,5,8,11] };
var _L1_COLOR  = { SM: '#007AFF', OB: '#34C759', OT: '#FF9500' };

// Editor helpers
var _itemDelBtn = '<button class="dm-item-del" onclick="this.parentElement.remove()" title="删除">×</button>';
var _groupDelBtn = '<button class="dm-group-del" onclick="this.parentElement.remove()" title="删除组">×</button>';

// ---- Utility functions ----

/* 从学者的 schools 数组推导 accent 颜色，避免手动维护 */
function _escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _scholarAccent(s) {
  if (s.schools && s.schools.length) {
    for (var i = 0; i < s.schools.length; i++) {
      var sk = NAME_TO_KEY[s.schools[i]];
      if (sk && DATA[sk]) return DATA[sk].accent;
    }
  }
  return s.accent;
}

function _scholarEra(s) {
  var m = s.born ? s.born.match(/(\d{4})/) : null;
  var b = m ? m[1] : '';
  if (!b) return '';
  var m2 = s.died ? s.died.match(/(\d{4})/) : null;
  var d = m2 ? m2[1] : '';
  return b + '–' + d;
}

function _surname(w) {
  var cn = w.split(' ')[0]; // e.g. "弗雷德里克·泰勒"
  var idx = cn.lastIndexOf('\u00B7'); // middle dot ·
  return idx >= 0 ? cn.slice(idx + 1) : cn;
}

function _slugify(s) {
  return (s || '').toLowerCase()
    .replace(/\s+(sr\.|jr\.|iii|ii|iv|ph\.d\.|dr\.)$/i, '') // 去掉学位/辈分后缀
    .replace(/[^\w]/g, ' ')   // 非 word 字符替换为空格
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function _simpleHash(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & h; // 转 32-bit int
  }
  return h;
}

var _FLAG_MAP = {
  '美国':'🇺🇸','英国':'🇬🇧','法国':'🇫🇷','德国':'🇩🇪','日本':'🇯🇵',
  '加拿大':'🇨🇦','澳大利亚':'🇦🇺','奥地利':'🇦🇹','瑞士':'🇨🇭','瑞典':'🇸🇪',
  '荷兰':'🇳🇱','比利时':'🇧🇪','意大利':'🇮🇹','西班牙':'🇪🇸','葡萄牙':'🇵🇹',
  '俄罗斯':'🇷🇺','中国':'🇨🇳','韩国':'🇰🇷','印度':'🇮🇳','以色列':'🇮🇱',
  '新西兰':'🇳🇿','丹麦':'🇩🇰','挪威':'🇳🇴','芬兰':'🇫🇮','爱尔兰':'🇮🇪',
  '波兰':'🇵🇱','匈牙利':'🇭🇺','捷克':'🇨🇿','希腊':'🇬🇷','土耳其':'🇹🇷',
  '巴西':'🇧🇷','墨西哥':'🇲🇽','阿根廷':'🇦🇷','南非':'🇿🇦','埃及':'🇪🇬',
  '新加坡':'🇸🇬','马来西亚':'🇲🇾','泰国':'🇹🇭','印度尼西亚':'🇮🇩',
  '台湾':'🇹🇼','香港':'🇭🇰'
};
function _nationalityToFlag(nationality) {
  if (!nationality) return '';
  return nationality.split(/[\/、]/).map(function(n) {
    return _FLAG_MAP[n.trim()] || '';
  }).filter(Boolean).join(' ');
}

function _generateScholarKey(name, en) {
  var base = '';
  var parts = _slugify(en);
  if (parts.length) {
    base = parts[parts.length - 1];
  } else if (name) {
    base = 'sch_' + Math.abs(_simpleHash(name)).toString(36).slice(0, 6);
  } else {
    base = 'sch_' + Date.now().toString(36).slice(-6);
  }
  base = base.replace(/[^a-z0-9_]/g, '');
  if (!base) base = 'sch_' + Date.now().toString(36).slice(-6);
  if (!SCHOLARS[base]) return base;
  for (var i = 2; i < 200; i++) {
    var k = base + '_' + i;
    if (!SCHOLARS[k]) return k;
  }
  return base + '_' + Math.random().toString(36).slice(2, 6);
}

function _generateSchoolKey(title, en) {
  var base = '';
  var parts = _slugify(en);
  if (parts.length === 1) base = parts[0];
  else if (parts.length === 2) base = parts.join('_');
  else if (parts.length >= 3) base = parts[0];
  else if (title) {
    base = 'school_' + Math.abs(_simpleHash(title)).toString(36).slice(0, 6);
  } else {
    base = 'school_' + Date.now().toString(36).slice(-6);
  }
  base = base.replace(/[^a-z0-9_]/g, '');
  if (!base) base = 'school_' + Date.now().toString(36).slice(-6);
  if (!DATA[base]) return base;
  for (var i = 2; i < 200; i++) {
    var k = base + '_' + i;
    if (!DATA[k]) return k;
  }
  return base + '_' + Math.random().toString(36).slice(2, 6);
}

function _hexRgb(hex) {
  return parseInt(hex.slice(1,3),16)+','+parseInt(hex.slice(3,5),16)+','+parseInt(hex.slice(5,7),16);
}

function _mdBold(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function _hlEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _hlText(text, q) {
  if (!q) return text;
  return text.replace(new RegExp('(' + _hlEscape(q) + ')', 'gi'),
    '<mark class="sh">$1</mark>');
}

// 解析scholar字段（支持逗号分隔多人）
function _knScholars(k) {
  if (!k.scholar) return [];
  return k.scholar.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
}
// 从 KNOWLEDGE 条目提取学者姓氏用于显示
function _knScholarLastName(k) {
  var keys = _knScholars(k);
  if (!keys.length) return null;
  return keys.map(function(key) {
    var s = SCHOLARS[key];
    if (!s) return key;
    var parts = (s.en || '').replace(/\s+(Sr\.|Jr\.|III|II|IV)$/i, '').split(' ');
    return parts.length ? parts.pop() : s.name;
  }).join(' · ');
}
// 从 KNOWLEDGE 条目构建展示标题（如 "钻石模型（Diamond Model，Porter，1990）"）
function _knFullTitle(k) {
  var paren = [];
  if (k.en) paren.push(k.en);
  var keys = _knScholars(k);
  keys.forEach(function(key) {
    var s = SCHOLARS[key];
    if (s) {
      var parts = (s.en || '').replace(/\s+(Sr\.|Jr\.|III|II|IV)$/i, '').split(' ');
      if (parts.length) paren.push(parts.pop());
    } else { paren.push(key); }
  });
  if (k.year) paren.push(k.year);
  return paren.length ? k.title + '（' + paren.join('，') + '）' : k.title;
}

function _isNameSeg(seg) {
  if (!seg) return false;
  if (/^\d{4}(?:\s*[\/\-]\s*\d{4})?$/.test(seg)) return true;
  if (!/[A-Za-z]/.test(seg)) return false;
  if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(seg)) return false;
  if (/^[A-Z][A-Z0-9]{0,5}$/.test(seg.replace(/\s/g, ''))) return false;
  if (/\bet al\.?\b/i.test(seg)) return true;
  if (/[&\/]/.test(seg)) {
    var nameParts = seg.split(/\s*[&\/]\s*/);
    if (nameParts.length >= 2 && nameParts.every(function(p) { return /^[A-Z][a-z]{1,15}$/.test(p.trim()); })) return true;
  }
  var BAD = /(tion|ment|ness|ity|ism|ance|ence|ive|ical|ory|ous|ful|ics|ogy|ure|ery|ship|less|ward|hood|ing|ent|ect|ial|lar|ble|sis|acy|nal|tic|nce)$/i;
  var STOP = {Model:1,Theory:1,Effect:1,Bias:1,Method:1,Type:1,Process:1,Approach:1,
    Value:1,Asset:1,Role:1,Norm:1,Goal:1,Task:1,Work:1,Group:1,Team:1,
    School:1,Chart:1,Loop:1,Cycle:1,Rule:1,Field:1,Level:1,Stage:1,Phase:1,Score:1,
    Style:1,Code:1,Game:1,Matrix:1,Force:1,Hand:1,Open:1,High:1,
    Dark:1,Lead:1,Joint:1,Loose:1,Free:1,System:1,Paradox:1,Problem:1,
    Concept:1,Curve:1,Market:1,Capital:1,Chain:1,Platform:1,Network:1,
    Resource:1,Firm:1,Form:1,Mode:1,Jungle:1,Locus:1,Self:1,
    Triad:1,Control:1,Stakeholder:1,Structural:1,Stress:1,
    Cognitive:1,Emotional:1,Networks:1,Barriers:1,Dynamics:1,Structure:1,
    Decision:1,Behavior:1,Innovation:1,Strategy:1,Capability:1,Revolution:1,
    Ocean:1,Perspective:1,Properties:1,Legitimacy:1,Groups:1,Inertia:1,
    View:1,Analysis:1,Framework:1,Indicator:1,
    Theorem:1,Trap:1,Contract:1,Bottom:1,Line:1,Anchor:1,Schema:1,Paradigm:1,
    Knowledge:1,Master:1,Routine:1,Waste:1,Leap:1,Dilemma:1,Synergy:1,
    Franchise:1,Enterprise:1,Price:1,Archetype:1,Quantum:1,Career:1,
    Startup:1,Groupthink:1,Keiretsu:1,Think:1,Change:1,Power:1,
    Cost:1,Profit:1,Design:1,Plan:1,Test:1,Fit:1,Slack:1,Span:1,
    Lean:1,Flat:1,Tall:1,Core:1,Base:1,Flow:1,Lock:1,Rent:1,Gap:1,
    Scan:1,Hedge:1,Niche:1,Scope:1,Spin:1,Swap:1,Yield:1,Stock:1,
    Craft:1,Drift:1,Shift:1,Split:1,Bet:1,Bid:1,Fit:1,Hub:1,Web:1,
    Grid:1,Myth:1,Norm:1,Path:1,Peak:1,Pit:1,Push:1,Pull:1,Risk:1,
    Seed:1,Wage:1,Zone:1,Audit:1,Batch:1,Blend:1,Brand:1,Brief:1,
    Claim:1,Clash:1,Climb:1,Coach:1,Crowd:1,Doubt:1,Dream:1,
    Equity:1,Goods:1,Index:1,Input:1,Issue:1,Label:1,Layer:1,
    Limit:1,Margin:1,Merit:1,Morale:1,Order:1,Output:1,Panel:1,
    Pitch:1,Pledge:1,Quota:1,Range:1,Ratio:1,Reach:1,Right:1,
    Sector:1,Setup:1,Share:1,Signal:1,Skill:1,Space:1,Stake:1,
    Supply:1,Demand:1,Target:1,Tenure:1,Trade:1,Trend:1,Trust:1,
    Turnover:1,Venture:1,Virtue:1,Vision:1,Voice:1,Exit:1,
    Surplus:1,Deficit:1,Ladder:1,Bonus:1,Halo:1,Anchor:1,Silo:1};
  var parts = seg.split(/\s*[&]\s*/);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p) continue;
    var words = p.split(/\s+/);
    if (words.length > 3) return false;
    for (var j = 0; j < words.length; j++) {
      var w = words[j];
      if (/^(the|a|an|of|in|on|for|and|or|vs|to|by|with|from|as|at|is|are|not|no|all)$/i.test(w)) return false;
      if (STOP[w]) return false;
      if (w.length > 2 && /s$/i.test(w) && STOP[w.slice(0,-1)]) return false;
      if (w.length > 3 && /ies$/i.test(w) && STOP[w.slice(0,-3)+'y']) return false;
      if (/^(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|First|Second|Third)$/i.test(w)) return false;
      if (BAD.test(w) && w.length > 4) return false;
    }
  }
  return true;
}

function _jpLookup(title) {
  var v = JP_MAP[title];
  if (v) return v;
  var cn = title.replace(/[（(][^）)]+[）)][\s]*$/, '').trim();
  if (cn !== title) v = JP_MAP[cn];
  if (v) return v;
  if (typeof DATA_JA !== 'undefined') {
    var jaKey = cn || title;
    var ja = DATA_JA[jaKey];
    if (ja) {
      var m = ja.match(/^<strong>([\s\S]*?)<\/strong>/);
      if (m) {
        var jaTitle = m[1].replace(/（[^）]*）|\([^)]*\)/g, '').replace(/——[\s\S]*$/, '').trim();
        if (jaTitle) return jaTitle;
      }
    }
  }
  return '';
}

function _splitTitleForUI(title) {
  var m = title.match(/^(.+?)（([^）]+)）\s*$/);
  if (!m) return { cn: title, en: '', sub: '', name: '', year: '' };
  var cn = m[1].trim();
  var paren = m[2].trim();
  var parts = paren.split(/[，,；;]/).map(function(p) { return p.trim(); }).filter(Boolean);

  var yearRe = /^\d{4}s?(?:\s*[\/\-]\s*\d{0,4}s?)?-?$/;
  if (parts.length === 3 && yearRe.test(parts[2])) {
    return { cn: cn, en: parts[0], sub: parts[1] + '，' + parts[2], name: parts[1], year: parts[2] };
  }
  if (parts.length === 2 && yearRe.test(parts[1])) {
    if (_isNameSeg(parts[0])) {
      return { cn: cn, en: '', sub: paren, name: parts[0], year: parts[1] };
    }
    return { cn: cn, en: parts[0], sub: parts[1], name: '', year: parts[1] };
  }
  if (parts.length === 2 && !yearRe.test(parts[1]) && _isNameSeg(parts[1])) {
    return { cn: cn, en: parts[0], sub: parts[1], name: parts[1], year: '' };
  }

  var subParts = [];
  var i = parts.length - 1;
  while (i >= 0 && _isNameSeg(parts[i])) { subParts.unshift(parts[i]); i--; }
  var enParts = [];
  for (var j = 0; j <= i; j++) enParts.push(parts[j]);
  var year = '', nameParts = [];
  for (var k = 0; k < subParts.length; k++) {
    if (yearRe.test(subParts[k])) { year = subParts[k]; }
    else { nameParts.push(subParts[k]); }
  }
  return { cn: cn, en: enParts.join('，'), sub: subParts.join('，'), name: nameParts.join(' & '), year: year };
}

function _titleHtml(title, accent, defaultSub, scholarName, jpName) {
  var s = _splitTitleForUI(title);
  var html = s.cn;
  var name;
  var year = s.year;
  if (scholarName === null) {
    name = '';
  } else if (scholarName) {
    name = scholarName;
  } else {
    name = s.name;
    if (!name && defaultSub) {
      name = defaultSub.replace(/[，,]\s*\d{4}(?:\s*[\/\-]\s*\d{4})?\s*$/, '').trim();
      var ym = defaultSub.match(/(\d{4}(?:\s*[\/\-]\s*\d{4})?)\s*$/);
      if (ym) year = ym[1];
    }
  }
  if (name) {
    var scholars = name.split(/\s*[·&]\s*/);
    scholars.forEach(function(sn) {
      sn = sn.trim();
      if (!sn) return;
      var sk = findScholarKey(sn);
      if (sk) {
        html += ' <span class="scholar-meta clickable" onclick="event.stopPropagation();showScholar(\'' + sk + '\')">' + sn + '</span>';
      } else {
        html += ' <span class="scholar-meta">' + sn + '</span>';
      }
    });
    if (year) {
      var shortYear = year.replace(/(\d{4})(s?)/g, function(m, y, s) {
        if (y.indexOf('19') === 0) return '\'' + y.slice(2) + s;
        return y + s;
      });
      html += '<span class="year-b">' + shortYear + '</span>';
    }
  }
  if (jpName) {
    html += '<span class="kp-sub-ja">' + jpName + '</span>';
  }
  if (s.en) {
    html += '<span class="kp-sub-en">' + s.en + '</span>';
  }
  return html;
}

// ---- 日语/中文切换 ----
function toggleJaLang(id, btn) {
  var el = document.getElementById(id);
  if (!el) return;
  var cnKey = el.getAttribute('data-cn-key');
  if (!cnKey || typeof DATA_JA === 'undefined' || !DATA_JA[cnKey]) return;
  var body = el.querySelector('.cn-body');
  var titleEl = el.querySelector('.cn-title');
  if (!body || !titleEl) return;
  var accent = el.style.getPropertyValue('--accent') || '#8a7a6a';

  var openGroups = [];
  body.querySelectorAll('.body-group').forEach(function(g, i) {
    if (g.classList.contains('open')) openGroups.push(i);
  });

  var panelCn = null;
  if (id === 'kp-panel-mirror') {
    var panelHeader = document.querySelector('#kp-detail-panel .kp-panel-header');
    if (panelHeader) panelCn = panelHeader.querySelector('.kp-panel-cn');
  }

  if (_jaSwapCache[id]) {
    titleEl.innerHTML = _jaSwapCache[id].title;
    body.innerHTML = _jaSwapCache[id].body;
    if (panelCn && _jaSwapCache[id].panelCn != null) {
      panelCn.textContent = _jaSwapCache[id].panelCn;
    }
    delete _jaSwapCache[id];
    btn.classList.remove('active');
    btn.querySelector('span').textContent = '日本語';
    btn.style.removeProperty('background');
    btn.style.removeProperty('color');
    btn.style.opacity = '0.65';
  } else {
    _jaSwapCache[id] = {
      title: titleEl.innerHTML,
      body: body.innerHTML,
      panelCn: panelCn ? panelCn.textContent : null
    };
    var jaStr = DATA_JA[cnKey];
    var sm = jaStr.match(/^<strong>([\s\S]*?)<\/strong>([\s\S]*)/);
    if (!sm) return;
    var jaTitle = sm[1];
    var jaBody = sm[2].replace(/^——/, '').replace(/^—/, '').trim();
    titleEl.innerHTML = _titleHtml(jaTitle, accent);
    if (panelCn) {
      var jaParsed = _splitTitleForUI(jaTitle);
      panelCn.textContent = jaParsed.cn || jaTitle;
    }
    var jaBodyHtml = _formatBody(jaBody, accent);
    var quizBtn = body.querySelector('div[style*="text-align:right"]');
    var quizHtml = quizBtn ? quizBtn.outerHTML : '';
    body.innerHTML = jaBodyHtml + quizHtml;
    btn.classList.add('active');
    btn.querySelector('span').textContent = '中文';
    btn.style.setProperty('background', accent, 'important');
    btn.style.setProperty('color', '#fff', 'important');
    btn.style.setProperty('border-color', accent, 'important');
    btn.style.setProperty('opacity', '1', 'important');
  }

  body.querySelectorAll('.body-group').forEach(function(g, i) {
    if (openGroups.indexOf(i) >= 0) g.classList.add('open');
  });
}

function findKey(label) {
  var clean = label.replace(/（.*?）/g, "").replace(/\(.*?\)/g, "").trim();
  if (!clean) return null;
  if (NAME_TO_KEY[clean] && DATA[NAME_TO_KEY[clean]]) return NAME_TO_KEY[clean];
  for (var name in NAME_TO_KEY) {
    if (!DATA[NAME_TO_KEY[name]]) continue;
    if (clean.indexOf(name) !== -1 || name.indexOf(clean) !== -1) return NAME_TO_KEY[name];
  }
  var best = null, bestLen = 0;
  for (var k in DATA) {
    var d = DATA[k];
    if (!d) continue;
    ['title', 'en', 'ja'].forEach(function(f) {
      var v = d[f];
      if (!v) return;
      if (clean === v && v.length > bestLen) { best = k; bestLen = v.length; return; }
      if (clean.indexOf(v) !== -1 && v.length >= 2 && v.length > bestLen) { best = k; bestLen = v.length; return; }
      if (v.indexOf(clean) !== -1 && clean.length >= 2 && clean.length > bestLen) { best = k; bestLen = clean.length; return; }
    });
    if (k === clean && k.length > bestLen) { best = k; bestLen = k.length; }
  }
  return best;
}

function findScholarKey(label) {
  if (!label) return null;
  var best = null, bestLen = 0;
  for (var name in SCHOLAR_NAME_MAP) {
    if (label.indexOf(name) !== -1 && name.length > bestLen) {
      best = SCHOLAR_NAME_MAP[name];
      bestLen = name.length;
    }
  }
  if (best) return best;
  for (var k in SCHOLARS) {
    var s = SCHOLARS[k];
    if (!s) continue;
    if (s.name && label.indexOf(s.name) !== -1 && s.name.length > bestLen) {
      best = k; bestLen = s.name.length;
    }
    if (s.en && label.indexOf(s.en) !== -1 && s.en.length > bestLen) {
      best = k; bestLen = s.en.length;
    }
    if (s.en) {
      var enParts = s.en.replace(/\s+(Sr\.|Jr\.|III|II|IV|Ph\.D\.)$/i, '').split(/\s+/);
      var lastName = enParts[enParts.length - 1] || '';
      if (lastName.length >= 3 && label.indexOf(lastName) !== -1 && lastName.length > bestLen) {
        best = k; bestLen = lastName.length;
      }
    }
    if (s.name) {
      var idx = s.name.lastIndexOf('\u00B7');
      if (idx >= 0) {
        var cnLast = s.name.slice(idx + 1);
        if (cnLast.length >= 2 && label.indexOf(cnLast) !== -1 && cnLast.length > bestLen) {
          best = k; bestLen = cnLast.length;
        }
      }
    }
  }
  return best;
}

// KP 中文标题 → DATA_JA 索引 key（去掉结尾的括号注释）
function _kpJaKey(title) {
  return (title || '').replace(/([（(][^）)]+[）)][\s]*)+$/, '').trim();
}

// 翻译状态跟踪：KP id → 'pending'/'ok'/'fail'
window._kpTranslationStatus = window._kpTranslationStatus || {};

// KP 保存后异步调用 Worker 翻译 → 成功后合并到 DATA_JA
function _autoTranslateKp(entry) {
  if (!entry || !entry.id || !entry.title || !entry.body) return;
  window._kpTranslationStatus[entry.id] = 'pending';
  _deltaFetch('/delta/kp/translate', {
    id: entry.id,
    title: entry.title,
    body: entry.body
  }).then(function(res) {
    if (res && res.success && res.jaKey && res.ja) {
      if (typeof DATA_JA !== 'undefined') DATA_JA[res.jaKey] = res.ja;
      window._kpTranslationStatus[entry.id] = 'ok';
      console.log('[翻译] ' + entry.title + ' → ' + (res.jaTitle || ''));
    } else {
      window._kpTranslationStatus[entry.id] = 'fail';
      console.warn('[翻译失败] ' + entry.title + ':', res && res.error);
    }
  }).catch(function(err) {
    window._kpTranslationStatus[entry.id] = 'fail';
    console.warn('[翻译网络错误] ' + entry.title + ':', err);
  });
}

function _deltaFetch(path, body) {
  return fetch(QUIZ_WORKER_URL + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + QUIZ_AUTH_TOKEN },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) { return r.json(); });
}

// Delta merge: fetch KV additions/deletions and merge into memory
(function() {
  var loadEl = document.createElement('div');
  loadEl.id = 'delta-loading';
  loadEl.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:999;background:rgba(0,0,0,.7);color:white;padding:8px 20px;border-radius:20px;font-size:12px;pointer-events:none;transition:opacity .3s';
  loadEl.textContent = '同步数据中...';
  document.body.appendChild(loadEl);

  window._deltaReady = fetch(QUIZ_WORKER_URL + '/delta', {
    headers: { 'Authorization': 'Bearer ' + QUIZ_AUTH_TOKEN }
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (!d) return;
    if (d.school) {
      (d.school.deleted || []).forEach(function(k) { delete DATA[k]; });
      var added = d.school.added || {};
      Object.keys(added).forEach(function(k) { if (!DATA[k]) DATA[k] = added[k]; });
    }
    if (d.scholar) {
      (d.scholar.deleted || []).forEach(function(k) { delete SCHOLARS[k]; });
      var sa = d.scholar.added || {};
      Object.keys(sa).forEach(function(k) { if (!SCHOLARS[k]) SCHOLARS[k] = sa[k]; });
    }
    if (d.kp) {
      var delSet = {};
      (d.kp.deleted || []).forEach(function(id) { delSet[id] = true; });
      if (Object.keys(delSet).length) {
        KNOWLEDGE = KNOWLEDGE.filter(function(k) { return !delSet[k.id]; });
        Object.keys(delSet).forEach(function(id) { delete KNOWLEDGE_MAP[id]; });
      }
      (d.kp.added || []).forEach(function(entry) {
        if (!KNOWLEDGE_MAP[entry.id]) {
          KNOWLEDGE.push(entry);
          KNOWLEDGE_MAP[entry.id] = entry;
        }
      });
      if (d.kp.ja && typeof DATA_JA !== 'undefined') {
        Object.keys(d.kp.ja).forEach(function(k) {
          DATA_JA[k] = d.kp.ja[k];
        });
      }
    }
    if (d.order) window._deltaOrder = d.order;
    window._deltaLoaded = true;
    if (typeof renderHomeGrid === 'function') renderHomeGrid();
    if (typeof renderScholarCards === 'function') renderScholarCards();
    if (typeof updateTabCounts === 'function') updateTabCounts();
    if (typeof _applyScholarFilter === 'function') _applyScholarFilter();
  })
  .catch(function() { window._deltaLoaded = true; })
  .finally(function() {
    var el = document.getElementById('delta-loading');
    if (el) { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 300); }
  });
})();
