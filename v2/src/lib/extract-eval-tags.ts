/**
 * extract-eval-tags.ts — 从 body 末尾抽取评价段落（◆意义—...◆局限—...）
 *
 * 移植自 prototype school-options.jsx:96-125（一字不差的语义）。
 *
 * v0.5.0 之后这个函数**只在一次性迁移脚本里用一次**——
 * 把 516 个 KP body 里的评价段落抽到 eval_content_json 列。
 * 运行时代码不再有 fallback 分支。
 *
 * 设计要点：
 * 1. label 必须**精确等于**白名单中的 canonical 名（trim 后），避免把 flat-list
 *    item 名（如 "通用人力资本"）的子串"用"误判为评价 glyph。
 *    （数据观察：514 个 KP 中真实评价 label 全部是「意义/意義/局限/限界/例子/事例/应对/応対/应用/応用/比喻/喩」12 种 canonical 形式之一）
 * 2. 必须出现在末尾连续段——从最后往前扫，遇到非评价就停
 *    （保护"前文是 flat-list、末尾是评价"的混排）
 */

import { EVAL_TAG_DEFS, EVAL_LABEL_WHITELIST, type EvalContent, type EvalGlyph } from './eval-tag-defs';

export interface ExtractResult {
  /** body 去掉评价段后的纯主体内容（已 trim 末尾的 <br>/冒号/破折号） */
  cleanBody: string;
  /** 抽出来的评价 dict（glyph → 文本） */
  evalContent: EvalContent;
}

/**
 * 解析 body，把末尾连续的 `◆XX—...` 评价段抽成 dict。
 * 老 body 中的评价段是 HTML 文本（含 `<br>` `<strong>` 等），原样保留进 evalContent。
 */
export function extractEvalTags(body: string | null | undefined): ExtractResult {
  if (!body) return { cleanBody: body ?? '', evalContent: {} };

  const re = /◆\s*([^—:：\n<]+?)(?:——|—|：|:)\s*([\s\S]*?)(?=(?:◆|<br\s*\/?>\s*◆|$))/g;
  type Seg = { start: number; end: number; label: string; text: string; isEval: boolean };
  const all: Seg[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const label = m[1].trim();
    const isEval = EVAL_LABEL_WHITELIST.includes(label);
    all.push({
      start: m.index,
      end: m.index + m[0].length,
      label,
      text: m[2].trim().replace(/(?:<br\s*\/?>)+\s*$/i, ''),
      isEval,
    });
  }
  if (all.length === 0) return { cleanBody: body, evalContent: {} };

  // 从尾向前扫，遇到非评价就停 — "末尾连续评价段"
  let cutFrom = body.length;
  const evalContent: EvalContent = {};
  for (let i = all.length - 1; i >= 0; i--) {
    if (!all[i].isEval) break;
    cutFrom = all[i].start;
    const def = EVAL_TAG_DEFS.find((d) => d.matches.includes(all[i].label));
    if (def) {
      // 同一 glyph 多次出现（罕见）→ 后写覆盖前写。如果以后要保留多份，改成数组。
      evalContent[def.glyph] = all[i].text;
    }
  }

  // 没匹配到任何 def（label 命中但 def 没找到，理论上不应发生） → 视为无评价
  if (Object.keys(evalContent).length === 0) return { cleanBody: body, evalContent: {} };

  let cleanBody = body.slice(0, cutFrom);
  cleanBody = cleanBody.replace(/(?:\s*<br\s*\/?>\s*)+$/i, '').replace(/[：:]\s*$/, '').trim();

  return { cleanBody, evalContent };
}

/** 检查一个 glyph 是否在 EvalContent 中有非空内容 */
export function hasEvalContent(content: EvalContent | null | undefined, glyph: EvalGlyph): boolean {
  return Boolean(content?.[glyph]?.trim());
}

/** 已填写评价标签的数量（UI counter 用） */
export function countFilledEvals(content: EvalContent | null | undefined): number {
  if (!content) return 0;
  return Object.values(content).filter((v) => v?.trim()).length;
}
