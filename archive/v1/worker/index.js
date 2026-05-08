// index.js - Cloudflare Worker for Quiz Generation
import { KNOWLEDGE_BASE } from './knowledge_base.js';

const REFERENCE_BOOKS = [
  '『よくわかる経営管理』高桥伸夫',
  '『経営学入門』中央経済社 藤田誠(2015)',
  '『組織行動のマネジメント』ダイヤモンド社 ロビンス, 高木晴夫翻訳(2009)',
  '『经营学战略入门』新宅纯二郎',
  '『イノベーション』有斐閣 清水洋(2022)',
  '『グローバル経営入門』日本経済新聞社 浅川和宏(2003)',
  '『アントレプレナーシップ』有斐閣 清水洋(2022)',
  '『マーケティング戦略』恩藏直人',
  '『マーケティングをつかむ』有斐閣 黒岩健一郎・水越康介',
  '『消費者行動論』有斐閣アルマ 青木幸弘等',
  '『現代広告論』有斐閣アルマ第4版 岸志津江等',
  '『はじめてのマーケティング』有斐閣ストゥディア 久保田進彦等',
  '『社会調査の考え方』佐藤郁哉',
  '『経営のための直感的統計学』吉田耕作',
  '組織行動のマネジメント 高木晴夫',
  '組織行動論 开本浩矢',
  '世界標準の経営理論 入山章荣',
  'グローバル経営入門 浅川和宏',
  'マネジメント入門 高木晴夫',
  '戦略経営論第3版 高木俊雄',
  '組織行動の経営学 高木晴夫',
  '経営のロジック 大月博司'
];

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Auth check
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.AUTH_TOKEN}`) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/generate') {
      return handleGenerate(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/feedback') {
      return handleFeedback(request, env);
    }
    // 题库统计：获取所有题目的对错记录
    if (request.method === 'GET' && url.pathname === '/bank/stats') {
      return handleBankStats(env);
    }
    // 题库记录：保存一道题的答题结果和评价
    if (request.method === 'POST' && url.pathname === '/bank/record') {
      return handleBankRecord(request, env);
    }

    // ===== Delta CRUD API =====
    if (request.method === 'GET' && url.pathname === '/delta') {
      return handleDeltaGet(env);
    }
    if (request.method === 'POST' && url.pathname.startsWith('/delta/')) {
      return handleDeltaMutate(request, env, url.pathname);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  }
};

async function handleGenerate(request, env) {
  try {
    const { concept, category, relatedConcepts, concepts, details } = await request.json();

    // Read preferences from KV
    const prefsData = await env.PREFS.get('quiz_prefs', 'json') || { feedbacks: [], summary: '' };

    // Find relevant knowledge base content
    const kbContent = findRelevantKB(concept, category);

    // Random variation for each question
    const angles = ['理論定義の正確な理解', '実際のビジネス応用', '学者間の比較', 'ケーススタディ分析', '概念の違いの辨別', '歴史的背景と発展'];
    const difficulties = ['基礎', '中級', '上級'];
    const angle = angles[Math.floor(Math.random() * angles.length)];
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

    // Build prompt - multi-concept or single-concept mode
    let prompt;
    if (concepts && concepts.length > 1) {
      prompt = buildSchoolPrompt(concept, category, concepts, details || [], kbContent, prefsData.summary, angle, difficulty);
    } else {
      prompt = buildPrompt(concept, category, kbContent, relatedConcepts, prefsData.summary, angle, difficulty);
    }

    // Call Gemini API
    const result = await callGemini(env.GEMINI_API_KEY, prompt);

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

async function handleFeedback(request, env) {
  try {
    const { concept, rating, reasons, comment, question } = await request.json();

    // Read existing prefs
    const prefsData = await env.PREFS.get('quiz_prefs', 'json') || { feedbacks: [], summary: '' };

    // Add new feedback
    prefsData.feedbacks.push({
      concept,
      rating, // "good" or "bad"
      reasons: reasons || [], // array of reason codes
      comment: comment || '',
      question: question || '', // the question text for context
      date: new Date().toISOString().slice(0, 10)
    });

    // Keep only last 50 feedbacks
    if (prefsData.feedbacks.length > 50) {
      prefsData.feedbacks = prefsData.feedbacks.slice(-50);
    }

    // Every 10 feedbacks, regenerate summary
    if (prefsData.feedbacks.length % 10 === 0 && prefsData.feedbacks.length > 0) {
      prefsData.summary = await generateSummary(env.GEMINI_API_KEY, prefsData.feedbacks);
    }

    // Save back to KV
    await env.PREFS.put('quiz_prefs', JSON.stringify(prefsData));

    return jsonResponse({ success: true, feedbackCount: prefsData.feedbacks.length });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function findRelevantKB(concept, category) {
  // Try to find matching topic in knowledge base
  let content = '';
  for (const [topic, data] of Object.entries(KNOWLEDGE_BASE)) {
    // Check if concept or category matches this topic
    if (category && topic.includes(category)) {
      content = formatKBEntry(topic, data);
      break;
    }
    // Check if any theory in this topic mentions the concept
    if (data.theories) {
      for (const t of data.theories) {
        if (concept.includes(t.name) || t.name.includes(concept) ||
            (t.scholar && concept.includes(t.scholar))) {
          content = formatKBEntry(topic, data);
          break;
        }
      }
    }
    if (content) break;
  }
  // If no match, try broader search
  if (!content) {
    for (const [topic, data] of Object.entries(KNOWLEDGE_BASE)) {
      const topicStr = JSON.stringify(data);
      if (topicStr.includes(concept.split('（')[0])) {
        content = formatKBEntry(topic, data);
        break;
      }
    }
  }
  return content || '教材情報なし';
}

function formatKBEntry(topic, data) {
  let s = `【${topic}】\n`;
  if (data.theories) {
    s += '主要理論：\n';
    for (const t of data.theories) {
      s += `- ${t.name} (${t.scholar || '—'}, ${t.year || '—'}): ${t.core_point}\n`;
    }
  }
  if (data.confusions) {
    s += '混同注意点：\n';
    for (const c of data.confusions) {
      s += `- ${c}\n`;
    }
  }
  return s;
}

function buildPrompt(concept, category, kbContent, relatedConcepts, prefsSummary, angle, difficulty) {
  let prompt = `あなたは経営管理学の大学院試験の出題専門家です。

以下の知識点について、日本語の4択問題を1問作成してください。

【出題対象の知識点】${concept}
【所属カテゴリ】${category || '不明'}

【教材の関連内容】
${kbContent}

【出題の角度】${angle}
【難易度】${difficulty}

【干渉項の素材（関連知識点）】
${(relatedConcepts || []).map(c => '- ' + c).join('\n') || 'なし'}

【参考教材】
以下の教材の知識体系と出題スタイルを参考にしてください：
${REFERENCE_BOOKS.join('\n')}
`;

  if (prefsSummary) {
    prompt += `\n【質量制約（ユーザーの過去のフィードバックから）】\n${prefsSummary}\n`;
  }

  prompt += `
【出力形式】
以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは含めないでください。

{
  "question": "日本語の問題文",
  "options": ["A. 選択肢1", "B. 選択肢2", "C. 選択肢3", "D. 選択肢4"],
  "answer": "A",
  "explanations": {
    "A": "中文解析：为什么这个选项正确/错误",
    "B": "中文解析",
    "C": "中文解析",
    "D": "中文解析"
  }
}

【重要な制約】
1. 問題文と選択肢は日本語で書いてください
2. 解析（explanations）は中国語（中文）で書いてください
3. 事実に基づいた正確な内容にしてください
4. 選択肢間の区別を明確にしてください
5. 曖昧な表現や議論のある答えは避けてください
6. 「以下のうち正しくないものを選べ」のような否定形式は避けてください`;

  return prompt;
}

function buildSchoolPrompt(schoolName, category, concepts, details, kbContent, prefsSummary, angle, difficulty) {
  const schoolAngles = [
    '特定の知識点内部の細かい分条（◆項目）の正確な内容を問う',
    '同一知識点内の複数分条の違いや特徴を区別させる',
    '分条レベルの具体的内容と知識点名称の正確な対応を問う',
    'ある経営状況に対して、特定の分条内容が適用されるかを判断',
    '複数知識点の分条内容を混ぜて、どの知識点に属するかを判断',
    '分条の具体的定義・特徴の正確性を問う（微妙な言い換えで惑わす）'
  ];
  const actualAngle = schoolAngles[Math.floor(Math.random() * schoolAngles.length)];

  // Pick 2-4 concepts with their details for focused deep questioning
  let indices = concepts.map((_, i) => i);
  if (indices.length > 4) {
    indices = indices.sort(() => Math.random() - 0.5).slice(0, 4);
  }

  let conceptContent = '';
  for (const i of indices) {
    conceptContent += `\n【${concepts[i]}】\n`;
    if (details[i]) {
      conceptContent += details[i] + '\n';
    }
  }

  let prompt = `あなたは経営管理学の大学院試験の出題専門家です。

以下の学派の知識点について、**具体的な分条内容（◆で区切られた各項目）のレベル**まで踏み込んだ4択問題を1問作成してください。

⚠️ 重要：以下のパターンは禁止です：
- 選択肢Aが知識点1、Bが知識点2…というように「1選択肢＝1知識点」の対応にしない
- 知識点の名前だけ知っていれば答えられる浅い問題にしない

✅ 求められる出題パターン：
- 1つの知識点の中の◆分条の具体的内容を正確に理解しているかを試す
- 分条内の定義・特徴・条件・メカニズムの細部を問う
- ある分条の内容を微妙に言い換えて、正確に理解しているかを確認する
- 2つの知識点の分条内容を混ぜて出題し、どちらに属するかを判断させる

【学派名】${schoolName}
【所属カテゴリ】${category || '不明'}

【出題素材（知識点の詳細内容）】
${conceptContent}

【教材の関連内容】
${kbContent}

【出題の角度】${actualAngle}
【難易度】${difficulty}

【参考教材】
${REFERENCE_BOOKS.join('\n')}
`;

  if (prefsSummary) {
    prompt += `\n【質量制約（ユーザーの過去のフィードバックから）】\n${prefsSummary}\n`;
  }

  prompt += `
【出力形式】
以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは含めないでください。

{
  "question": "日本語の問題文",
  "options": ["A. 選択肢1", "B. 選択肢2", "C. 選択肢3", "D. 選択肢4"],
  "answer": "A",
  "explanations": {
    "A": "中文解析：为什么这个选项正确/错误",
    "B": "中文解析",
    "C": "中文解析",
    "D": "中文解析"
  }
}

【重要な制約】
1. 問題文と選択肢は日本語で書いてください
2. 解析（explanations）は中国語（中文）で書いてください
3. ◆分条の具体的内容に踏み込んだ細かい問題にしてください
4. 選択肢間の区別を明確にしてください
5. 事実に基づいた正確な内容にしてください
6. 曖昧な表現や議論のある答えは避けてください
7. 「以下のうち正しくないものを選べ」のような否定形式は避けてください`;

  return prompt;
}

async function callGemini(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 4096,
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  // Find the last non-thought part (2.5 models may have thinking parts first)
  let text = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!parts[i].thought && parts[i].text) {
      text = parts[i].text;
      break;
    }
  }
  if (!text) text = parts[0]?.text || '';

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Gemini response as JSON. Raw: ' + text.substring(0, 200));
  }

  return JSON.parse(jsonMatch[0]);
}

async function generateSummary(apiKey, feedbacks) {
  const feedbackText = feedbacks.map(f => {
    let s = `[${f.date}] ${f.concept}: ${f.rating === 'good' ? '👍' : '👎'}`;
    if (f.reasons && f.reasons.length) s += ` 原因: ${f.reasons.join(', ')}`;
    if (f.comment) s += ` 补充: ${f.comment}`;
    return s;
  }).join('\n');

  const prompt = `以下は学生が問題に対して行った品質評価のリストです。
これらの評価を分析して、今後の出題品質を向上するための「質量制約」を100字以内の中国語でまとめてください。
事実正確性、選択肢の区別度、問題の深さなどの観点からまとめてください。

${feedbackText}

質量制約（中国語で）：`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
    })
  });

  if (!response.ok) return '';
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ===== 题库统计 & 记录 =====

async function handleBankStats(env) {
  const records = await env.PREFS.get('bank_records', 'json') || {};
  const feedback = await env.PREFS.get('bank_feedback', 'json') || [];
  return jsonResponse({ records, feedback });
}

async function handleBankRecord(request, env) {
  try {
    const { qid, correct, source, question, feedback } = await request.json();
    // qid: 题目标识 (题库用id如"bank_1", Gemini用"ai_"+hash)
    // correct: true/false
    // source: "bank" 或 "ai"
    // question: 题目文本（用于反馈时回溯）
    // feedback: { rating: "good"/"bad", reason: "..." } 可选

    if (qid === undefined) {
      return jsonResponse({ error: 'qid is required' }, 400);
    }

    // 更新对错记录
    const records = await env.PREFS.get('bank_records', 'json') || {};
    if (!records[qid]) {
      records[qid] = { c: 0, w: 0, last: '' };
    }
    if (correct) {
      records[qid].c++;
    } else {
      records[qid].w++;
    }
    records[qid].last = new Date().toISOString().slice(0, 10);
    await env.PREFS.put('bank_records', JSON.stringify(records));

    // 保存评价反馈（如果有）
    if (feedback && feedback.rating) {
      const feedbackList = await env.PREFS.get('bank_feedback', 'json') || [];
      feedbackList.push({
        qid,
        source: source || 'bank',
        rating: feedback.rating,
        reason: feedback.reason || '',
        question: (question || '').slice(0, 200),
        ts: new Date().toISOString()
      });
      // 保留最近200条反馈
      if (feedbackList.length > 200) {
        feedbackList.splice(0, feedbackList.length - 200);
      }
      await env.PREFS.put('bank_feedback', JSON.stringify(feedbackList));
    }

    return jsonResponse({ success: true, record: records[qid] });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ===== Claude API: KP 中日翻译 =====

// 翻译的 system prompt — 项目上下文 + 规则 + 示例
const TRANSLATION_SYSTEM_PROMPT = [
  '你是专业的中日経営学术语翻译助手，为一个中日双语经営管理学考试学习 app 翻译知识点。',
  '',
  '## 核心原则（非常重要）',
  '',
  '**在翻译每个概念之前，请先在内部推理：该概念在日本経営学界有没有通用的专业术语？**',
  '绝对优先使用日本経営学界（尤其是中央経済社・白桃書房・有斐閣・ダイヤモンド社等权威教科书）的标准术语，而不是字面直译。',
  '',
  '术语范例（必须按这个风格）：',
  '- 探索与利用 → **探索と活用**（❌ 探索と利用）',
  '- 组织公民行为 → **組織市民行動**（❌ 組織公民行為）',
  '- 科学管理法 → **科学的管理法**（❌ 科学管理方法）',
  '- 有限理性 → **限定合理性**（❌ 有限理性）',
  '- 动态能力 → **ダイナミック・ケイパビリティ**（❌ 動的能力）',
  '- 资源基础理论 → **リソース・ベースト・ビュー** / **資源ベース理論**',
  '- 交易成本理论 → **取引費用理論**（❌ 交易費用理論）',
  '- 组织行为学 → **組織行動論**（❌ 組織行為学）',
  '- 差别计件工资制 → **差別出来高給制度**（❌ 差別計件工資制）',
  '- 目标管理制度 / MBO → **目標管理制度 / MBO**',
  '- 群体决策 → **集団意思決定**（❌ 群体決策）',
  '- 冲突管理 → **コンフリクト・マネジメント** / **紛争管理**',
  '- 组织文化 → **組織文化**',
  '- 战略选择 → **戦略選択**',
  '- 权变理论 → **コンティンジェンシー理論** / **条件適合理論**',
  '',
  '如果拿不准术语，请按 "日本経営学专业教科书会怎么写" 的直觉来译。',
  '',
  '## 格式规则',
  '',
  '1. **必须完整保留所有 HTML 标签**：`<strong>`、`<br>`、`<compare>`、`</compare>` 等',
  '2. **必须完整保留所有结构符号**：`◆`（语义标签）、`①②③④⑤⑥⑦⑧⑨⑩`（圆圈数字）、`【】`（组标题）、`——`（破折号分隔符）',
  '3. **学者姓名使用片假名**（括号内保留原英文）：',
  '   - Taylor → テイラー',
  '   - Weber → ウェーバー',
  '   - Drucker → ドラッカー',
  '   - Simon → サイモン',
  '   - Porter → ポーター',
  '   - Barnard → バーナード',
  '4. **年份保持原样**：1911 → 1911（只把"年"加到后面：1911年）',
  '5. **语义标签固定翻译**：',
  '   - ◆意义 → ◆意義',
  '   - ◆局限 → ◆限界',
  '   - ◆原理 → ◆原理',
  '   - ◆背景 → ◆背景',
  '',
  '## 输出格式',
  '',
  '严格按 JSON 输出，不要任何额外说明文字：',
  '```',
  '{"jaTitle": "日文标题", "jaBody": "日文完整 body（含所有 HTML 标签和结构符号）"}',
  '```',
  '',
  '## 示例',
  '',
  '输入:',
  '  中文标题: "探索与利用"',
  '  中文body: "March（1991）提出的组织学习**双元性困境**：组织需要<br>①**探索**（exploration）——追求新知识、新机会<br>②**利用**（exploitation）——深耕现有能力"',
  '',
  '输出:',
  '  {"jaTitle": "探索と活用", "jaBody": "マーチ（March, 1991）が提唱した組織学習の**両利き（ambidexterity）のジレンマ**：組織は以下の両立が求められる<br>①**探索**（exploration）——新しい知識・機会の追求<br>②**活用**（exploitation）——既存能力の深化"}'
].join('\n');

// 调用 Claude API 翻译单个 KP
async function callClaudeTranslate(env, title, body) {
  if (!env.ANTHROPIC_API_KEY) {
    return { error: 'ANTHROPIC_API_KEY 未配置' };
  }
  const userMsg = '请翻译以下知识点为日文（按 JSON 格式输出）：\n\n'
    + '中文标题: "' + (title || '').replace(/"/g, '\\"') + '"\n'
    + '中文body: "' + (body || '').replace(/"/g, '\\"') + '"';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: TRANSLATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return { error: 'Claude API ' + res.status + ': ' + errTxt.slice(0, 200) };
    }
    const data = await res.json();
    // Claude 返回: { content: [{ type: 'text', text: '{"jaTitle":...}' }] }
    const txt = (data.content && data.content[0] && data.content[0].text) || '';
    // 尝试解析 JSON（Claude 可能在前后加 ```json ... ```）
    const jsonMatch = txt.match(/\{[\s\S]*"jaTitle"[\s\S]*"jaBody"[\s\S]*\}/);
    if (!jsonMatch) return { error: 'Claude 返回格式异常：' + txt.slice(0, 200) };
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.jaTitle || !parsed.jaBody) return { error: '翻译结果缺少字段' };
    return { jaTitle: parsed.jaTitle, jaBody: parsed.jaBody };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

// 把翻译结果存入 delta.kp.ja（key = KP 中文标题去掉括号）
function _kpJaKey(title) {
  return (title || '').replace(/([（(][^）)]+[）)][\s]*)+$/, '').trim();
}

// ===== Delta CRUD: KP / Scholar / School 增删 =====

const EMPTY_DELTA = {
  kp:      { nextId: 603, added: [], deleted: [], ja: {} },  // ja: { "KP 中文标题": "<strong>日文标题</strong>日文body" }
  scholar: { added: {}, deleted: [] },
  school:  { added: {}, deleted: [] }
};

async function getDelta(env) {
  const raw = await env.PREFS.get('delta', 'json');
  if (!raw) return JSON.parse(JSON.stringify(EMPTY_DELTA));
  // 兼容旧结构
  if (!raw.kp) raw.kp = EMPTY_DELTA.kp;
  if (!raw.kp.ja) raw.kp.ja = {};  // 兼容旧 delta 没有 ja 字段
  if (!raw.scholar) raw.scholar = EMPTY_DELTA.scholar;
  if (!raw.school) raw.school = EMPTY_DELTA.school;
  if (!raw.order) raw.order = {};
  return raw;
}

async function saveDelta(env, delta) {
  await env.PREFS.put('delta', JSON.stringify(delta));
}

async function handleDeltaGet(env) {
  const delta = await getDelta(env);
  return jsonResponse(delta);
}

async function handleDeltaMutate(request, env, pathname) {
  try {
    const body = await request.json();
    const delta = await getDelta(env);

    // POST /delta/kp/add
    if (pathname === '/delta/kp/add') {
      if (!body.title || !body.schools || !body.schools.length || !body.body) {
        return jsonResponse({ error: '标题、学派、正文为必填' }, 400);
      }
      const id = 'k' + delta.kp.nextId;
      const entry = {
        id, title: body.title, en: body.en || '', scholar: body.scholar || null,
        year: body.year || '', schools: body.schools, body: body.body,
        createdAt: new Date().toISOString()
      };
      delta.kp.added.push(entry);
      delta.kp.nextId++;
      await saveDelta(env, delta);
      return jsonResponse({ success: true, entry });
    }

    // POST /delta/kp/update
    if (pathname === '/delta/kp/update') {
      if (!body.id || !body.title || !body.schools || !body.body) {
        return jsonResponse({ error: 'id、title、schools、body为必填' }, 400);
      }
      const entry = {
        id: body.id, title: body.title, en: body.en || '', scholar: body.scholar || null,
        year: body.year || '', schools: body.schools, body: body.body,
        updatedAt: new Date().toISOString()
      };
      // 增量KP：直接更新
      const idx = delta.kp.added.findIndex(e => e.id === body.id);
      if (idx >= 0) {
        delta.kp.added[idx] = { ...delta.kp.added[idx], ...entry };
      } else {
        // 基础KP：标记删除 + 新增替换版
        if (!delta.kp.deleted.includes(body.id)) delta.kp.deleted.push(body.id);
        entry.createdAt = new Date().toISOString();
        delta.kp.added.push(entry);
      }
      await saveDelta(env, delta);
      return jsonResponse({ success: true, entry });
    }

    // POST /delta/kp/delete
    if (pathname === '/delta/kp/delete') {
      if (!body.id) return jsonResponse({ error: 'id is required' }, 400);
      // 增量KP：从added中移除
      const idx = delta.kp.added.findIndex(e => e.id === body.id);
      if (idx >= 0) {
        delta.kp.added.splice(idx, 1);
      } else {
        // 基础KP：加入deleted列表
        if (!delta.kp.deleted.includes(body.id)) delta.kp.deleted.push(body.id);
      }
      await saveDelta(env, delta);
      return jsonResponse({ success: true });
    }

    // POST /delta/kp/purge-stale
    // body: {
    //   beforeTime: "2026-04-23T01:00:00.000Z",  // 部署对应的 git commit 时间（UTC ISO Z）
    //   dataJsIds: ["k1", "k2", ..., "k626"]     // 当次部署 data.js 收录的所有 KP id
    // }
    // 清除同时满足以下两个条件的 kp.added 条目：
    //   (1) updatedAt <= beforeTime   — overlay 产生于本次 commit 之前
    //   (2) id ∈ dataJsIds             — 这次部署的 data.js 里有同 id（权威版已 commit）
    // 不满足 (2) = pure-add（data.js 没有），保留 —— 这是用户加的新 KP，overlay 是唯一副本。
    // 同步清理 kp.deleted 里对应 id（编辑器 /delta/kp/update 双写，必须配对清）。
    if (pathname === '/delta/kp/purge-stale') {
      if (!body.beforeTime) {
        return jsonResponse({ error: 'beforeTime (ISO string) is required' }, 400);
      }
      if (!Array.isArray(body.dataJsIds)) {
        return jsonResponse({ error: 'dataJsIds (array) is required' }, 400);
      }
      const beforeTime = body.beforeTime;
      const dataJsIdSet = new Set(body.dataJsIds);
      const staleIds = [];
      delta.kp.added = delta.kp.added.filter(e => {
        const isStale =
          e.updatedAt && e.updatedAt <= beforeTime && dataJsIdSet.has(e.id);
        if (isStale) staleIds.push(e.id);
        return !isStale;
      });
      if (staleIds.length) {
        const staleSet = new Set(staleIds);
        delta.kp.deleted = delta.kp.deleted.filter(id => !staleSet.has(id));
      }
      await saveDelta(env, delta);
      return jsonResponse({
        success: true,
        purgedAddedCount: staleIds.length,
        purgedIds: staleIds,
        beforeTime,
        dataJsIdCount: body.dataJsIds.length,
      });
    }

    // POST /delta/kp/translate — 翻译单个 KP 为日文
    // body: { title, body }（或 { id }，会从 delta 找）
    if (pathname === '/delta/kp/translate') {
      if (!body.title || !body.body) {
        return jsonResponse({ error: 'title 和 body 为必填' }, 400);
      }
      const result = await callClaudeTranslate(env, body.title, body.body);
      if (result.error) return jsonResponse({ error: result.error }, 500);
      // 保存到 delta.kp.ja（key = 标题去掉括号部分）
      const jaKey = _kpJaKey(body.title);
      // 拼接成与 DATA_JA 兼容的格式：<strong>日文标题</strong>日文body
      const jaFull = '<strong>' + result.jaTitle + '</strong>' + result.jaBody;
      delta.kp.ja[jaKey] = jaFull;
      await saveDelta(env, delta);
      return jsonResponse({
        success: true,
        jaKey: jaKey,
        jaTitle: result.jaTitle,
        jaBody: result.jaBody,
        ja: jaFull
      });
    }

    // POST /delta/kp/translate-all — 批量翻译（流式进度）
    // body: { knowledge: [{id, title, body}], skipExisting: true }
    // 注意：此接口可能超时，前端应分批调用或串行调用 /delta/kp/translate
    if (pathname === '/delta/kp/translate-all') {
      if (!Array.isArray(body.knowledge)) {
        return jsonResponse({ error: 'knowledge 数组必填' }, 400);
      }
      const results = [];
      let translated = 0, skipped = 0, failed = 0;
      const limit = Math.min(body.knowledge.length, body.limit || 20);  // 单次最多 20 个避免超时
      for (let i = 0; i < limit; i++) {
        const kn = body.knowledge[i];
        if (!kn || !kn.title || !kn.body) { skipped++; continue; }
        const jaKey = _kpJaKey(kn.title);
        if (body.skipExisting && delta.kp.ja[jaKey]) { skipped++; continue; }
        const result = await callClaudeTranslate(env, kn.title, kn.body);
        if (result.error) {
          failed++;
          results.push({ id: kn.id, title: kn.title, error: result.error });
        } else {
          const jaFull = '<strong>' + result.jaTitle + '</strong>' + result.jaBody;
          delta.kp.ja[jaKey] = jaFull;
          translated++;
          results.push({ id: kn.id, title: kn.title, jaKey: jaKey, ok: true });
        }
      }
      await saveDelta(env, delta);
      return jsonResponse({
        success: true,
        translated: translated,
        skipped: skipped,
        failed: failed,
        processed: limit,
        total: body.knowledge.length,
        results: results
      });
    }

    // POST /delta/scholar/add
    if (pathname === '/delta/scholar/add') {
      if (!body.key || !body.name) return jsonResponse({ error: 'key和name为必填' }, 400);
      // 若该 key 之前在 deleted 列表中（曾删除过），先从黑名单移除以使新增生效
      if (delta.scholar.deleted && delta.scholar.deleted.includes(body.key)) {
        delta.scholar.deleted = delta.scholar.deleted.filter(k => k !== body.key);
      }
      delta.scholar.added[body.key] = {
        name: body.name, en: body.en || '', nationality: body.nationality || '',
        affiliation: body.affiliation || '', field: body.field || '',
        schools: body.schools || [], contribution: body.contribution || ''
      };
      await saveDelta(env, delta);
      return jsonResponse({ success: true, key: body.key });
    }

    // POST /delta/scholar/delete
    if (pathname === '/delta/scholar/delete') {
      if (!body.key) return jsonResponse({ error: 'key is required' }, 400);
      if (delta.scholar.added[body.key]) {
        delete delta.scholar.added[body.key];
      } else {
        if (!delta.scholar.deleted.includes(body.key)) delta.scholar.deleted.push(body.key);
      }
      await saveDelta(env, delta);
      return jsonResponse({ success: true });
    }

    // POST /delta/school/add
    if (pathname === '/delta/school/add') {
      if (!body.key || !body.title) return jsonResponse({ error: 'key和title为必填' }, 400);
      // 若该 key 之前在 deleted 列表中（曾删除过），先从黑名单移除
      if (delta.school.deleted && delta.school.deleted.includes(body.key)) {
        delta.school.deleted = delta.school.deleted.filter(k => k !== body.key);
      }
      // 编辑模式（覆盖现有）：保留原 concepts/who 数组，避免被空数组覆盖
      const existing = delta.school.added[body.key] || {};
      delta.school.added[body.key] = {
        title: body.title, en: body.en || '', accent: body.accent || '#007AFF',
        group: body.group || 1, summary: body.summary || '',
        ja: body.ja || '',
        influence: body.influence || '',
        context: body.context || '',
        concepts: existing.concepts || [],
        who: existing.who || []
      };
      await saveDelta(env, delta);
      return jsonResponse({ success: true, key: body.key });
    }

    // POST /delta/school/delete
    if (pathname === '/delta/school/delete') {
      if (!body.key) return jsonResponse({ error: 'key is required' }, 400);
      if (delta.school.added[body.key]) {
        delete delta.school.added[body.key];
      } else {
        if (!delta.school.deleted.includes(body.key)) delta.school.deleted.push(body.key);
      }
      await saveDelta(env, delta);
      return jsonResponse({ success: true });
    }

    // POST /delta/order — 保存自定义排序
    if (pathname === '/delta/order') {
      if (!body.key || !body.ids || !Array.isArray(body.ids)) {
        return jsonResponse({ error: 'key和ids数组为必填' }, 400);
      }
      if (!delta.order) delta.order = {};
      delta.order[body.key] = body.ids;
      await saveDelta(env, delta);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unknown delta endpoint' }, 404);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
