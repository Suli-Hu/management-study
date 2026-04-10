// Knowledge Base for Quiz Question Generation
// Extracted from 41 PDFs covering 経営学・マーケティング・戦略論
// Auto-generated - Do not edit manually

export const KNOWLEDGE_BASE = {

  // ============================================================
  // GROUP 1: 経営/組織行動 (13 topics)
  // ============================================================

  "経営史": {
    theories: [
      { name: "科学的管理法", scholar: "Taylor", year: 1911, core_point: "課業管理・時間研究・差別的出来高給制度・機能別職長制。人間を経済人モデルで捉える" },
      { name: "管理過程論", scholar: "Fayol", year: 1916, core_point: "管理機能POCCC（計画・組織・命令・調整・統制）、14の管理原則（分業・権限責任一致・命令一元性など）" },
      { name: "官僚制", scholar: "Weber", year: "1920s", core_point: "合理的・合法的権威に基づく。規則主義・文書主義・専門化。逆機能（形式主義・セクショナリズム）が問題に" },
      { name: "人間関係論/ホーソン実験", scholar: "Mayo", year: "1927-1932", core_point: "4実験（照明・リレー組立・面接・バンク配線）。非公式組織の発見、社会人モデルの提唱" },
      { name: "協働システム理論", scholar: "Barnard", year: 1938, core_point: "組織の3要素（共通目的・貢献意欲・コミュニケーション）、組織均衡論、権限受容説、無関心圏" },
      { name: "意思決定論", scholar: "Simon", year: 1947, core_point: "限定合理性、満足化原理、IDCモデル（情報→設計→選択）、経営人モデル" },
      { name: "コンティンジェンシー理論", scholar: "Burns & Stalker", year: 1961, core_point: "環境に応じて最適な組織は異なる。安定環境→機械的組織、不安定環境→有機的組織" },
      { name: "制度的同型化", scholar: "DiMaggio & Powell", year: 1983, core_point: "3つの同型化圧力：強制的（法律等）・模倣的（不確実性下の模倣）・規範的（専門職化）" }
    ],
    terms: {
      "POCCC": "Fayolの管理機能：Planning, Organizing, Commanding, Coordinating, Controlling",
      "経済人モデル": "人間は経済的利益で動くという仮定（Taylor）",
      "社会人モデル": "人間は社会的欲求で動くという仮定（Mayo）",
      "経営人モデル": "限定合理性のもと満足化を行う（Simon）",
      "無関心圏": "Barnard。部下が無条件に受け入れる命令の範囲",
      "権限受容説": "Barnard。権限は上からではなく部下の受容によって成立する",
      "IDCモデル": "Simon。情報活動(Intelligence)→設計活動(Design)→選択活動(Choice)"
    },
    exam_points: [
      "Taylorの科学的管理法は『経済人モデル』、Mayoの人間関係論は『社会人モデル』、Simonは『経営人モデル』の区別",
      "Barnardの組織3要素（共通目的・貢献意欲・コミュニケーション）は頻出",
      "Fayolの14原則と管理機能POCCCの区別",
      "Weberの官僚制の特徴と逆機能（Merton）の区別",
      "Burns&Stalkerの機械的vs有機的組織の対比",
      "ホーソン実験の4段階とそれぞれの発見内容"
    ],
    confusions: [
      { pair: ["Taylor", "Fayol"], clarification: "Taylorは作業現場の効率化（科学的管理法）、Fayolは経営全体の管理過程（POCCC）。Taylorはボトムアップ、Fayolはトップダウン" },
      { pair: ["経済人モデル", "社会人モデル", "経営人モデル"], clarification: "経済人=Taylor（金銭動機）、社会人=Mayo（社会的欲求）、経営人=Simon（限定合理性・満足化）" },
      { pair: ["権限受容説", "無関心圏"], clarification: "両方Barnard。権限受容説は権限の成立条件、無関心圏はその受容が自動的に行われる範囲" },
      { pair: ["機械的組織", "有機的組織"], clarification: "機械的=安定環境・集権的・公式的、有機的=不安定環境・分権的・柔軟" }
    ]
  },

  "モチベーション": {
    theories: [
      { name: "欲求階層理論", scholar: "Maslow", year: 1943, core_point: "5段階（生理→安全→社会→尊厳→自己実現）。低次=欠乏欲求、最上位=成長欲求" },
      { name: "ERG理論", scholar: "Alderfer", year: 1969, core_point: "3欲求（Existence・Relatedness・Growth）。同時存在性あり、フラストレーション退行あり" },
      { name: "二要因理論", scholar: "Herzberg", year: 1959, core_point: "動機づけ要因（達成・承認・仕事内容）と衛生要因（給与・作業条件・対人関係）は独立。給与は衛生要因" },
      { name: "X理論Y理論", scholar: "McGregor", year: 1960, core_point: "X理論=性悪説的人間観（統制）、Y理論=性善説的人間観（自律・MBO）" },
      { name: "達成動機説", scholar: "McClelland", year: 1961, core_point: "3つの社会的欲求：達成欲求(nAch)・権力欲求(nPow)・親和欲求(nAff)" },
      { name: "未成熟成熟理論", scholar: "Argyris", year: 1957, core_point: "人間は未成熟→成熟へ7つの次元で発達。公式組織が成熟を阻害" },
      { name: "期待理論", scholar: "Vroom", year: 1964, core_point: "M=V(誘意性)×E(期待)。Porter&Lawlerが努力→業績→報酬→満足へ発展" },
      { name: "公平理論", scholar: "Adams", year: 1963, core_point: "自分のインプット/アウトカム比を他者と比較し不公平感で動機が変化" },
      { name: "目標設定理論", scholar: "Locke & Latham", year: 1984, core_point: "困難で明確な目標が高い成果を生む。目標受容とフィードバックが重要" },
      { name: "強化理論", scholar: "Skinner", year: null, core_point: "正の強化・負の強化（望ましい行動を増やす）、正の罰・負の罰（望ましくない行動を減らす）" },
      { name: "自己決定理論", scholar: "Deci & Ryan", year: 1985, core_point: "動機づけの6段階（無動機→外的→取入れ→同一視→統合→内発的）。3基本欲求：自律性・有能感・関係性" },
      { name: "職務特性モデル", scholar: "Hackman & Oldham", year: 1976, core_point: "5中核特性（技能多様性・課題完結性・課題重要性・自律性・フィードバック）→3心理状態→MPS算出" }
    ],
    terms: {
      "内容理論": "何がモチベーションを生むか（Maslow, Herzberg, McClelland, Alderfer等）",
      "過程理論": "どのようにモチベーションが生じるか（Vroom, Adams, Locke等）",
      "アンダーマイニング効果": "外的報酬が内発的動機づけを低下させる現象",
      "エンハンシング効果": "言語的報酬（称賛）が内発的動機づけを高める現象",
      "MPS": "Motivating Potential Score = [(技能多様性+課題完結性+課題重要性)/3]×自律性×フィードバック",
      "フラストレーション退行": "ERG理論。上位欲求が満たされないと下位欲求に退行する"
    },
    exam_points: [
      "Herzbergの二要因理論で『給与は衛生要因』は超頻出。動機づけ要因と混同しやすい",
      "内容理論vs過程理論の分類を正確に覚える",
      "MaslowとAlderferの対応関係（5段階→3段階）と違い（同時存在性・退行）",
      "Vroomの期待理論の公式M=V×E",
      "職務特性モデルのMPS計算式（加算部分と乗算部分の区別）",
      "アンダーマイニング効果vsエンハンシング効果の区別"
    ],
    confusions: [
      { pair: ["動機づけ要因", "衛生要因"], clarification: "動機づけ要因=あると満足（達成・承認）、衛生要因=ないと不満足（給与・環境）。両者は独立した次元" },
      { pair: ["Maslow", "Alderfer"], clarification: "Maslowは5段階・逐次的、Alderferは3段階・同時存在可・退行あり" },
      { pair: ["内容理論", "過程理論"], clarification: "内容=What（Maslow,Herzberg,McClelland）、過程=How（Vroom,Adams,Locke）" },
      { pair: ["正の強化", "負の強化"], clarification: "正の強化=報酬を与えて行動増加、負の強化=嫌悪刺激を除去して行動増加。どちらも行動を増やす" },
      { pair: ["X理論", "Y理論"], clarification: "X=怠惰な人間観→統制的管理、Y=自律的人間観→参加的管理・MBO" }
    ]
  },

  "リーダーシップ": {
    theories: [
      { name: "ミシガン研究", scholar: "Likert等", year: "1950s", core_point: "従業員志向vs生産志向。従業員志向リーダーの方が高い生産性" },
      { name: "オハイオ研究", scholar: "Stogdill等", year: "1950s", core_point: "構造づくり(Initiating Structure)vs配慮(Consideration)の2軸。Hi-Hi型が理想" },
      { name: "システム4", scholar: "Likert", year: "1960s", core_point: "S1独善的専制→S2温情的専制→S3相談的→S4参加的。連結ピン機能" },
      { name: "マネジリアル・グリッド", scholar: "Blake & Mouton", year: 1964, core_point: "人への関心×業績への関心の9×9。1-1放任/1-9カントリークラブ/9-1権威服従/5-5中庸/9-9チーム型が理想" },
      { name: "PM理論", scholar: "三隅二不二", year: 1966, core_point: "P機能(Performance)とM機能(Maintenance)。有効性：PM>Pm>pM>pm" },
      { name: "SL理論", scholar: "Hersey & Blanchard", year: 1977, core_point: "部下の成熟度に応じてスタイルを変える。S1指示→S2説得→S3参加→S4委任" },
      { name: "パス・ゴール理論", scholar: "House", year: 1971, core_point: "指示型・支持型・参加型・達成志向型の4類型。部下の特性と環境要因に応じて使い分け" },
      { name: "サーバント・リーダーシップ", scholar: "Greenleaf", year: 1970, core_point: "まず奉仕し、その後リードする。傾聴・共感・癒し・気づきなど10特性" },
      { name: "オーセンティック・リーダーシップ", scholar: "George", year: 2003, core_point: "自己認識・内在的モラル・バランスの取れた情報処理・関係の透明性の4特性" },
      { name: "シェアド・リーダーシップ", scholar: null, year: null, core_point: "VUCA時代に対応。リーダーシップを特定個人でなくチーム全体で共有する" }
    ],
    terms: {
      "連結ピン": "Likert。上位集団と下位集団をつなぐ中間管理者の役割",
      "Hi-Hi型": "オハイオ研究で構造づくり・配慮の両方が高いリーダー",
      "VUCA": "Volatility・Uncertainty・Complexity・Ambiguity。変動性の高い環境"
    },
    exam_points: [
      "特性論→行動論→状況適合論→新しいリーダーシップ論の発展順序",
      "PM理論の有効性順序：PM>Pm>pM>pm",
      "SL理論の4段階と部下の成熟度の対応",
      "マネジリアル・グリッドの5つの類型と座標位置",
      "サーバント・リーダーシップの10特性"
    ],
    confusions: [
      { pair: ["ミシガン研究", "オハイオ研究"], clarification: "ミシガン=1次元（従業員vs生産）、オハイオ=2次元独立（構造づくり×配慮）" },
      { pair: ["PM理論", "マネジリアル・グリッド"], clarification: "PM=日本発・2分類（P/M各大小）、グリッド=米国発・9×9の連続尺度" },
      { pair: ["SL理論", "パス・ゴール理論"], clarification: "SL=部下の成熟度で使い分け、パスゴール=部下特性+環境要因で使い分け" },
      { pair: ["サーバント", "オーセンティック"], clarification: "サーバント=奉仕→リード（Greenleaf）、オーセンティック=自分らしさ・真正性（George）" }
    ]
  },

  "組織デザインと組織文化": {
    theories: [
      { name: "職能別組織", scholar: null, year: null, core_point: "機能（製造・販売・財務等）で部門化。専門性高いが部門間調整が困難" },
      { name: "事業部制組織", scholar: "Sloan/GM", year: "1920s", core_point: "製品・地域等で自律的部門化。利益責任明確だがセクショナリズムのリスク" },
      { name: "マトリックス組織", scholar: null, year: null, core_point: "職能×事業の二重構造。ツー・ボス・システム。柔軟だが権限あいまい" },
      { name: "カンパニー制", scholar: null, year: null, core_point: "事業部制の発展形。各カンパニーが独立した会社のように運営。擬似的な分社化" },
      { name: "SBU", scholar: null, year: null, core_point: "Strategic Business Unit。戦略的に独立した事業単位" },
      { name: "ネットワーク型組織", scholar: null, year: null, core_point: "階層を持たずフラットなネットワークで結合。柔軟性が高い" }
    ],
    terms: {
      "ツー・ボス・システム": "マトリックス組織で2人の上司を持つ仕組み",
      "スパン・オブ・コントロール": "1人の管理者が直接管理できる部下の数",
      "集権化": "意思決定権限が上位に集中",
      "分権化": "意思決定権限が下位に移譲",
      "エンパワーメント": "権限委譲により従業員の自律性を高める",
      "純粋持株会社": "自ら事業を行わず傘下企業の株式保有のみ",
      "事業持株会社": "自ら事業も行いつつ傘下企業の株式も保有",
      "組織文化": "Scheinの3レベル（人工物→価値観→基本的仮定）"
    },
    exam_points: [
      "職能別→事業部制→マトリックス→カンパニー制の発展順と各特徴",
      "各組織形態のメリット・デメリットの比較",
      "純粋持株会社vs事業持株会社の区別",
      "マトリックス組織のツー・ボス・システムの問題点"
    ],
    confusions: [
      { pair: ["事業部制", "カンパニー制"], clarification: "事業部制=本社の下の部門、カンパニー制=擬似的に独立会社として運営。カンパニー制の方が自律性が高い" },
      { pair: ["職能別組織", "事業部制組織"], clarification: "職能別=機能で分類（製造部等）、事業部制=製品・地域で分類（A事業部等）" },
      { pair: ["集権化", "分権化"], clarification: "集権=トップに権限集中（職能別に多い）、分権=現場に権限移譲（事業部制に多い）" }
    ]
  },

  "日本的経営": {
    theories: [
      { name: "三種の神器", scholar: "Abegglen", year: 1958, core_point: "終身雇用・年功序列・企業別労働組合。日本企業の特徴的慣行" },
      { name: "新卒一括採用", scholar: null, year: null, core_point: "毎年4月に新卒者を一括採用する日本独自の制度" },
      { name: "春闘", scholar: null, year: null, core_point: "毎年春に行われる賃金交渉。産業別ではなく企業別で交渉" }
    ],
    terms: {
      "終身雇用": "定年まで同一企業で雇用される慣行。正社員が対象",
      "年功序列": "勤続年数に応じて賃金・地位が上昇する制度",
      "企業別労働組合": "企業ごとに組織される労働組合。産業別組合と対比"
    },
    exam_points: [
      "三種の神器の提唱者はAbegglen（1958）",
      "日本的経営の3つの慣行とそれぞれの変化・課題",
      "企業別組合は日本独自（欧米は産業別・職種別が主流）"
    ],
    confusions: [
      { pair: ["企業別労働組合", "産業別労働組合"], clarification: "企業別=日本の特徴、産業別=欧米の主流。企業別は労使協調的" }
    ]
  },

  "人的資源管理": {
    theories: [
      { name: "SHRM", scholar: null, year: null, core_point: "戦略的人的資源管理。3機能：作業能率の向上・組織統合・変化適応" },
      { name: "組織コミットメント3次元", scholar: "Allen & Meyer", year: 1990, core_point: "感情的（愛着）・継続的（コスト計算）・規範的（義務感）の3タイプ" },
      { name: "組織市民行動(OCB)", scholar: "Organ", year: 1988, core_point: "職務記述書に含まれない自発的な貢献行動" },
      { name: "キャリア・アンカー", scholar: "Schein", year: null, core_point: "個人のキャリア上の自己概念。8つのアンカー（専門能力・管理能力・自律等）" },
      { name: "リンゲルマン効果", scholar: "Ringelmann", year: null, core_point: "集団サイズが大きくなると1人あたりの努力が低下する社会的手抜き現象" }
    ],
    terms: {
      "組織志向型HRM": "内部労働市場重視。長期雇用・社内育成。日本企業に多い",
      "市場志向型HRM": "外部労働市場重視。即戦力採用・流動性高い。欧米企業に多い",
      "OJT": "On-the-Job Training。職場内訓練",
      "Off-JT": "Off-the-Job Training。職場外訓練（研修等）"
    },
    exam_points: [
      "Allen&Meyerの組織コミットメント3次元の区別（特に感情的vs継続的）",
      "OCBの定義と具体例",
      "組織志向型vs市場志向型HRMの特徴比較"
    ],
    confusions: [
      { pair: ["感情的コミットメント", "継続的コミットメント"], clarification: "感情的=組織への愛着で残る、継続的=辞めるコストが高いから残る（打算的）" },
      { pair: ["OCB", "職務行動"], clarification: "OCB=職務記述書外の自発的行動、職務行動=公式に求められる行動" }
    ]
  },

  "企業論と経営者論": {
    theories: [
      { name: "所有と経営の分離", scholar: "Berle & Means", year: 1932, core_point: "株式の分散により所有者（株主）と経営者が分離。経営者支配の問題" },
      { name: "企業者論/イノベーション", scholar: "Schumpeter", year: 1912, core_point: "新結合（イノベーション）5類型：新製品・新生産方法・新市場・新原材料・新組織" },
      { name: "エージェンシー理論", scholar: "Jensen & Meckling", year: 1976, core_point: "プリンシパル（株主）とエージェント（経営者）間の利害不一致。エージェンシー・コスト" },
      { name: "スチュワードシップ理論", scholar: "Davis et al.", year: 1997, core_point: "経営者は利己的でなく組織のために働くスチュワード（執事）として行動する" },
      { name: "ステークホルダー理論", scholar: "Freeman", year: 1984, core_point: "企業は株主だけでなく全てのステークホルダーの利益を考慮すべき" }
    ],
    terms: {
      "経営者支配": "株式分散により経営者が実質的に企業を支配する状態",
      "エージェンシー・コスト": "モニタリング費用＋ボンディング費用＋残余損失",
      "新結合": "Schumpeterのイノベーション概念の原語（neue Kombination）",
      "創造的破壊": "Schumpeter。イノベーションによる既存秩序の破壊と新秩序の創造"
    },
    exam_points: [
      "Schumpeterのイノベーション5類型は頻出",
      "エージェンシー理論vsスチュワードシップ理論の対比",
      "所有と経営の分離の意味と問題点"
    ],
    confusions: [
      { pair: ["エージェンシー理論", "スチュワードシップ理論"], clarification: "エージェンシー=経営者は利己的（監視が必要）、スチュワードシップ=経営者は組織のために働く（信頼ベース）" },
      { pair: ["イノベーション5類型", "イノベーションのジレンマ"], clarification: "5類型=Schumpeter（何がイノベーションか）、ジレンマ=Christensen（既存企業が破壊的革新に対応できない理由）" }
    ]
  },

  "コーポレートガバナンスとCSR": {
    theories: [
      { name: "監査役設置会社", scholar: null, year: null, core_point: "取締役会＋監査役（会）。日本の伝統的な機関設計" },
      { name: "委員会設置会社", scholar: null, year: null, core_point: "指名委員会・監査委員会・報酬委員会を設置。社外取締役が過半数" },
      { name: "監査等委員会設置会社", scholar: null, year: 2015, core_point: "監査等委員会のみ設置。委員会設置会社の簡易版" }
    ],
    terms: {
      "CSR": "Corporate Social Responsibility。企業の社会的責任",
      "ESG投資": "Environment・Social・Governanceを考慮した投資",
      "コンプライアンス": "法令遵守。広義には倫理・社会規範の遵守も含む",
      "コーポレートガバナンス": "企業統治。経営者を規律づける仕組み",
      "スチュワードシップ・コード": "機関投資家の行動規範",
      "コーポレートガバナンス・コード": "上場企業の統治指針"
    },
    exam_points: [
      "3つの機関設計の違いと特徴",
      "CSRとコンプライアンスの関係",
      "ESGの3要素"
    ],
    confusions: [
      { pair: ["監査役設置会社", "委員会設置会社"], clarification: "監査役設置=監査役が独立監査、委員会設置=3委員会（指名・監査・報酬）で社外取締役が主導" },
      { pair: ["CSR", "CSV"], clarification: "CSR=社会的責任の遂行、CSV(Porter)=共有価値の創造（社会課題解決と経済的利益の両立）" }
    ]
  },

  "意思決定論": {
    theories: [
      { name: "限定合理性/満足化原理", scholar: "Simon", year: 1947, core_point: "人間の認知能力に限界あり。最適解でなく満足解を選択する" },
      { name: "ゴミ箱モデル", scholar: "Cohen, March & Olsen", year: 1972, core_point: "4つの流れ（問題・解・参加者・選択機会）が偶然結びつく。組織化された無秩序の3特性" },
      { name: "行動的意思決定論", scholar: "Cyert & March", year: 1963, core_point: "組織は連合体。準解決・不確実性回避・問題中心探索・組織学習の4概念" },
      { name: "グループシンク", scholar: "Janis", year: 1972, core_point: "集団浅慮。凝集性の高い集団で批判的思考が抑制され劣悪な意思決定に至る" },
      { name: "プロスペクト理論", scholar: "Kahneman & Tversky", year: 1979, core_point: "損失回避性（損失は同額の利得より大きく感じる）、参照点依存、確率加重関数" }
    ],
    terms: {
      "組織化された無秩序": "ゴミ箱モデルの前提。曖昧な選好・不明確な技術・流動的参加",
      "IDCモデル": "Simon。Intelligence→Design→Choiceの意思決定プロセス",
      "ヒューリスティック": "直感的・経験的な意思決定の近道。バイアスの原因にもなる",
      "アンカリング": "最初に提示された情報に引きずられるバイアス"
    },
    exam_points: [
      "ゴミ箱モデルの4つの流れと組織化された無秩序の3特性",
      "Simonの限定合理性と満足化原理の関係",
      "グループシンクの発生条件と防止策",
      "プロスペクト理論の損失回避性"
    ],
    confusions: [
      { pair: ["Simon", "Cyert & March"], clarification: "Simon=個人の限定合理性、Cyert&March=組織レベルの行動的意思決定" },
      { pair: ["ゴミ箱モデル", "合理的意思決定"], clarification: "合理的=目的→手段の論理的プロセス、ゴミ箱=問題・解・参加者が偶然結合" },
      { pair: ["グループシンク", "リスキーシフト"], clarification: "グループシンク=集団の同調圧力で批判抑制、リスキーシフト=集団討議後により危険な選択へ移行" }
    ]
  },

  "組織学習": {
    theories: [
      { name: "シングルループ/ダブルループ学習", scholar: "Argyris & Schon", year: 1978, core_point: "シングル=既存の枠組み内での修正、ダブル=前提や価値観自体を見直す" },
      { name: "学習する組織", scholar: "Senge", year: 1990, core_point: "5つのディシプリン：システム思考・自己マスタリー・メンタルモデル・共有ビジョン・チーム学習" },
      { name: "SECIモデル", scholar: "Nonaka & Takeuchi", year: 1995, core_point: "暗黙知⇔形式知の変換。共同化(S)→表出化(E)→結合化(C)→内面化(I)のスパイラル" },
      { name: "組織ルーティン", scholar: "Nelson & Winter", year: 1982, core_point: "組織の記憶としてのルーティン。進化経済学的アプローチ" },
      { name: "探索vs深化/両利きの経営", scholar: "March", year: 1991, core_point: "探索(Exploration)=新しい可能性の追求、深化(Exploitation)=既存知識の活用。両方のバランスが重要" }
    ],
    terms: {
      "暗黙知": "言語化困難な経験的知識（ノウハウ・勘等）",
      "形式知": "言語・数式等で表現可能な知識（マニュアル等）",
      "共同化": "SECI。暗黙知→暗黙知。共体験による伝達",
      "表出化": "SECI。暗黙知→形式知。比喩・モデル等で言語化",
      "結合化": "SECI。形式知→形式知。体系的に組み合わせ",
      "内面化": "SECI。形式知→暗黙知。実践による体得"
    },
    exam_points: [
      "SECIモデルの4段階と各段階の知識変換の方向",
      "シングルループvsダブルループの違い",
      "Sengeの5つのディシプリン",
      "探索と深化のトレードオフ（両利きの経営）"
    ],
    confusions: [
      { pair: ["シングルループ", "ダブルループ"], clarification: "シングル=枠組み内の改善（サーモスタット的）、ダブル=枠組み自体の変革（なぜそうするかを問い直す）" },
      { pair: ["暗黙知", "形式知"], clarification: "暗黙知=言語化困難・個人的・身体的、形式知=言語化可能・客観的・伝達容易" },
      { pair: ["探索", "深化"], clarification: "探索=新規開拓・リスク高・長期的、深化=既存活用・効率的・短期的" }
    ]
  },

  "コンフリクト・マネジメント": {
    theories: [
      { name: "コンフリクトの3つの理論的立場", scholar: null, year: null, core_point: "伝統的（コンフリクト=悪）→行動科学的（避けられない）→相互作用的（適度に必要）" },
      { name: "コンフリクトの解消スタイル", scholar: "Thomas & Kilmann", year: null, core_point: "競争・協調・妥協・回避・適応の5スタイル（自己主張×協力性の2軸）" },
      { name: "分配型交渉vs統合型交渉", scholar: null, year: null, core_point: "分配型=ゼロサム・Win-Lose、統合型=Win-Win・パイの拡大" }
    ],
    terms: {
      "機能的コンフリクト": "組織にとってプラスに働く建設的な対立",
      "逆機能的コンフリクト": "組織にとってマイナスに働く破壊的な対立",
      "BATNA": "Best Alternative to a Negotiated Agreement。交渉不成立時の最善代替案"
    },
    exam_points: [
      "3つの理論的立場の変遷（特に相互作用的見方が現代的）",
      "分配型vs統合型交渉の違い",
      "Thomas & Kilmannの5スタイル"
    ],
    confusions: [
      { pair: ["分配型交渉", "統合型交渉"], clarification: "分配型=固定パイの奪い合い（Win-Lose）、統合型=パイを拡大して双方利益（Win-Win）" }
    ]
  },

  "組織変革": {
    theories: [
      { name: "レヴィンの3段階モデル", scholar: "Lewin", year: 1947, core_point: "解凍(Unfreezing)→変革(Moving)→再凍結(Refreezing)" },
      { name: "コッターの8段階", scholar: "Kotter", year: 1996, core_point: "危機意識→連帯チーム→ビジョン→周知→障害除去→短期成果→さらなる変革→文化定着" },
      { name: "BPR", scholar: "Hammer", year: "1990s", core_point: "Business Process Reengineering。業務プロセスの抜本的再設計" },
      { name: "断続的変革vs継続的変革", scholar: null, year: null, core_point: "断続的=大規模・トップダウン・計画的、継続的=漸進的・ボトムアップ・創発的" }
    ],
    terms: {
      "解凍": "Lewin。変革に向けて現状への不満を喚起し変革の準備をする段階",
      "再凍結": "Lewin。変革後の新しい状態を安定化・定着させる段階",
      "変革エージェント": "変革を推進する役割を担う人物"
    },
    exam_points: [
      "レヴィンの3段階の順序と各段階の意味",
      "コッターの8段階の順序（特に最初の4段階）",
      "BPRの特徴（漸進的改善ではなく抜本的再設計）"
    ],
    confusions: [
      { pair: ["レヴィンの3段階", "コッターの8段階"], clarification: "レヴィン=シンプルな3段階、コッター=より具体的な8段階の実践プロセス。コッターはレヴィンを発展させたもの" },
      { pair: ["BPR", "カイゼン"], clarification: "BPR=抜本的・ゼロベースの再設計、カイゼン=漸進的・継続的改善" }
    ]
  },

  "その他（経営補足概念）": {
    theories: [
      { name: "認知的不協和", scholar: "Festinger", year: 1957, core_point: "矛盾する認知を持つと不快感。態度や行動を変えて解消しようとする" },
      { name: "資源依存理論", scholar: "Pfeffer & Salancik", year: 1978, core_point: "組織は外部資源に依存。依存度を低減するために環境を管理しようとする" },
      { name: "センスメイキング", scholar: "Weick", year: null, core_point: "組織メンバーが出来事に意味を付与するプロセス。回顧的・社会的・進行中" },
      { name: "高低文脈文化", scholar: "Hall", year: null, core_point: "高文脈=暗黙的・日本等、低文脈=明示的・米国等" }
    ],
    terms: {
      "VUCA": "Volatility, Uncertainty, Complexity, Ambiguity",
      "ルースカップリング": "Weick。組織内の要素が緩やかに結合している状態"
    },
    exam_points: [
      "認知的不協和の具体例と解消方法",
      "高文脈vs低文脈文化の違い（日本vsアメリカ）"
    ],
    confusions: [
      { pair: ["資源依存理論", "制度理論"], clarification: "資源依存=外部資源への依存と管理、制度理論=社会的正当性のための同型化" }
    ]
  },

  // ============================================================
  // GROUP 2: マーケティング (13 topics)
  // ============================================================

  "マーケティングの概念": {
    theories: [
      { name: "マーケティング1.0~4.0", scholar: "Kotler", year: null, core_point: "1.0=製品中心、2.0=消費者志向、3.0=価値主導、4.0=自己実現（デジタル）" },
      { name: "AMA定義の変遷", scholar: "AMA", year: "1960-2007", core_point: "1960年=4P中心、1985年=交換概念、2004年=価値創造、2007年=ステークホルダー含む" },
      { name: "マーケティング近視眼", scholar: "Levitt", year: 1960, core_point: "製品でなく顧客ニーズで事業を定義すべき。鉄道は輸送業と捉えるべきだった" },
      { name: "4P", scholar: "McCarthy", year: 1960, core_point: "Product・Price・Place・Promotion。売り手視点のマーケティングミックス" },
      { name: "4C", scholar: "Lauterborn", year: 1993, core_point: "Customer Value・Cost・Convenience・Communication。買い手視点" },
      { name: "ホリスティック・マーケティング", scholar: "Kotler", year: 2002, core_point: "リレーションシップ・統合型・インターナル・社会的責任の4要素を包括" },
      { name: "市場志向", scholar: "Kohli&Jaworski / Narver&Slater", year: null, core_point: "K&J=情報生成・情報普及・反応の3プロセス。N&S=顧客志向・競合志向・部門間調整" },
      { name: "アンゾフの成長マトリクス", scholar: "Ansoff", year: 1957, core_point: "市場×製品の2軸4戦略：市場浸透・新市場開拓・新製品開発・多角化" }
    ],
    terms: {
      "マーケティング・コンセプト": "顧客志向の経営理念。生産→製品→販売→マーケティング→ソサイエタルの変遷",
      "ソサイエタル・マーケティング": "社会的利益も考慮したマーケティング",
      "デマーケティング": "需要を意図的に抑制するマーケティング",
      "リマーケティング": "減退した需要を回復させるマーケティング"
    },
    exam_points: [
      "4Pと4Cの対応関係（Product↔Customer Value等）",
      "マーケティング1.0~4.0の各特徴",
      "Levittのマーケティング近視眼の具体例",
      "AMA定義の変遷（特に2004年と2007年の違い）",
      "アンゾフの4戦略の区別"
    ],
    confusions: [
      { pair: ["4P", "4C"], clarification: "4P=売り手視点（Product/Price/Place/Promotion）、4C=買い手視点（Customer Value/Cost/Convenience/Communication）" },
      { pair: ["Kohli&Jaworski", "Narver&Slater"], clarification: "K&J=プロセスアプローチ（情報の生成・普及・反応）、N&S=文化的アプローチ（顧客志向・競合志向・部門間調整）" },
      { pair: ["市場浸透", "新市場開拓"], clarification: "市場浸透=既存市場×既存製品、新市場開拓=新市場×既存製品" }
    ]
  },

  "消費者行動": {
    theories: [
      { name: "Howard-Shethモデル", scholar: "Howard & Sheth", year: 1969, core_point: "S-O-Rモデル。刺激→有機体内部の心理プロセス→反応" },
      { name: "Bettmanモデル", scholar: "Bettman", year: 1979, core_point: "情報処理アプローチ。消費者は能動的に情報を探索・処理する" },
      { name: "精緻化見込みモデル(ELM)", scholar: "Petty & Cacioppo", year: null, core_point: "中心ルート（論理的処理）vs周辺ルート（手がかりで判断）。関与度で変わる" },
      { name: "購買決定プロセス", scholar: "Kotler", year: null, core_point: "問題認識→情報探索→代替案評価→購買決定→購買後行動の5段階" },
      { name: "イノベーター理論", scholar: "Rogers", year: 1962, core_point: "採用者5分類：イノベーター(2.5%)→アーリーアダプター(13.5%)→アーリーマジョリティ(34%)→レイトマジョリティ(34%)→ラガード(16%)" },
      { name: "消費の外部効果", scholar: "Leibenstein", year: null, core_point: "バンドワゴン効果（皆が買うから）、スノッブ効果（皆が買うから買わない）、ヴェブレン効果（高いから買う）" },
      { name: "衒示的消費", scholar: "Veblen", year: 1899, core_point: "社会的地位を誇示するための消費行動" }
    ],
    terms: {
      "関与度": "消費者がその製品・購買にどれだけ関心を持つか",
      "考慮集合": "購買候補として消費者が検討するブランドの集合",
      "認知的不協和": "購買後に「本当に良かったのか」と不安になる心理状態",
      "準拠集団": "個人の態度や行動に影響を与える集団",
      "キャズム": "Mooreの理論。アーリーアダプターとアーリーマジョリティの間の溝"
    },
    exam_points: [
      "Rogersのイノベーター理論の5分類と各割合",
      "バンドワゴン/スノッブ/ヴェブレン効果の違い",
      "ELMの中心ルートvs周辺ルートと関与度の関係",
      "購買決定プロセス5段階の順序"
    ],
    confusions: [
      { pair: ["バンドワゴン効果", "スノッブ効果"], clarification: "バンドワゴン=他者の購買が増えると自分も購買（同調）、スノッブ=他者の購買が増えると購買しない（差別化）" },
      { pair: ["スノッブ効果", "ヴェブレン効果"], clarification: "スノッブ=他者と異なりたい（希少性重視）、ヴェブレン=高価格自体に価値（顕示的消費）" },
      { pair: ["中心ルート", "周辺ルート"], clarification: "中心=高関与・論理的評価・態度変容持続、周辺=低関与・手がかり（有名人等）・態度変容一時的" }
    ]
  },

  "マーケティング・リサーチ": {
    theories: [
      { name: "4つの測定尺度", scholar: "Stevens", year: null, core_point: "名義尺度→順序尺度→間隔尺度→比例尺度（情報量が増加）" },
      { name: "ラダリング法", scholar: null, year: null, core_point: "属性→機能的便益→心理的便益→価値へと深掘りするインタビュー技法" }
    ],
    terms: {
      "名義尺度": "分類のみ（性別・血液型等）。計算不可",
      "順序尺度": "順位づけ可（満足度ランキング等）。間隔は不均等",
      "間隔尺度": "等間隔（温度等）。絶対零点なし。加減のみ",
      "比例尺度": "絶対零点あり（身長・売上等）。四則演算可能",
      "量的調査": "数量データ。アンケート・実験等。一般化可能",
      "質的調査": "言語データ。インタビュー・観察等。深い理解",
      "確率抽出": "母集団から等確率で抽出。代表性あり",
      "非確率抽出": "便宜的な抽出。代表性に問題あるが実施容易",
      "多変量解析": "回帰分析・因子分析・クラスター分析・コンジョイント分析等"
    },
    exam_points: [
      "4つの測定尺度の序列と各特徴",
      "量的調査vs質的調査の使い分け",
      "確率抽出vs非確率抽出の違い"
    ],
    confusions: [
      { pair: ["間隔尺度", "比例尺度"], clarification: "間隔=絶対零点なし（0度は温度がないわけではない）、比例=絶対零点あり（0円は本当にゼロ）" },
      { pair: ["量的調査", "質的調査"], clarification: "量的=数値化・統計処理・広く浅く、質的=言語化・解釈・狭く深く" }
    ]
  },

  "STP": {
    theories: [
      { name: "STP", scholar: "Kotler", year: null, core_point: "Segmentation（市場細分化）→Targeting（標的市場選定）→Positioning（ポジショニング）" },
      { name: "マス・カスタマイゼーション", scholar: null, year: null, core_point: "大量生産のコスト効率と個別対応を両立する戦略" }
    ],
    terms: {
      "セグメンテーション変数": "地理的・人口統計的・心理的・行動的の4分類",
      "ターゲティング戦略": "無差別型・差別型・集中型",
      "ポジショニング・マップ": "2軸で競合との位置関係を可視化",
      "マスマーケティング": "市場全体を同一として扱うアプローチ",
      "1to1マーケティング": "個々の顧客に合わせた個別対応",
      "カニバリゼーション": "自社製品間の共食い。新製品が既存製品の売上を奪う"
    },
    exam_points: [
      "STPの順序と各段階の意味",
      "セグメンテーション4つの変数の区別",
      "ターゲティング3戦略の違い",
      "カニバリゼーションの意味と事例"
    ],
    confusions: [
      { pair: ["差別型ターゲティング", "集中型ターゲティング"], clarification: "差別型=複数セグメントに異なるミックス、集中型=1つのセグメントに特化" },
      { pair: ["マスマーケティング", "マス・カスタマイゼーション"], clarification: "マスマーケティング=全員に同じ製品、マス・カスタマイゼーション=大量生産+個別対応の両立" }
    ]
  },

  "価格戦略": {
    theories: [
      { name: "3つの価格設定アプローチ", scholar: null, year: null, core_point: "コストベース（原価+利益）、需要ベース（顧客の支払意思額）、競争ベース（競合価格参照）" },
      { name: "スキミング価格", scholar: null, year: null, core_point: "高価格で参入し徐々に下げる。初期に利益回収。イノベーター層狙い" },
      { name: "ペネトレーション価格", scholar: null, year: null, core_point: "低価格で参入しシェア獲得。規模の経済で後に利益確保" }
    ],
    terms: {
      "バンドル価格": "複数製品をセットにして割引価格で提供",
      "キャプティブ価格": "本体を安くし消耗品で利益を得る（プリンター＋インク等）",
      "端数価格": "980円等の端数。心理的に安く感じさせる",
      "威光価格": "高価格にすることで品質・ステータスを訴求",
      "慣習価格": "長期間定着した価格（自動販売機の飲料等）",
      "EDLP": "Every Day Low Price。常時低価格（ウォルマート等）",
      "H-LP": "Hi-Low Pricing。通常は高価格、頻繁にセール",
      "参照価格": "消費者が心の中に持つ基準価格"
    },
    exam_points: [
      "スキミングvsペネトレーションの使い分け条件",
      "EDLPvsH-LPの比較",
      "端数価格・威光価格・慣習価格の区別",
      "キャプティブ価格の具体例"
    ],
    confusions: [
      { pair: ["スキミング", "ペネトレーション"], clarification: "スキミング=高→低（利益先行・差別化製品向き）、ペネトレーション=低→（シェア先行・価格弾力性高い市場向き）" },
      { pair: ["EDLP", "H-LP"], clarification: "EDLP=常時低価格・安定需要、H-LP=通常高+頻繁セール・来店促進効果" },
      { pair: ["端数価格", "威光価格"], clarification: "端数=安さ訴求（980円）、威光=高さで品質訴求（10,000円ちょうど）。真逆の心理効果" }
    ]
  },

  "プロモーション戦略": {
    theories: [
      { name: "態度形成モデル", scholar: null, year: null, core_point: "AIDA(注目→関心→欲求→行動)、AISAS(注目→関心→検索→行動→共有)、VISAS(口コミ→影響→共感→行動→共有)、DECAX(発見→関係→確認→行動→体験共有)" },
      { name: "IMC", scholar: null, year: null, core_point: "Integrated Marketing Communications。全コミュニケーション手段を統合的に管理" },
      { name: "プッシュvsプル戦略", scholar: null, year: null, core_point: "プッシュ=メーカー→流通→消費者、プル=メーカー→消費者→流通への需要喚起" }
    ],
    terms: {
      "コミュニケーション・ミックス": "広告・販売促進・PR・人的販売・ダイレクトマーケティングの5要素",
      "AISAS": "電通モデル。ネット時代の購買プロセス（Search・Share追加）",
      "DECAX": "コンテンツマーケティング時代の消費者行動モデル"
    },
    exam_points: [
      "AIDA/AISAS/VISAS/DECAXの各段階の違い",
      "プッシュvsプル戦略の流れ",
      "コミュニケーション・ミックスの5要素"
    ],
    confusions: [
      { pair: ["AISAS", "AIDA"], clarification: "AIDA=伝統的（一方向）、AISAS=ネット時代（Search・Shareが追加）" },
      { pair: ["プッシュ戦略", "プル戦略"], clarification: "プッシュ=流通チャネルに押し込む（人的販売・リベート）、プル=消費者の需要を引き出す（広告・PR）" }
    ]
  },

  "チャネル戦略": {
    theories: [
      { name: "チャネル政策3類型", scholar: null, year: null, core_point: "開放的（多数の販売店）・選択的（条件に合う販売店）・排他的/専属的（独占販売権）" },
      { name: "VMS", scholar: null, year: null, core_point: "Vertical Marketing System。企業型（所有統合）・契約型（FC等）・管理型（影響力で統制）" },
      { name: "延期と投機の原理", scholar: "Bucklin", year: null, core_point: "延期=需要確定まで生産・配送を遅らせる、投機=事前に大量生産・配送" },
      { name: "オムニチャネル", scholar: null, year: null, core_point: "マルチ→クロス→オムニチャネルの進化。全チャネルをシームレスに統合" }
    ],
    terms: {
      "FC": "フランチャイズ・チェーン。本部と加盟店の契約関係",
      "VC": "ボランタリー・チェーン。小売店が自発的に結合",
      "中間流通業者": "卸売業者。メーカーと小売の間で商流・物流・情報流を担う",
      "チャネル・コンフリクト": "チャネルメンバー間の利害対立",
      "マルチチャネル": "複数チャネルの並存（連携なし）",
      "クロスチャネル": "チャネル間の情報連携あり",
      "オムニチャネル": "全チャネルの完全統合・シームレスな顧客体験"
    },
    exam_points: [
      "開放的・選択的・排他的チャネルの使い分け",
      "VMSの3タイプの特徴",
      "FCとVCの違い",
      "マルチ→クロス→オムニチャネルの発展段階",
      "延期と投機の原理"
    ],
    confusions: [
      { pair: ["FC", "VC"], clarification: "FC=本部主導・契約・ロイヤリティ、VC=小売主導・自発的結合・独立性高い" },
      { pair: ["延期", "投機"], clarification: "延期=リスク回避・受注生産型・在庫少、投機=規模の経済・見込み生産型・在庫多" },
      { pair: ["マルチ", "クロス", "オムニ"], clarification: "マルチ=複数チャネル独立、クロス=チャネル間連携、オムニ=完全統合・境界なし" }
    ]
  },

  "製品戦略": {
    theories: [
      { name: "PLC", scholar: null, year: null, core_point: "Product Life Cycle。導入期→成長期→成熟期→衰退期。各段階で戦略が異なる" },
      { name: "プロダクト3層モデル", scholar: "Kotler", year: null, core_point: "中核（便益）→実体（品質・デザイン等）→付随機能（保証・配送等）" },
      { name: "製品ミックス", scholar: null, year: null, core_point: "4つの次元：幅（ライン数）・深さ（各ラインのアイテム数）・長さ（全アイテム数）・整合性" },
      { name: "計画的陳腐化", scholar: null, year: null, core_point: "機能的陳腐化・品質的陳腐化・スタイル的陳腐化の3タイプ" }
    ],
    terms: {
      "導入期": "PLC。認知拡大が課題。高コスト・低売上",
      "成長期": "PLC。売上急増。競合参入。差別化が課題",
      "成熟期": "PLC。売上ピーク。競争激化。効率化・リポジショニングが課題",
      "衰退期": "PLC。売上減少。撤退・収穫戦略"
    },
    exam_points: [
      "PLCの各段階の特徴と適切な戦略",
      "プロダクト3層モデルの各層と具体例",
      "製品ミックスの4次元の違い"
    ],
    confusions: [
      { pair: ["幅", "深さ", "長さ"], clarification: "幅=製品ラインの数、深さ=各ライン内のアイテム数、長さ=全ラインのアイテム総数" },
      { pair: ["成長期", "成熟期"], clarification: "成長期=売上急増・競合参入、成熟期=売上横ばい・競争激化・利益最大化" }
    ]
  },

  "ブランド戦略": {
    theories: [
      { name: "ブランド・エクイティ", scholar: "Aaker", year: null, core_point: "4要素：ブランド認知・知覚品質・ブランド連想・ブランドロイヤリティ" },
      { name: "CBBEモデル", scholar: "Keller", year: null, core_point: "Customer-Based Brand Equity。4階層6ブロック：顕著性→パフォーマンス/イメージ→判断/感情→共鳴" },
      { name: "ブランド基本戦略", scholar: null, year: null, core_point: "4分類：ライン拡張・ブランド拡張・マルチブランド・新ブランド" }
    ],
    terms: {
      "ブランドアイデンティティ": "企業がブランドに持たせたいイメージ（送り手視点）",
      "ブランドイメージ": "消費者がブランドに対して抱くイメージ（受け手視点）",
      "ライン拡張": "既存ブランド×既存カテゴリー内で新バリエーション追加",
      "ブランド拡張": "既存ブランド名で新カテゴリーに参入",
      "マルチブランド": "同一カテゴリーで複数ブランドを展開",
      "新ブランド": "新ブランド名で新カテゴリーに参入"
    },
    exam_points: [
      "Aakerのブランド・エクイティ4要素",
      "KellerのCBBE4階層の順序",
      "ブランドアイデンティティvsブランドイメージの違い",
      "ブランド基本戦略4分類の区別"
    ],
    confusions: [
      { pair: ["Aaker", "Keller"], clarification: "Aaker=4要素でブランド資産を測定、Keller=4階層6ブロックで顧客視点のブランド構築" },
      { pair: ["ブランドアイデンティティ", "ブランドイメージ"], clarification: "アイデンティティ=企業側の意図（送り手）、イメージ=消費者側の認知（受け手）" },
      { pair: ["ライン拡張", "ブランド拡張"], clarification: "ライン拡張=同じカテゴリー内の新バリエーション、ブランド拡張=別カテゴリーへの進出" }
    ]
  },

  "サービス・マーケティング": {
    theories: [
      { name: "サービスの5特性", scholar: null, year: null, core_point: "無形性(Intangibility)・不可分性(Inseparability)・変動性(Variability)・消滅性(Perishability)・共同生産性" },
      { name: "7P", scholar: null, year: null, core_point: "4P＋People(人)・Process(プロセス)・Physical Evidence(物的証拠)" },
      { name: "マーケティングの三角形", scholar: "Kotler", year: null, core_point: "企業→従業員（インターナル）、企業→顧客（エクスターナル）、従業員→顧客（インタラクティブ）" },
      { name: "SDL", scholar: "Vargo & Lusch", year: 2004, core_point: "Service-Dominant Logic。価値はサービスの交換で創出。顧客は価値共創者" },
      { name: "サービス・プロフィット・チェーン", scholar: "Heskett", year: 1994, core_point: "従業員満足→サービス品質→顧客満足→顧客ロイヤリティ→利益の連鎖" }
    ],
    terms: {
      "無形性": "サービスは触れない・見えない。物的証拠で補完",
      "不可分性": "生産と消費が同時に行われる",
      "変動性": "提供者・時間・場所によって品質が変動",
      "消滅性": "在庫できない。需要と供給の調整が課題",
      "SERVQUAL": "サービス品質測定の5次元（有形性・信頼性・反応性・確信性・共感性）",
      "GDL": "Goods-Dominant Logic。モノ中心の価値観（SDLの対比概念）"
    },
    exam_points: [
      "サービスの5特性とそれぞれの課題・対策",
      "7Pの追加3P（People・Process・Physical Evidence）",
      "SDLとGDLの違い",
      "サービス・プロフィット・チェーンの連鎖順序"
    ],
    confusions: [
      { pair: ["SDL", "GDL"], clarification: "SDL=サービス中心・価値共創・オペランド/オペラント資源、GDL=モノ中心・価値交換" },
      { pair: ["不可分性", "消滅性"], clarification: "不可分性=生産と消費の同時性、消滅性=サービスの在庫不可能性" }
    ]
  },

  "ソーシャル・マーケティング": {
    theories: [
      { name: "コンシューマリズム", scholar: "Kennedy", year: 1962, core_point: "消費者の4つの権利：安全の権利・知る権利・選ぶ権利・意見を反映させる権利" },
      { name: "非営利組織のマーケティング", scholar: null, year: null, core_point: "NPO・行政等にもマーケティング手法を適用。ソーシャル・マーケティングの一形態" },
      { name: "CSRマーケティング3タイプ", scholar: null, year: null, core_point: "コーズ・リレーテッド・マーケティング(CRM)・コーズ・プロモーション・社会貢献活動" }
    ],
    terms: {
      "コーズ・リレーテッド・マーケティング": "売上の一部を社会的活動に寄付するマーケティング",
      "ソーシャル・マーケティング": "2つの意味：①社会問題解決のためのマーケティング ②企業の社会的責任を考慮したマーケティング"
    },
    exam_points: [
      "Kennedyの消費者の4つの権利",
      "ソーシャル・マーケティングの2つの意味の区別"
    ],
    confusions: [
      { pair: ["ソーシャル・マーケティング(社会変革)", "ソサイエタル・マーケティング(企業倫理)"], clarification: "ソーシャル=社会課題解決目的、ソサイエタル=企業が社会的影響を考慮して行うマーケティング" }
    ]
  },

  "関係マーケティング": {
    theories: [
      { name: "パレートの法則", scholar: null, year: null, core_point: "売上の80%は上位20%の顧客から。優良顧客の維持が重要" },
      { name: "1:5の法則", scholar: null, year: null, core_point: "新規顧客獲得は既存顧客維持の5倍のコスト" },
      { name: "RFM分析", scholar: null, year: null, core_point: "Recency（直近購買）・Frequency（購買頻度）・Monetary（購買金額）で顧客を分類" },
      { name: "CRM", scholar: null, year: null, core_point: "Customer Relationship Management。3分類：戦略的CRM・運用的CRM・分析的CRM" },
      { name: "CLV/LTV", scholar: null, year: null, core_point: "Customer Lifetime Value。顧客生涯価値。1人の顧客が生涯にもたらす利益の合計" }
    ],
    terms: {
      "リレーションシップ・マーケティング": "長期的な顧客関係の構築・維持を重視するアプローチ",
      "スイッチング・コスト": "顧客が他社に乗り換える際に発生するコスト",
      "顧客ロイヤリティ": "顧客の継続的な購買・推奨意向"
    },
    exam_points: [
      "パレートの法則の比率（80:20）",
      "RFM分析の3要素",
      "CLV/LTVの概念と計算の考え方",
      "1:5の法則の意味"
    ],
    confusions: [
      { pair: ["CRM", "リレーションシップ・マーケティング"], clarification: "CRM=ITシステム・ツール面も含む管理手法、リレーションシップ・マーケティング=概念・思想としての関係重視" }
    ]
  },

  "その他（マーケティング補足）": {
    theories: [
      { name: "プロセスvsプロダクトイノベーション", scholar: null, year: null, core_point: "プロセス=生産方法の革新、プロダクト=製品自体の革新" },
      { name: "第4次産業革命", scholar: null, year: null, core_point: "IoT・AI・ビッグデータ・ロボット等によるデジタル変革" },
      { name: "サブスクリプション", scholar: null, year: null, core_point: "4タイプ：定額使い放題型・キュレーション型・補充型・会員制型" },
      { name: "シェアリング・エコノミー", scholar: null, year: null, core_point: "資産・スキルの共有。Uber・Airbnb等。所有から利用へ" },
      { name: "原産国効果", scholar: null, year: null, core_point: "製品の原産国が品質評価・購買意思決定に影響を与える現象" }
    ],
    terms: {
      "IoT": "Internet of Things。モノのインターネット",
      "DX": "Digital Transformation。デジタル技術による変革",
      "サブスクリプション": "定額制のサービス利用モデル"
    },
    exam_points: [
      "プロセスvsプロダクトイノベーションの区別",
      "サブスクリプションの4タイプ",
      "シェアリング・エコノミーの特徴と事例"
    ],
    confusions: [
      { pair: ["プロセスイノベーション", "プロダクトイノベーション"], clarification: "プロセス=作り方の革新（効率化）、プロダクト=何を作るかの革新（新製品）" }
    ]
  },

  // ============================================================
  // GROUP 3: 戦略 (11 topics)
  // ============================================================

  "戦略の概念": {
    theories: [
      { name: "戦略の定義", scholar: "Chandler", year: 1962, core_point: "組織の長期目的の決定と、資源配分・行動方針の採択。「組織は戦略に従う」" },
      { name: "成長マトリクス", scholar: "Ansoff", year: 1957, core_point: "製品×市場の2軸4戦略：市場浸透・新市場開拓・新製品開発・多角化" },
      { name: "戦略の5P", scholar: "Mintzberg", year: 1987, core_point: "Plan(計画)・Ploy(策略)・Pattern(パターン)・Position(位置)・Perspective(視座)" },
      { name: "BSC", scholar: "Kaplan & Norton", year: 1992, core_point: "Balanced Scorecard。4つの視点：財務・顧客・内部プロセス・学習と成長" },
      { name: "戦略の3階層", scholar: null, year: null, core_point: "企業戦略（全社）→事業戦略（各事業）→機能別戦略（各部門）" }
    ],
    terms: {
      "意図された戦略": "Mintzberg。トップが計画した戦略",
      "創発的戦略": "Mintzberg。実行過程で自然に生まれる戦略",
      "実現された戦略": "Mintzberg。実際に実行された戦略（意図+創発）"
    },
    exam_points: [
      "Chandlerの「組織は戦略に従う」の意味",
      "Mintzbergの戦略の5Pの内容",
      "BSCの4つの視点",
      "戦略の3階層の区別",
      "意図された戦略vs創発的戦略"
    ],
    confusions: [
      { pair: ["組織は戦略に従う", "戦略は組織に従う"], clarification: "Chandler=組織は戦略に従う（戦略が先）、Ansoff等の反論=戦略は組織に制約される" },
      { pair: ["意図された戦略", "創発的戦略"], clarification: "意図=計画的・トップダウン、創発=現場から自然に形成・ボトムアップ" }
    ]
  },

  "ポジショニングとRBV": {
    theories: [
      { name: "SWOT分析", scholar: "Andrews", year: 1971, core_point: "Strength・Weakness（内部）、Opportunity・Threat（外部）の4象限分析" },
      { name: "SCPパラダイム", scholar: "Bain", year: 1956, core_point: "Structure(市場構造)→Conduct(企業行動)→Performance(業績)。産業構造が業績を規定" },
      { name: "ファイブ・フォース", scholar: "Porter", year: 1980, core_point: "5つの競争要因：新規参入・代替品・買い手交渉力・売り手交渉力・既存競争" },
      { name: "RBV", scholar: "Barney", year: 1991, core_point: "Resource-Based View。持続的競争優位は企業内部の経営資源から生まれる" },
      { name: "VRIOフレームワーク", scholar: "Barney", year: null, core_point: "Value・Rarity・Imitability・Organization。4条件を満たすと持続的競争優位" },
      { name: "コア・コンピタンス", scholar: "Prahalad & Hamel", year: 1990, core_point: "他社に模倣困難な中核能力。3条件：顧客価値・競合差別化・事業展開可能性" },
      { name: "ダイナミック・ケイパビリティ", scholar: "Teece", year: 1997, core_point: "環境変化に対応して資源を再構成する能力。Sensing→Seizing→Transforming" },
      { name: "SECIモデル", scholar: "Nonaka", year: 1995, core_point: "知識創造の4段階。暗黙知⇔形式知の変換スパイラル（共同化→表出化→結合化→内面化）" }
    ],
    terms: {
      "ポジショニング・アプローチ": "外部環境（産業構造）を重視する戦略論。Porter的",
      "資源アプローチ": "内部資源を重視する戦略論。Barney的",
      "因果曖昧性": "競争優位の源泉が特定困難なこと。模倣障壁になる",
      "経路依存性": "過去の経緯に規定される。模倣困難性の要因"
    },
    exam_points: [
      "ポジショニング・アプローチ(Porter)vsRBV(Barney)の対比は超頻出",
      "VRIOの4条件と各段階の競争的含意",
      "ファイブ・フォースの5要因",
      "ダイナミック・ケイパビリティの3要素(Sensing/Seizing/Transforming)",
      "SCPパラダイムとPorterの関係"
    ],
    confusions: [
      { pair: ["ポジショニング・アプローチ", "RBV"], clarification: "ポジショニング=外部の産業構造が競争優位を決定(Porter)、RBV=内部の経営資源が競争優位を決定(Barney)" },
      { pair: ["コア・コンピタンス", "ダイナミック・ケイパビリティ"], clarification: "コア・コンピタンス=静的な中核能力、ダイナミック・ケイパビリティ=環境変化に応じた資源再構成能力" },
      { pair: ["VRIO", "SWOT"], clarification: "VRIO=内部資源の評価フレームワーク、SWOT=内部+外部の総合分析" }
    ]
  },

  "事業戦略": {
    theories: [
      { name: "3つの基本戦略", scholar: "Porter", year: 1980, core_point: "コストリーダーシップ（低コスト）・差別化（独自性）・集中（特定セグメント）" },
      { name: "バリューチェーン", scholar: "Porter", year: 1985, core_point: "主活動（購買→製造→出荷→販売→サービス）＋支援活動（全般管理・HRM・技術開発・調達）" },
      { name: "規模の経済vs範囲の経済", scholar: null, year: null, core_point: "規模の経済=生産量増→単位コスト減、範囲の経済=複数事業の資源共有→コスト減" },
      { name: "経験曲線", scholar: "BCG", year: null, core_point: "累積生産量が倍増するとコストが一定割合で低下する法則" },
      { name: "ブルーオーシャン戦略", scholar: "Kim & Mauborgne", year: 2005, core_point: "競争のない新市場空間を創造。レッドオーシャン（既存の競争激しい市場）の対義" }
    ],
    terms: {
      "コストリーダーシップ": "業界最低コストで生産し価格競争力を持つ戦略",
      "差別化戦略": "独自の価値で他社と差別化しプレミアム価格を実現",
      "集中戦略": "特定セグメントに経営資源を集中。コスト集中or差別化集中",
      "スタック・イン・ザ・ミドル": "Porter。コストリーダーシップでも差別化でもない中途半端な状態"
    },
    exam_points: [
      "Porterの3つの基本戦略の区別と特徴",
      "バリューチェーンの主活動5つと支援活動4つ",
      "規模の経済vs範囲の経済vs経験曲線の区別",
      "ブルーオーシャンvsレッドオーシャン"
    ],
    confusions: [
      { pair: ["コストリーダーシップ", "差別化"], clarification: "コストリーダーシップ=低コスト追求、差別化=独自価値追求。Porterは両立困難と主張" },
      { pair: ["規模の経済", "範囲の経済"], clarification: "規模=同一製品の大量生産でコスト減、範囲=複数製品の資源共有でコスト減" },
      { pair: ["規模の経済", "経験曲線"], clarification: "規模=ある時点の生産量とコストの関係、経験曲線=累積生産量とコストの関係（時間軸あり）" }
    ]
  },

  "競争ポジション": {
    theories: [
      { name: "4つの競争ポジション", scholar: "Kotler", year: null, core_point: "リーダー（シェア最大）・チャレンジャー（2位以下の攻撃者）・ニッチャー（特定領域特化）・フォロワー（模倣追随）" },
      { name: "同質化政策", scholar: null, year: null, core_point: "リーダーの戦略。チャレンジャーの差別化を模倣して無力化する" }
    ],
    terms: {
      "リーダー戦略": "市場拡大・同質化・非価格対応・フルライン",
      "チャレンジャー戦略": "差別化でリーダーに挑戦。正面攻撃・側面攻撃等",
      "ニッチャー戦略": "特定セグメントで独占的地位を築く",
      "フォロワー戦略": "リーダーを模倣しつつ低コストで追随"
    },
    exam_points: [
      "4つのポジションの特徴と各戦略",
      "リーダーの同質化政策の意味",
      "各ポジションの具体的企業例"
    ],
    confusions: [
      { pair: ["チャレンジャー", "フォロワー"], clarification: "チャレンジャー=差別化でリーダーに挑戦（攻撃的）、フォロワー=リーダーを模倣（追随的）" },
      { pair: ["ニッチャー", "集中戦略"], clarification: "ニッチャー=Kotlerの競争ポジション概念、集中戦略=Porterの基本戦略概念。どちらも特化だが理論的枠組みが異なる" }
    ]
  },

  "多角化": {
    theories: [
      { name: "多角化類型", scholar: "Rumelt", year: 1974, core_point: "専業型・垂直型・本業型・関連型・非関連型。関連度で分類" },
      { name: "PPM/BCGマトリクス", scholar: "BCG", year: null, core_point: "市場成長率×相対的市場シェアの2軸4象限：花形・金のなる木・問題児・負け犬" },
      { name: "シナジー", scholar: "Ansoff", year: 1965, core_point: "相乗効果（1+1>2）。販売・操業・投資・管理の4タイプ" },
      { name: "ドミナント・ロジック", scholar: "Prahalad & Bettis", year: 1986, core_point: "経営者の支配的な思考様式が多角化の方向と成果を規定する" }
    ],
    terms: {
      "花形": "高成長・高シェア。将来の金のなる木候補",
      "金のなる木": "低成長・高シェア。キャッシュを生み出す",
      "問題児": "高成長・低シェア。投資が必要。花形になるか撤退か",
      "負け犬": "低成長・低シェア。撤退候補",
      "関連多角化": "既存事業と関連のある分野への多角化。シナジー期待",
      "非関連多角化": "既存事業と関連のない分野への多角化。リスク分散"
    },
    exam_points: [
      "PPMの4象限の特徴と戦略的含意",
      "Rumeltの多角化類型の区別",
      "Ansoffのシナジー4タイプ",
      "PPMの限界（新事業が常に問題児になる等）"
    ],
    confusions: [
      { pair: ["花形", "金のなる木"], clarification: "花形=高成長高シェア（投資も必要）、金のなる木=低成長高シェア（キャッシュ創出源）" },
      { pair: ["関連多角化", "非関連多角化"], clarification: "関連=既存資源の活用可能（シナジー大）、非関連=リスク分散目的（シナジー小）" }
    ]
  },

  "垂直統合": {
    theories: [
      { name: "取引コスト理論", scholar: "Williamson", year: 1975, core_point: "市場取引のコストが高い場合、企業内で行う（垂直統合）方が効率的" },
      { name: "企業の境界", scholar: "Coase", year: 1937, core_point: "市場の取引コストvs組織の管理コスト。両者が等しくなるところが企業の境界" },
      { name: "情報の非対称性", scholar: "Akerlof", year: 1970, core_point: "取引当事者間の情報格差。逆選択（事前）とモラルハザード（事後）を引き起こす" },
      { name: "中間組織", scholar: null, year: null, core_point: "市場と組織の中間形態。戦略的提携・JV・長期契約等" }
    ],
    terms: {
      "取引コスト": "情報探索・交渉・監視・執行にかかるコスト",
      "資産特殊性": "Williamson。特定取引にしか使えない資産。高いほど垂直統合に向く",
      "逆選択": "情報の非対称性による事前の問題（レモンの市場）",
      "モラルハザード": "情報の非対称性による事後の問題（契約後の怠慢）",
      "ホールドアップ問題": "特殊資産投資後に取引相手に搾取されるリスク"
    },
    exam_points: [
      "取引コスト理論の論理（市場vs組織の選択）",
      "Coaseの企業の境界の考え方",
      "逆選択vsモラルハザードの区別",
      "資産特殊性と垂直統合の関係"
    ],
    confusions: [
      { pair: ["逆選択", "モラルハザード"], clarification: "逆選択=契約前の情報格差（悪いものが選ばれる）、モラルハザード=契約後の行動変化（怠慢・隠れた行動）" },
      { pair: ["Coase", "Williamson"], clarification: "Coase=企業の存在理由を取引コストで説明（1937）、Williamson=取引コスト理論を精緻化（資産特殊性等,1975）" }
    ]
  },

  "事業ドメイン拡張": {
    theories: [
      { name: "内部成長vsM&Avs戦略的提携", scholar: null, year: null, core_point: "内部成長=自社開発、M&A=買収合併、戦略的提携=独立維持しつつ協力" },
      { name: "PMI", scholar: null, year: null, core_point: "Post Merger Integration。M&A後の統合プロセス。成功の鍵" },
      { name: "TOB", scholar: null, year: null, core_point: "Take Over Bid。株式公開買付け。敵対的買収にも使用" },
      { name: "MBO", scholar: null, year: null, core_point: "Management Buyout。経営陣による自社買収" },
      { name: "JV", scholar: null, year: null, core_point: "Joint Venture。合弁事業。複数企業が共同出資で新会社設立" }
    ],
    terms: {
      "水平統合": "同業種間のM&A。規模の経済を追求",
      "垂直統合": "バリューチェーンの川上・川下へのM&A",
      "敵対的買収": "対象企業の経営陣の同意なしに行う買収",
      "友好的買収": "対象企業の経営陣の同意を得て行う買収",
      "ポイズンピル": "買収防衛策の一つ。敵対的買収時に株式を希薄化"
    },
    exam_points: [
      "内部成長・M&A・提携のメリット・デメリット比較",
      "PMIの重要性",
      "MBOとTOBの区別"
    ],
    confusions: [
      { pair: ["MBO(経営者買収)", "MBO(目標管理)"], clarification: "Management Buyout=経営者による自社買収（戦略）、Management by Objectives=目標による管理（モチベーション）。同じ略語で全く別概念" },
      { pair: ["水平統合", "垂直統合"], clarification: "水平=同業種間（規模の経済）、垂直=川上or川下（取引コスト削減）" }
    ]
  },

  "生産戦略": {
    theories: [
      { name: "フォード・システム", scholar: "Ford", year: 1913, core_point: "流れ作業・大量生産方式。コンベアシステム。標準化・互換性部品" },
      { name: "トヨタ生産方式", scholar: "大野耐一", year: null, core_point: "2本柱：JIT（必要なものを必要な時に必要なだけ）と自働化（異常時自動停止）。かんばん方式" },
      { name: "製品アーキテクチャ", scholar: "藤本隆宏", year: null, core_point: "モジュラー型（部品独立・組合せ自由）vsインテグラル型（部品間の緊密な調整が必要）" },
      { name: "ネットワーク外部性", scholar: null, year: null, core_point: "利用者が増えるほど価値が高まる効果（電話・SNS等）" },
      { name: "デファクトvsデジュールスタンダード", scholar: null, year: null, core_point: "デファクト=市場競争で事実上の標準に、デジュール=公的機関が策定した標準" }
    ],
    terms: {
      "JIT": "Just In Time。在庫最小化。かんばんで後工程引取り",
      "自働化": "にんべんの付いた自動化。異常時に自動停止し人間に通知",
      "かんばん方式": "後工程引取りの情報伝達ツール",
      "SCM": "Supply Chain Management。原材料→最終消費者までの一連の流れを統合管理",
      "QCDF": "Quality・Cost・Delivery・Flexibility。生産の4つの競争要因",
      "モジュラー型": "部品間インターフェースが標準化。PC等",
      "インテグラル型": "部品間の緊密なすり合わせが必要。日本車等"
    },
    exam_points: [
      "フォード・システムvsトヨタ生産方式の対比",
      "JITと自働化の意味",
      "モジュラーvsインテグラルの違いと各国・産業の特徴",
      "デファクトvsデジュールスタンダードの区別",
      "ネットワーク外部性の具体例"
    ],
    confusions: [
      { pair: ["フォード・システム", "トヨタ生産方式"], clarification: "フォード=大量生産・プッシュ型・在庫前提、トヨタ=多品種少量・プル型・在庫最小化" },
      { pair: ["モジュラー型", "インテグラル型"], clarification: "モジュラー=部品独立・組替え容易（PC）、インテグラル=部品間すり合わせ・最適化（自動車）" },
      { pair: ["デファクト", "デジュール"], clarification: "デファクト=市場競争で勝ち残った標準（Windows等）、デジュール=ISO等の公的機関が定めた標準" }
    ]
  },

  "イノベーション戦略": {
    theories: [
      { name: "イノベーションのジレンマ", scholar: "Christensen", year: 1997, core_point: "優良企業が破壊的技術に対応できず衰退。既存顧客の声を聞きすぎることが原因" },
      { name: "技術のSカーブ", scholar: "Foster", year: 1986, core_point: "技術はS字型に進歩。成熟すると次の技術に不連続的に移行" },
      { name: "オープンイノベーション", scholar: "Chesbrough", year: 2003, core_point: "社内外の技術・アイデアを組み合わせ。クローズドイノベーションの対比" },
      { name: "デザイン・ドリブン・イノベーション", scholar: "Verganti", year: 2009, core_point: "意味のイノベーション。技術や市場ではなく製品の意味を変える" },
      { name: "MVP/リーンスタートアップ", scholar: "Ries", year: 2011, core_point: "Minimum Viable Product。構築→計測→学習のフィードバックループ" },
      { name: "死の谷vsダーウィンの海", scholar: null, year: null, core_point: "死の谷=研究→開発のギャップ、ダーウィンの海=開発→事業化のギャップ" }
    ],
    terms: {
      "破壊的イノベーション": "Christensen。既存市場の下位or新市場から始まり既存企業を脅かす",
      "持続的イノベーション": "Christensen。既存製品の漸進的改善",
      "クローズドイノベーション": "自社の内部資源のみでイノベーション。自前主義",
      "MVP": "最小限の機能で市場に投入し学習する製品"
    },
    exam_points: [
      "イノベーションのジレンマの論理（なぜ優良企業が失敗するか）",
      "オープンvsクローズドイノベーションの比較",
      "死の谷vsダーウィンの海の位置",
      "リーンスタートアップの構築→計測→学習サイクル"
    ],
    confusions: [
      { pair: ["破壊的イノベーション", "持続的イノベーション"], clarification: "破壊的=既存市場の枠外から破壊、持続的=既存市場内での改善。破壊的の方が既存企業に脅威" },
      { pair: ["死の谷", "ダーウィンの海"], clarification: "死の谷=研究→開発の間（資金不足）、ダーウィンの海=開発→事業化の間（市場競争）" },
      { pair: ["オープンイノベーション", "クローズドイノベーション"], clarification: "オープン=社外の技術・知識も活用、クローズド=自社のみで完結。現代はオープンが主流" }
    ]
  },

  "国際戦略": {
    theories: [
      { name: "OLIパラダイム", scholar: "Dunning", year: 1977, core_point: "Ownership(所有優位)・Location(立地優位)・Internalization(内部化優位)。3つ揃うとFDI" },
      { name: "CAGEフレームワーク", scholar: "Ghemawat", year: 2001, core_point: "Cultural・Administrative・Geographic・Economicの4距離で国際進出の障壁を分析" },
      { name: "I-Rフレームワーク", scholar: "Bartlett & Ghoshal", year: 1989, core_point: "統合圧力(I)×現地適応圧力(R)。4戦略：グローバル・マルチドメスティック・インターナショナル・トランスナショナル" },
      { name: "AAAフレームワーク", scholar: "Ghemawat", year: 2007, core_point: "Adaptation(適応)・Aggregation(集約)・Arbitrage(裁定)の3戦略" },
      { name: "ホフステードの文化次元", scholar: "Hofstede", year: 1980, core_point: "権力格差・個人主義/集団主義・男性性/女性性・不確実性回避・長期/短期志向・充足/抑制" },
      { name: "PLC国際版", scholar: "Vernon", year: 1966, core_point: "製品ライフサイクルに沿って生産拠点が先進国→新興国へ移転" }
    ],
    terms: {
      "FDI": "Foreign Direct Investment。海外直接投資",
      "グローバル戦略": "I-R。高統合・低適応。世界標準化",
      "マルチドメスティック戦略": "I-R。低統合・高適応。各国対応",
      "トランスナショナル戦略": "I-R。高統合・高適応。最も理想的だが実現困難",
      "インターナショナル戦略": "I-R。低統合・低適応。本国の仕組みをそのまま移転"
    },
    exam_points: [
      "I-Rフレームワークの4戦略とその位置づけ",
      "OLIパラダイムの3要素",
      "CAGEの4距離の具体例",
      "ホフステードの文化次元（特に権力格差・個人/集団主義）"
    ],
    confusions: [
      { pair: ["グローバル戦略", "マルチドメスティック戦略"], clarification: "グローバル=世界標準化・効率重視、マルチドメスティック=各国適応・現地ニーズ重視" },
      { pair: ["トランスナショナル", "グローバル"], clarification: "トランスナショナル=統合と適応の両立（理想形）、グローバル=統合重視のみ" },
      { pair: ["OLI", "CAGE"], clarification: "OLI=なぜFDIするか（動機）、CAGE=どの国に進出するか（距離・障壁）" }
    ]
  },

  "その他（戦略・財務等）": {
    theories: [
      { name: "MM定理", scholar: "Modigliani & Miller", year: 1958, core_point: "完全市場では資本構成（負債比率）は企業価値に影響しない" },
      { name: "CAPM", scholar: "Sharpe", year: 1964, core_point: "資本資産価格モデル。期待収益率=リスクフリーレート+β×市場リスクプレミアム" },
      { name: "ペティ・クラークの法則", scholar: "Petty/Clark", year: null, core_point: "経済発展に伴い産業構造が第1次→第2次→第3次産業へシフト" },
      { name: "ソーシャル・キャピタル", scholar: null, year: null, core_point: "社会関係資本。信頼・規範・ネットワークが経済的価値を生む" }
    ],
    terms: {
      "WACC": "Weighted Average Cost of Capital。加重平均資本コスト",
      "DCF": "Discounted Cash Flow。割引キャッシュフロー法。将来CFの現在価値合計",
      "NPV": "Net Present Value。正味現在価値。NPV>0なら投資実行",
      "IRR": "Internal Rate of Return。内部収益率。NPV=0となる割引率",
      "ROE": "Return on Equity。自己資本利益率=当期純利益/自己資本",
      "ROA": "Return on Assets。総資産利益率=当期純利益/総資産",
      "ROI": "Return on Investment。投資利益率"
    },
    exam_points: [
      "ROE・ROA・ROIの計算式と意味",
      "NPVとIRRの判断基準",
      "CAPMの計算式",
      "MM定理の前提（完全市場）と意義"
    ],
    confusions: [
      { pair: ["ROE", "ROA"], clarification: "ROE=自己資本ベース（株主視点）、ROA=総資産ベース（企業全体の効率）" },
      { pair: ["NPV", "IRR"], clarification: "NPV=絶対額で評価（金額）、IRR=率で評価（％）。通常NPV優先" }
    ]
  },

  // ============================================================
  // GROUP 4: 戦略学派（ミンツバーグの10学派）
  // ============================================================

  "戦略学派（ミンツバーグ10学派）": {
    theories: [
      { name: "デザイン・スクール", scholar: "Andrews", year: null, core_point: "SWOT分析。戦略は経営者の思考プロセスで形成。適合(Fit)の概念" },
      { name: "プランニング・スクール", scholar: "Ansoff", year: null, core_point: "戦略は公式的な計画プロセスで策定。成長マトリクス" },
      { name: "ポジショニング・スクール", scholar: "Porter", year: null, core_point: "SCPパラダイム。戦略は分析的に選択される市場ポジション" },
      { name: "アントレプレナー・スクール", scholar: "Schumpeter", year: null, core_point: "創造的破壊。戦略はリーダーのビジョンから生まれる" },
      { name: "コグニティブ・スクール", scholar: "Simon", year: null, core_point: "限定合理性・認知バイアス。戦略は認知プロセスの産物" },
      { name: "ラーニング・スクール", scholar: "Senge / Nonaka", year: null, core_point: "創発的戦略・SECIモデル。戦略は学習を通じて形成される" },
      { name: "パワー・スクール", scholar: "Pfeffer", year: null, core_point: "ミクロパワー（社内政治）とマクロパワー（企業間交渉）。戦略は政治的プロセス" },
      { name: "カルチャー・スクール", scholar: "Schein / Barney", year: null, core_point: "RBV。組織文化が戦略の源泉。文化は模倣困難な経営資源" },
      { name: "エンバイロメント・スクール", scholar: "Hannan & Freeman", year: null, core_point: "組織エコロジー（生態学）。環境が組織を淘汰。戦略の自由度は低い" },
      { name: "コンフィギュレーション・スクール", scholar: "Chandler / Mintzberg", year: null, core_point: "戦略の5P。組織と戦略の配置（コンフィギュレーション）と変革を統合的に捉える" }
    ],
    terms: {
      "規範的学派": "デザイン・プランニング・ポジショニング。『こうすべき』を示す",
      "記述的学派": "残り7学派。戦略がどう形成されるかを『記述』する",
      "創発的戦略": "ラーニング・スクール。計画的でなく実行過程で自然に形成される戦略",
      "組織エコロジー": "エンバイロメント・スクール。環境が組織を選択する（自然淘汰的視点）"
    },
    exam_points: [
      "10学派の各代表学者と中心概念",
      "規範的学派3つ（デザイン・プランニング・ポジショニング）vs記述的学派7つの区別",
      "各学派と他の理論トピックとの対応関係",
      "ポジショニング・スクール(Porter)とカルチャー・スクール(RBV)の対比"
    ],
    confusions: [
      { pair: ["デザイン・スクール", "プランニング・スクール"], clarification: "デザイン=非公式・経営者個人の思考、プランニング=公式的・体系的な計画プロセス" },
      { pair: ["規範的学派", "記述的学派"], clarification: "規範的=戦略はこう作るべき（処方的）、記述的=戦略はこう作られている（説明的）" },
      { pair: ["ラーニング・スクール", "コグニティブ・スクール"], clarification: "ラーニング=組織の学習による創発、コグニティブ=個人の認知・バイアスが戦略を規定" }
    ]
  }
};

// Helper: Get all topic names
export const TOPIC_NAMES = Object.keys(KNOWLEDGE_BASE);

// Helper: Get random items from array
export function getRandomItems(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, arr.length));
}

// Helper: Get all theories across all topics
export function getAllTheories() {
  const all = [];
  for (const [topic, data] of Object.entries(KNOWLEDGE_BASE)) {
    for (const theory of data.theories) {
      all.push({ ...theory, topic });
    }
  }
  return all;
}

// Helper: Get all confusions across all topics
export function getAllConfusions() {
  const all = [];
  for (const [topic, data] of Object.entries(KNOWLEDGE_BASE)) {
    if (data.confusions) {
      for (const confusion of data.confusions) {
        all.push({ ...confusion, topic });
      }
    }
  }
  return all;
}

// Helper: Get terms for a topic
export function getTermsForTopic(topicName) {
  const topic = KNOWLEDGE_BASE[topicName];
  return topic ? topic.terms : {};
}
