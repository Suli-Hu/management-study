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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
